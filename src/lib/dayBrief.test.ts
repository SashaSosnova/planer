import { describe, expect, it } from 'vitest'
import type { DayStats } from './dayStats'
import { dayBrief } from './dayBrief'

function day(partial: Partial<DayStats>): DayStats {
  return {
    date: '2026-07-15',
    label: 'Вт',
    meals: [],
    totals: { kcal: 0, protein: 0, fat: 0, carbs: 0 },
    vegGrams: 0,
    approximate: false,
    hasData: true,
    ...partial,
  }
}

describe('dayBrief', () => {
  it('returns null for empty days', () => {
    expect(dayBrief(day({ hasData: false }), 1800)).toBeNull()
  })

  it('stays quiet when there is a note but no meals', () => {
    expect(dayBrief(day({ noteText: 'Было сложно' }), 1800)).toBeNull()
  })

  it('describes kcal vs goal softly', () => {
    expect(
      dayBrief(
        day({
          meals: [
            {
              id: '1',
              date: '2026-07-15',
              mealType: 'lunch',
              rawText: 'x',
              items: [],
              totals: { kcal: 1700, protein: 0, fat: 0, carbs: 0 },
              isApproximate: false,
              eatingOut: false,
              createdAt: 1,
            },
          ],
          totals: { kcal: 1700, protein: 0, fat: 0, carbs: 0 },
        }),
        1800,
      ),
    ).toBe('1700 ккал · около цели')
  })
})
