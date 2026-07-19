import { describe, expect, it } from 'vitest'
import type { AppData, Meal } from '../types'
import { buildTodayTimeline, buildWeekStats, statsForDate } from './dayStats'

function meal(partial: Partial<Meal> & Pick<Meal, 'id' | 'date'>): Meal {
  return {
    mealType: 'lunch',
    rawText: 'тест',
    items: [],
    totals: { kcal: 100, protein: 10, fat: 5, carbs: 8 },
    isApproximate: false,
    eatingOut: false,
    createdAt: 1,
    ...partial,
  }
}

const empty: AppData = {
  foods: [],
  meals: [],
  weights: [],
  measurements: [],
  steps: [],
}

describe('statsForDate', () => {
  it('sums meals for the date and sorts by createdAt', () => {
    const data: AppData = {
      ...empty,
      meals: [
        meal({ id: 'b', date: '2026-07-15', createdAt: 2, totals: { kcal: 200, protein: 0, fat: 0, carbs: 0 } }),
        meal({ id: 'a', date: '2026-07-15', createdAt: 1, totals: { kcal: 100, protein: 0, fat: 0, carbs: 0 } }),
        meal({ id: 'c', date: '2026-07-14', createdAt: 1, totals: { kcal: 999, protein: 0, fat: 0, carbs: 0 } }),
      ],
      weights: [{ id: 'w', date: '2026-07-15', kg: 60, createdAt: 1 }],
      steps: [{ id: 's', date: '2026-07-15', count: 5000, createdAt: 1 }],
    }
    const day = statsForDate(data, '2026-07-15')
    expect(day.meals.map((m) => m.id)).toEqual(['a', 'b'])
    expect(day.totals.kcal).toBe(300)
    expect(day.weightKg).toBe(60)
    expect(day.steps).toBe(5000)
    expect(day.approximate).toBe(false)
  })

  it('marks approximate when eating out', () => {
    const data: AppData = {
      ...empty,
      meals: [meal({ id: '1', date: '2026-07-15', eatingOut: true })],
    }
    expect(statsForDate(data, '2026-07-15').approximate).toBe(true)
  })

  it('sums vegetable grams from meal items', () => {
    const data: AppData = {
      ...empty,
      meals: [
        meal({
          id: '1',
          date: '2026-07-15',
          items: [
            {
              name: 'огурец',
              grams: 120,
              kcal: 0,
              protein: 0,
              fat: 0,
              carbs: 0,
              source: 'estimate',
            },
            {
              name: 'курица',
              grams: 100,
              kcal: 0,
              protein: 0,
              fat: 0,
              carbs: 0,
              source: 'estimate',
            },
          ],
        }),
      ],
    }
    expect(statsForDate(data, '2026-07-15').vegGrams).toBe(120)
  })
})

describe('buildWeekStats', () => {
  it('aggregates week totals and weight delta', () => {
    const data: AppData = {
      ...empty,
      meals: [
        meal({ id: '1', date: '2026-07-13', totals: { kcal: 100, protein: 0, fat: 0, carbs: 0 } }),
        meal({ id: '2', date: '2026-07-15', totals: { kcal: 200, protein: 0, fat: 0, carbs: 0 } }),
      ],
      weights: [
        { id: 'w1', date: '2026-07-13', kg: 61, createdAt: 1 },
        { id: 'w2', date: '2026-07-17', kg: 60.5, createdAt: 2 },
      ],
      steps: [
        { id: 's1', date: '2026-07-13', count: 4000, createdAt: 1 },
        { id: 's2', date: '2026-07-14', count: 6000, createdAt: 2 },
      ],
    }
    // 2026-07-13 is Monday
    const week = buildWeekStats(data, '2026-07-13', 1800)
    expect(week.totals.kcal).toBe(300)
    expect(week.kcalGoal).toBe(1800 * 7)
    expect(week.weightStart).toBe(61)
    expect(week.weightEnd).toBe(60.5)
    expect(week.weightDelta).toBe(-0.5)
    expect(week.avgSteps).toBe(5000)
  })
})

describe('buildTodayTimeline', () => {
  it('shows completed prior weeks only', () => {
    const data: AppData = {
      ...empty,
      meals: [
        meal({ id: 'old', date: '2026-07-06', totals: { kcal: 50, protein: 0, fat: 0, carbs: 0 } }),
        meal({ id: 'cur', date: '2026-07-14', totals: { kcal: 80, protein: 0, fat: 0, carbs: 0 } }),
      ],
    }
    const tl = buildTodayTimeline(data, 1800, '2026-07-15')
    expect(tl.today.date).toBe('2026-07-15')
    expect(tl.recentDays.some((d) => d.date === '2026-07-14')).toBe(true)
    expect(tl.completedWeeks.some((w) => w.weekStart === '2026-07-06')).toBe(true)
    expect(tl.completedWeeks.some((w) => w.weekStart === '2026-07-13')).toBe(false)
  })
})
