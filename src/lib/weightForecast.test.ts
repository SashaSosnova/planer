import { describe, expect, it } from 'vitest'
import {
  analyzeCalorieWeightResponse,
  computeWeightForecast,
  energyWeeklyRate,
  estimateNextMorning,
  pickForwardRate,
  recentScaleWeeklyRate,
  robustWeeklyRate,
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

describe('estimateNextMorning', () => {
  it('maps yesterday deficit vs maintain to negative delta', () => {
    const est = estimateNextMorning({
      weights: [{ id: 'w', date: '2026-07-15', kg: 64.3, createdAt: 1 }],
      meals: [meal('2026-07-14', 1230)],
      maintainKcal: 2000,
      today: '2026-07-15',
    })
    expect(est).not.toBeNull()
    expect(est!.yesterday).toBe('2026-07-14')
    expect(est!.yesterdayKcal).toBe(1230)
    expect(est!.baseKg).toBe(64.3)
    // (1230 - 2000) / 7700 ≈ -0.1
    expect(est!.expectedDeltaKg).toBeCloseTo(-0.1, 1)
    expect(est!.expectedKg).toBeCloseTo(64.2, 1)
  })

  it('returns null when yesterday has no meals', () => {
    expect(
      estimateNextMorning({
        weights: [{ id: 'w', date: '2026-07-15', kg: 64, createdAt: 1 }],
        meals: [meal('2026-07-15', 1500)],
        maintainKcal: 2000,
        today: '2026-07-15',
      }),
    ).toBeNull()
  })

  it('returns null without maintain or weight', () => {
    expect(
      estimateNextMorning({
        weights: [{ id: 'w', date: '2026-07-15', kg: 64, createdAt: 1 }],
        meals: [meal('2026-07-14', 1500)],
        maintainKcal: 0,
        today: '2026-07-15',
      }),
    ).toBeNull()
    expect(
      estimateNextMorning({
        weights: [],
        meals: [meal('2026-07-14', 1500)],
        maintainKcal: 2000,
        today: '2026-07-15',
      }),
    ).toBeNull()
  })
})

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

describe('robustWeeklyRate / pickForwardRate', () => {
  it('drops water-like outliers from the median', () => {
    expect(robustWeeklyRate([-0.3, -0.4, -3.15])).toBeCloseTo(-0.3, 1)
    expect(robustWeeklyRate([-3.15, -3.0])).toBeNull()
  })

  it('prefers observed deficit rate over energy and scale spikes', () => {
    expect(
      pickForwardRate({
        onPlanRate: -0.3,
        energyRate: -0.25,
        goalImpliedRate: -0.14,
        weeklyRateKg: -0.2,
      }),
    ).toBe(-0.3)

    expect(
      pickForwardRate({
        onPlanRate: null,
        energyRate: -0.27,
        goalImpliedRate: -0.14,
      }),
    ).toBe(-0.27)

    expect(
      pickForwardRate({
        onPlanRate: null,
        energyRate: null,
        goalImpliedRate: -0.14,
      }),
    ).toBe(-0.14)
  })

  it('keeps recentScaleWeeklyRate helper for short windows', () => {
    const recent = recentScaleWeeklyRate(
      [
        { id: 'a', date: '2026-08-02', kg: 63.9, createdAt: 1 },
        { id: 'b', date: '2026-08-05', kg: 63.4, createdAt: 2 },
        { id: 'c', date: '2026-08-09', kg: 62.9, createdAt: 3 },
      ],
      '2026-08-09',
      10,
    )
    expect(recent).not.toBeNull()
    expect(recent!).toBeLessThanOrEqual(-0.5)
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

  it('limits to daysBack window', () => {
    const meals = [
      ...Array.from({ length: 7 }, (_, i) =>
        meal(`2026-06-${String(i + 1).padStart(2, '0')}`, 2500),
      ),
      ...Array.from({ length: 7 }, (_, i) =>
        meal(`2026-07-${String(i + 1).padStart(2, '0')}`, 1500),
      ),
    ]
    const { rate, mealDays } = energyWeeklyRate(meals, [], 2000, '2026-07-07', 7)
    expect(mealDays).toBe(7)
    expect(rate).toBeCloseTo(-0.5, 1)
  })
})

describe('analyzeCalorieWeightResponse', () => {
  it('contrasts deficit vs overeating intervals and trims outliers', () => {
    const weights = [
      { id: '1', date: '2026-06-01', kg: 70, createdAt: 1 },
      { id: '2', date: '2026-06-08', kg: 69.3, createdAt: 2 },
      { id: '3', date: '2026-06-15', kg: 69.5, createdAt: 3 },
      { id: '4', date: '2026-06-22', kg: 68.8, createdAt: 4 },
      { id: '5', date: '2026-06-29', kg: 69.2, createdAt: 5 },
      // Water rebound outlier between deficit days
      { id: '6', date: '2026-07-01', kg: 68.3, createdAt: 6 },
    ]
    const meals: Meal[] = []
    for (let d = 1; d <= 7; d++) meals.push(meal(`2026-06-${String(d).padStart(2, '0')}`, 1300))
    for (let d = 8; d <= 14; d++) meals.push(meal(`2026-06-${String(d).padStart(2, '0')}`, 2200))
    for (let d = 15; d <= 21; d++) meals.push(meal(`2026-06-${String(d).padStart(2, '0')}`, 1300))
    for (let d = 22; d <= 28; d++) meals.push(meal(`2026-06-${String(d).padStart(2, '0')}`, 2200))
    for (let d = 29; d <= 30; d++) meals.push(meal(`2026-06-${String(d).padStart(2, '0')}`, 1300))
    meals.push(meal('2026-07-01', 1300))

    const resp = analyzeCalorieWeightResponse(weights, meals, 1350, {
      maintainKcal: 2000,
      today: '2026-07-01',
    })
    expect(resp.onPlanN).toBeGreaterThanOrEqual(2)
    expect(resp.overN).toBeGreaterThanOrEqual(2)
    expect(resp.onPlanRate).not.toBeNull()
    expect(resp.overRate).not.toBeNull()
    expect(resp.onPlanRate!).toBeLessThan(resp.overRate!)
    // −3.15 kg/week water drop must not dominate
    expect(resp.onPlanRate!).toBeGreaterThan(-1.2)
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
      dailyKcalGoal: 1600,
      today: '2026-06-22',
      cycleLengthDays: 28,
      periodLengthDays: 5,
    })
    expect(forecast).not.toBeNull()
    expect(forecast!.startKg).toBe(70)
    expect(forecast!.currentKg).toBe(68.5)
    expect(forecast!.weeklyRateKg).not.toBeNull()
    expect(forecast!.energyRateKg).not.toBeNull()
    expect(forecast!.summary).toMatch(/дефицит|за неделю|до цели/)
    expect(forecast!.summary).not.toMatch(/ещё \d/)
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

  it('projects from deficit intervals and mentions overeating contrast', () => {
    const weights = [
      { id: '1', date: '2026-06-01', kg: 70, createdAt: 1 },
      { id: '2', date: '2026-06-08', kg: 69.3, createdAt: 2 },
      { id: '3', date: '2026-06-15', kg: 69.5, createdAt: 3 },
      { id: '4', date: '2026-06-22', kg: 68.8, createdAt: 4 },
      { id: '5', date: '2026-06-29', kg: 69.2, createdAt: 5 },
    ]
    const meals: Meal[] = []
    for (let d = 1; d <= 7; d++) meals.push(meal(`2026-06-${String(d).padStart(2, '0')}`, 1300))
    for (let d = 8; d <= 14; d++) meals.push(meal(`2026-06-${String(d).padStart(2, '0')}`, 2200))
    for (let d = 15; d <= 21; d++) meals.push(meal(`2026-06-${String(d).padStart(2, '0')}`, 1300))
    for (let d = 22; d <= 28; d++) meals.push(meal(`2026-06-${String(d).padStart(2, '0')}`, 2200))

    const forecast = computeWeightForecast({
      weights,
      meals,
      targetKg: 65,
      maintainKcal: 2000,
      dailyKcalGoal: 1350,
      today: '2026-06-29',
    })
    expect(forecast!.summary).toMatch(/дефицит/)
    expect(forecast!.summary).toMatch(/за неделю/)
    expect(forecast!.summary).toMatch(/переедании/)
    expect(forecast!.onPlanRateKg).not.toBeNull()
    expect(forecast!.overRateKg).not.toBeNull()
    expect(forecast!.inOneWeek).toBe(
      Math.round((forecast!.currentKg + forecast!.onPlanRateKg!) * 100) / 100,
    )
  })

  it('falls back to energy when deficit intervals are missing', () => {
    const weights = [
      { id: '1', date: '2026-08-01', kg: 64, createdAt: 1 },
      { id: '2', date: '2026-08-09', kg: 63.5, createdAt: 2 },
    ]
    // Only one short interval with meals — not enough for robust on-plan (≥2).
    const meals = Array.from({ length: 9 }, (_, i) =>
      meal(`2026-08-${String(i + 1).padStart(2, '0')}`, 1400),
    )
    const forecast = computeWeightForecast({
      weights,
      meals,
      maintainKcal: 1800,
      dailyKcalGoal: 1400,
      targetKg: 60,
      today: '2026-08-09',
    })
    expect(forecast!.onPlanRateKg).toBeNull()
    expect(forecast!.energyRateKg).not.toBeNull()
    expect(forecast!.summary).toMatch(/дефицит|за неделю/)
    // Forward should follow energy (~−0.4), not raw scale (−0.5 over 8 days ≈ −0.4)
    expect(forecast!.inOneWeek).toBeCloseTo(
      forecast!.currentKg + (forecast!.energyRateKg ?? 0),
      1,
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
