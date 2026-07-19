import { describe, expect, it } from 'vitest'
import {
  computeWeightForecast,
  energyWeeklyRate,
  scaleWeeklyRate,
} from './weightForecast'
import type { Meal } from '../types'

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

describe('scaleWeeklyRate', () => {
  it('estimates loss from weekly weigh-ins', () => {
    const { rate } = scaleWeeklyRate([
      { id: '1', date: '2026-06-01', kg: 70, createdAt: 1 },
      { id: '2', date: '2026-06-08', kg: 69.5, createdAt: 2 },
      { id: '3', date: '2026-06-15', kg: 69, createdAt: 3 },
      { id: '4', date: '2026-06-22', kg: 68.5, createdAt: 4 },
    ])
    expect(rate).toBeCloseTo(-0.5, 1)
  })
})

describe('energyWeeklyRate', () => {
  it('derives weekly kg from deficit vs maintain', () => {
    const meals = Array.from({ length: 7 }, (_, i) =>
      meal(`2026-07-${String(i + 1).padStart(2, '0')}`, 1500),
    )
    const { rate, mealDays } = energyWeeklyRate(meals, [], 2000, '2026-07-07')
    expect(mealDays).toBe(7)
    // (1500-2000)*7/7700 ≈ -0.45
    expect(rate).toBeCloseTo(-0.5, 1)
  })
})

describe('computeWeightForecast', () => {
  it('returns null without weights', () => {
    expect(computeWeightForecast([])).toBeNull()
  })

  it('blends scale and energy and adds soft notes', () => {
    const forecast = computeWeightForecast({
      weights: [
        { id: '1', date: '2026-06-01', kg: 70, createdAt: 1 },
        { id: '2', date: '2026-06-08', kg: 69.5, createdAt: 2 },
        { id: '3', date: '2026-06-15', kg: 69, createdAt: 3 },
        { id: '4', date: '2026-06-22', kg: 68.5, createdAt: 4 },
      ],
      meals: Array.from({ length: 14 }, (_, i) => {
        const day = i + 1
        const date =
          day <= 30
            ? `2026-06-${String(day).padStart(2, '0')}`
            : `2026-07-${String(day - 30).padStart(2, '0')}`
        return meal(date, 1600)
      }),
      steps: Array.from({ length: 14 }, (_, i) => ({
        id: `s${i}`,
        date: `2026-06-${String(i + 1).padStart(2, '0')}`,
        count: 9000,
        createdAt: 1,
      })),
      checkIns: [
        { id: 'c1', date: '2026-06-20', sleepHours: 5.5, createdAt: 1 },
        { id: 'c2', date: '2026-06-21', sleepHours: 5, createdAt: 1 },
        { id: 'c3', date: '2026-06-22', sleepHours: 6, createdAt: 1 },
      ],
      periodStarts: [{ id: 'p1', date: '2026-06-05', createdAt: 1 }],
      measurements: [
        { id: 'm1', date: '2026-06-01', waist: 75, createdAt: 1 },
        { id: 'm2', date: '2026-06-22', waist: 73, createdAt: 1 },
      ],
      targetKg: 65,
      maintainKcal: 2000,
      today: '2026-06-22',
      cycleLengthDays: 28,
      periodLengthDays: 5,
    })
    expect(forecast).not.toBeNull()
    expect(forecast!.weeklyRateKg).not.toBeNull()
    expect(forecast!.energyRateKg).not.toBeNull()
    expect(forecast!.summary).toMatch(/весы|калории/i)
    expect(forecast!.notes.length).toBeGreaterThan(0)
  })

  it('keeps legacy two-arg API', () => {
    const forecast = computeWeightForecast(
      [{ id: '1', date: '2026-07-01', kg: 64, createdAt: 1 }],
      60,
    )
    expect(forecast!.weeklyRateKg).toBeNull()
    expect(forecast!.notes).toEqual([])
  })
})
