import { toIsoDate } from './date'

/** Monday 00:00 local of the week containing `date`. */
export function mondayOf(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const day = d.getDay() // 0 Sun … 6 Sat
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  d.setDate(d.getDate() + days)
  return d
}

export function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

export function weekStartIso(isoDate: string): string {
  return toIsoDate(mondayOf(parseIsoDate(isoDate)))
}

export function weekEndIso(weekStart: string): string {
  return toIsoDate(addDays(parseIsoDate(weekStart), 6))
}

export function isoDatesInWeek(weekStart: string): string[] {
  const start = parseIsoDate(weekStart)
  return Array.from({ length: 7 }, (_, i) => toIsoDate(addDays(start, i)))
}

/** Week is complete once the calendar day after Sunday has begun. */
export function isWeekComplete(weekStart: string, todayIso: string): boolean {
  const sunday = weekEndIso(weekStart)
  return todayIso > sunday
}

export function formatWeekRange(weekStart: string): string {
  const start = parseIsoDate(weekStart)
  const end = addDays(start, 6)
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }
  return `${start.toLocaleDateString('ru-RU', opts)} – ${end.toLocaleDateString('ru-RU', opts)}`
}

export function shortRuWeekday(iso: string): string {
  return parseIsoDate(iso).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric' })
}
