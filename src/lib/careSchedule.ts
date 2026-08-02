import type { CareDayEntry, CareProduct, CareSlot, CareSkinTags, CareWeekday } from '../types'
import { CARE_WEEKDAY_ORDER, careWeekdayFromDate } from './careRoutine'
import { hasCareSkinTags } from './careSkin'
import { CARE_SLOT_ORDER } from './seedCareProducts'

export function parseIsoDate(iso: string): Date | null {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return null
  const dt = new Date(y, m - 1, d)
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null
  return dt
}

export function careWeekdayFromIso(iso: string): CareWeekday {
  const dt = parseIsoDate(iso)
  return careWeekdayFromDate(dt ?? new Date())
}

/** Monday–Sunday ISO dates for the week containing `iso`. */
export function weekDatesContaining(iso: string): string[] {
  const dt = parseIsoDate(iso)
  if (!dt) return []
  const day = dt.getDay() // 0=Sun
  const mondayOffset = day === 0 ? -6 : 1 - day
  const monday = new Date(dt)
  monday.setDate(dt.getDate() + mondayOffset)
  const out: string[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    const y = d.getFullYear()
    const mo = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    out.push(`${y}-${mo}-${dd}`)
  }
  return out
}

export function productScheduledOn(product: CareProduct, weekday: CareWeekday): boolean {
  if (product.archived) return false
  if (product.days === 'every') return true
  return product.days.includes(weekday)
}

export function productInSlot(product: CareProduct, slot: CareSlot): boolean {
  return product.slots.includes(slot)
}

/** Active products scheduled for a weekday + slot, sorted. */
export function productsForDaySlot(
  products: CareProduct[],
  weekday: CareWeekday,
  slot: CareSlot,
): CareProduct[] {
  const order = CARE_SLOT_ORDER[slot]
  return products
    .filter((p) => !p.archived && productInSlot(p, slot) && productScheduledOn(p, weekday))
    .slice()
    .sort((a, b) => {
      const ia = order.indexOf(a.id)
      const ib = order.indexOf(b.id)
      if (ia >= 0 || ib >= 0) return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib)
      return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'ru')
    })
}

export function activeCareProducts(products: CareProduct[]): CareProduct[] {
  return products
    .filter((p) => !p.archived)
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'ru'))
}

export function hasCareSkin(skin: CareSkinTags | undefined): boolean {
  return hasCareSkinTags(skin)
}

export function isCareDayEmpty(
  entry: Pick<CareDayEntry, 'morning' | 'evening' | 'skin' | 'note'>,
): boolean {
  return (
    entry.morning.length === 0 &&
    entry.evening.length === 0 &&
    !hasCareSkinTags(entry.skin) &&
    !entry.note?.trim()
  )
}

/** Whether product was checked on that date for its scheduled slots. */
export function productCheckedOnDay(
  product: CareProduct,
  day: CareDayEntry | undefined,
  weekday: CareWeekday,
): { morning?: boolean; evening?: boolean; any: boolean } {
  if (!productScheduledOn(product, weekday)) {
    return { any: false }
  }
  const scheduledMorning = productInSlot(product, 'morning')
  const scheduledEvening = productInSlot(product, 'evening')
  const morning = scheduledMorning ? Boolean(day?.morning.includes(product.id)) : undefined
  const evening = scheduledEvening ? Boolean(day?.evening.includes(product.id)) : undefined
  return {
    ...(scheduledMorning ? { morning } : {}),
    ...(scheduledEvening ? { evening } : {}),
    any: Boolean(morning) || Boolean(evening),
  }
}

export function eveningTitleForWeekday(weekday: CareWeekday): string {
  if (weekday === 'sat') return 'BHA, без Caramel'
  if (weekday === 'sun') return 'Маска Revital'
  return 'Caramel, без BHA'
}

export function formatCareDaysLabel(days: CareProduct['days']): string {
  if (days === 'every') return 'Каждый день'
  if (days.length === 0) return 'Нет дней'
  const set = new Set(days)
  const ordered = CARE_WEEKDAY_ORDER.filter((d) => set.has(d))
  const labels: Record<CareWeekday, string> = {
    mon: 'Пн',
    tue: 'Вт',
    wed: 'Ср',
    thu: 'Чт',
    fri: 'Пт',
    sat: 'Сб',
    sun: 'Вс',
  }
  if (
    ordered.length === 5 &&
    ordered.every((d, i) => d === (['mon', 'tue', 'wed', 'thu', 'fri'] as CareWeekday[])[i])
  ) {
    return 'Пн–Пт'
  }
  return ordered.map((d) => labels[d]).join(', ')
}

export function formatCareSlotsLabel(slots: CareSlot[]): string {
  const hasM = slots.includes('morning')
  const hasE = slots.includes('evening')
  if (hasM && hasE) return 'Утро + вечер'
  if (hasM) return 'Утро'
  if (hasE) return 'Вечер'
  return '—'
}
