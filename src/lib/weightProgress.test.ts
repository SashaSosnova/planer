import { describe, expect, it } from 'vitest'
import type { AppData, Meal } from '../types'
import { buildWeightProgress, deltaVsYesterdayWeight } from './weightProgress'

const empty: AppData = {
  foods: [],
  meals: [],
  weights: [],
  measurements: [],
  steps: [],
  dayNotes: [],
  periodStarts: [],
  medDays: [],
  careProducts: [],
  careDays: [],
}

function meal(date: string, kcal: number): Meal {
  return {
    id: `m-${date}-${kcal}`,
    date,
    mealType: 'lunch',
    rawText: 'тест',
    items: [],
    totals: { kcal, protein: 20, fat: 10, carbs: 40 },
    isApproximate: false,
    eatingOut: false,
    createdAt: 1,
  }
}

describe('deltaVsYesterdayWeight', () => {
  it('compares today to calendar yesterday', () => {
    expect(
      deltaVsYesterdayWeight(
        [
          { id: '1', date: '2026-06-22', kg: 63.9, createdAt: 1 },
          { id: '2', date: '2026-06-23', kg: 63.7, createdAt: 2 },
        ],
        '2026-06-23',
      ),
    ).toBeCloseTo(-0.2, 1)
  })
})

describe('buildWeightProgress', () => {
  it('shows scale delta vs yesterday as hero, not absolute kg', () => {
    const weights = [
      { id: '1', date: '2026-06-01', kg: 70, createdAt: 1 },
      { id: '2', date: '2026-06-08', kg: 69.5, createdAt: 2 },
      { id: '3', date: '2026-06-15', kg: 69, createdAt: 3 },
      { id: '4', date: '2026-06-22', kg: 68.5, createdAt: 4 },
      { id: '5', date: '2026-06-23', kg: 68.3, createdAt: 5 },
    ]
    const meals = Array.from({ length: 22 }, (_, i) => {
      const date = `2026-06-${String(i + 1).padStart(2, '0')}`
      return meal(date, date === '2026-06-22' ? 1230 : 1600)
    })

    const progress = buildWeightProgress({
      data: { ...empty, weights, meals },
      today: '2026-06-23',
      maintainKcal: 2000,
      dailyKcalGoal: 1600,
      targetKg: 65,
    })

    expect(progress).not.toBeNull()
    expect(progress!.hero).toBe('−0,2 кг')
    expect(progress!.tone).toBe('down')
    expect(progress!.note).toMatch(/Вчера 1230 ккал/)
    expect(progress!.note).toMatch(/Темп|через неделю/)
    expect(progress!.hero).not.toMatch(/через неделю/)
  })

  it('falls back when there is no yesterday weigh-in', () => {
    const weights = [
      { id: '1', date: '2026-06-01', kg: 70, createdAt: 1 },
      { id: '2', date: '2026-06-08', kg: 69.5, createdAt: 2 },
      { id: '3', date: '2026-06-15', kg: 69, createdAt: 3 },
      { id: '4', date: '2026-06-22', kg: 68.5, createdAt: 4 },
    ]
    const meals = Array.from({ length: 21 }, (_, i) =>
      meal(`2026-06-${String(i + 1).padStart(2, '0')}`, 1600),
    )

    const progress = buildWeightProgress({
      data: { ...empty, weights, meals },
      today: '2026-06-23',
      maintainKcal: 2000,
      dailyKcalGoal: 1600,
      targetKg: 65,
    })

    expect(progress).not.toBeNull()
    // No weight on 23rd → compares latest (22nd) to previous weigh-in (15→22: −0,5)
    expect(progress!.hero).toBe('−0,5 кг')
    expect(progress!.note).toMatch(/Темп|через неделю/)
    expect(progress!.note).not.toMatch(/Вчера \d+ ккал/)
  })

  it('returns null without weights', () => {
    expect(
      buildWeightProgress({
        data: { ...empty, meals: [meal('2026-06-22', 1500)] },
        today: '2026-06-23',
        maintainKcal: 2000,
      }),
    ).toBeNull()
  })
})
