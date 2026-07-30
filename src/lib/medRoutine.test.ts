import { describe, expect, it } from 'vitest'
import {
  formatMedTakenAt,
  isMedDayEmpty,
  mgDoseKeyForMealType,
  medTakenAt,
} from './medRoutine'

describe('medRoutine', () => {
  it('maps meal types to magnesium doses', () => {
    expect(mgDoseKeyForMealType('breakfast')).toBe('mgBreakfast')
    expect(mgDoseKeyForMealType('lunch')).toBe('mgLunch')
    expect(mgDoseKeyForMealType('dinner')).toBe('mgDinner')
    expect(mgDoseKeyForMealType('snack')).toBeNull()
  })

  it('reads taken-at and emptiness', () => {
    const entry = {
      id: '1',
      date: '2026-07-30',
      ironAt: '2026-07-30T09:15:00.000Z',
      createdAt: 1,
      updatedAt: 1,
    }
    expect(medTakenAt(entry, 'iron')).toBe('2026-07-30T09:15:00.000Z')
    expect(medTakenAt(entry, 'mgBreakfast')).toBeUndefined()
    expect(isMedDayEmpty(entry)).toBe(false)
    expect(isMedDayEmpty({ })).toBe(true)
  })

  it('formats taken-at as local HH:MM', () => {
    expect(formatMedTakenAt(undefined)).toBe('')
    expect(formatMedTakenAt('not-a-date')).toBe('')
    expect(formatMedTakenAt('2026-07-30T12:05:00.000Z')).toMatch(/^\d{2}:\d{2}$/)
  })
})
