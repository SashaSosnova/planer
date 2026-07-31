import type { MealType, MedDayEntry } from '../types'

/** Dose keys stored on MedDayEntry (*At fields). */
export type MedDoseKey = 'iron' | 'mgBreakfast' | 'mgLunch' | 'mgDinner'

export type MedAtField = 'ironAt' | 'mgBreakfastAt' | 'mgLunchAt' | 'mgDinnerAt'

export const MED_DOSE_AT_FIELD: Record<MedDoseKey, MedAtField> = {
  iron: 'ironAt',
  mgBreakfast: 'mgBreakfastAt',
  mgLunch: 'mgLunchAt',
  mgDinner: 'mgDinnerAt',
}

export const MED_DOSE_KEYS: MedDoseKey[] = [
  'iron',
  'mgBreakfast',
  'mgLunch',
  'mgDinner',
]

/** Magnesium slot for breakfast/lunch/dinner; snack → null. */
export function mgDoseKeyForMealType(mealType: MealType): MedDoseKey | null {
  if (mealType === 'breakfast') return 'mgBreakfast'
  if (mealType === 'lunch') return 'mgLunch'
  if (mealType === 'dinner') return 'mgDinner'
  return null
}

export function medTakenAt(entry: MedDayEntry | undefined, dose: MedDoseKey): string | undefined {
  if (!entry) return undefined
  const field = MED_DOSE_AT_FIELD[dose]
  const v = entry[field]
  return typeof v === 'string' && v.trim() ? v : undefined
}

export function isMedDayEmpty(
  entry: Pick<MedDayEntry, 'ironAt' | 'mgBreakfastAt' | 'mgLunchAt' | 'mgDinnerAt'>,
): boolean {
  return !entry.ironAt && !entry.mgBreakfastAt && !entry.mgLunchAt && !entry.mgDinnerAt
}

/** Local time «HH:MM» from stored ISO, or empty. */
export function formatMedTakenAt(iso: string | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}
