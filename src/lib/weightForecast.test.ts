import { describe, expect, it } from 'vitest'
import {
  analyzeCalorieWeightResponse,
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
    expect(forecast!.startKg).toBe(70)
    expect(forecast!.currentKg).toBe(68.5)
    expect(forecast!.weeklyRateKg).not.toBeNull()
    expect(forecast!.energyRateKg).not.toBeNull()
    expect(forecast!.summary).toMatch(/Темп|через неделю|до цели|ещё/)
    expect(forecast!.summary).toMatch(/ещё \d/)
    expect(forecast!.inOneWeek).not.toBeNull()
    expect(forecast!.notes.length).toBeGreaterThan(0)
  })

  it('uses earliest diary weigh-in as startKg', () => {
    const forecast = computeWeightForecast({
      weights: [
        { id: 'new', date: '2026-07-20', kg: 63.6, createdAt: 3 },
        { id: 'old', date: '2026-01-24', kg: 69, createdAt: 1 },
        { id: 'mid', date: '2026-03-01', kg: 66, createdAt: 2 },
      ],
      targetKg: 55,
      today: '2026-07-20',
    })
    expect(forecast!.startKg).toBe(69)
    expect(forecast!.currentKg).toBe(63.6)
    expect(forecast!.targetKg).toBe(55)
  })

  it('contrasts on-plan vs over-goal intervals across the diary', () => {
    const weights = [
      { id: '1', date: '2026-06-01', kg: 70, createdAt: 1 },
      { id: '2', date: '2026-06-08', kg: 69.3, createdAt: 2 },
      { id: '3', date: '2026-06-15', kg: 69.5, createdAt: 3 },
      { id: '4', date: '2026-06-22', kg: 68.8, createdAt: 4 },
      { id: '5', date: '2026-06-29', kg: 69.2, createdAt: 5 },
    ]
    const meals: Meal[] = []
    // Week 1: on plan ~1350 → loss
    for (let d = 1; d <= 7; d++) meals.push(meal(`2026-06-${String(d).padStart(2, '0')}`, 1300))
    // Week 2: over → gain
    for (let d = 8; d <= 14; d++) meals.push(meal(`2026-06-${String(d).padStart(2, '0')}`, 1900))
    // Week 3: on plan → loss
    for (let d = 15; d <= 21; d++) meals.push(meal(`2026-06-${String(d).padStart(2, '0')}`, 1300))
    // Week 4: over → gain
    for (let d = 22; d <= 28; d++) meals.push(meal(`2026-06-${String(d).padStart(2, '0')}`, 1900))

    const resp = analyzeCalorieWeightResponse(weights, meals, 1350)
    expect(resp.onPlanN).toBeGreaterThanOrEqual(2)
    expect(resp.overN).toBeGreaterThanOrEqual(2)
    expect(resp.onPlanRate).not.toBeNull()
    expect(resp.overRate).not.toBeNull()
    expect(resp.onPlanRate!).toBeLessThan(resp.overRate!)

    const forecast = computeWeightForecast({
      weights,
      meals,
      targetKg: 65,
      maintainKcal: 2000,
      dailyKcalGoal: 1350,
      today: '2026-06-29',
    })
    expect(forecast!.summary).not.toMatch(/в цели|при переборе/)
    expect(forecast!.summary).toMatch(/Темп/)
    expect(forecast!.summary).toMatch(/через неделю/)
    expect(forecast!.onPlanRateKg).not.toBeNull()
    expect(forecast!.inOneWeek).toBe(
      Math.round((forecast!.currentKg + forecast!.onPlanRateKg!) * 10) / 10,
    )
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
