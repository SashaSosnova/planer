import { describe, expect, it } from 'vitest'
import type { AppData, Meal, StepsEntry, WeightEntry } from '../types'
import { buildFourWeekAnalysis } from './fourWeekAnalysis'
import { weekStartIso } from './week'

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

function weight(date: string, kg: number): WeightEntry {
  return { id: `w-${date}`, date, kg, createdAt: 1 }
}

function steps(date: string, count: number): StepsEntry {
  return { id: `s-${date}`, date, count, createdAt: 1 }
}

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y!, m! - 1, d! + n)
  const yy = dt.getFullYear()
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

describe('buildFourWeekAnalysis', () => {
  it('returns null without enough diary', () => {
    expect(
      buildFourWeekAnalysis({
        data: empty,
        dailyKcalGoal: 1400,
        today: '2026-08-24',
      }),
    ).toBeNull()
  })

  it('summarizes 4 weeks and suggests keeping the goal', () => {
    const start = '2026-07-28'
    const meals: Meal[] = []
    const weights: WeightEntry[] = []
    for (let i = 0; i < 28; i++) {
      const date = addDays(start, i)
      meals.push(meal(date, 1380))
      weights.push(weight(date, 65.4 - i * (3.2 / 27)))
    }

    const analysis = buildFourWeekAnalysis({
      data: { ...empty, meals, weights },
      dailyKcalGoal: 1387,
      maintainKcal: 1540,
      targetKg: 55,
      activity: 'light',
      today: '2026-08-24',
    })

    expect(analysis).not.toBeNull()
    expect(analysis!.loggedDays).toBe(22)
    expect(analysis!.weeks.map((w) => w.start)).toEqual([
      '2026-08-03',
      '2026-08-10',
      '2026-08-17',
      '2026-08-24',
    ])
    expect(analysis!.weeks.every((w) => w.start === weekStartIso(w.start))).toBe(true)
    expect(analysis!.avgKcal).toBe(1380)
    expect(analysis!.deltaKg).toBeLessThan(-2)
    expect(analysis!.actions.some((a) => a.id === 'keep-goal')).toBe(true)
    expect(analysis!.actions.some((a) => a.id === 'daily-noise')).toBe(true)
    expect(analysis!.actions.some((a) => a.id === 'eta')).toBe(false)
  })

  it('asks to raise sedentary activity when steps are high', () => {
    const start = '2026-07-28'
    const meals: Meal[] = []
    const weights: WeightEntry[] = []
    const stepRows: StepsEntry[] = []
    for (let i = 0; i < 28; i++) {
      const date = addDays(start, i)
      meals.push(meal(date, 1380))
      weights.push(weight(date, 65.4 - i * (3.2 / 27)))
      stepRows.push(steps(date, i % 5 === 0 ? 12000 : 6000))
    }

    const analysis = buildFourWeekAnalysis({
      data: { ...empty, meals, weights, steps: stepRows },
      dailyKcalGoal: 1387,
      maintainKcal: 1540,
      activity: 'sedentary',
      today: '2026-08-24',
    })

    expect(analysis?.actions.some((a) => a.id === 'activity' && a.go === 'profile')).toBe(
      true,
    )
  })

  it('flags incomplete logging', () => {
    const start = '2026-07-28'
    const meals: Meal[] = []
    const weights: WeightEntry[] = []
    for (let i = 0; i < 28; i++) {
      const date = addDays(start, i)
      weights.push(weight(date, 64 - i * 0.04))
      if (i % 2 === 0) meals.push(meal(date, 1400))
    }

    const analysis = buildFourWeekAnalysis({
      data: { ...empty, meals, weights },
      dailyKcalGoal: 1400,
      today: '2026-08-24',
    })

    expect(analysis?.actions.some((a) => a.id === 'incomplete')).toBe(true)
  })

  it('counts meals that were stored as planned', () => {
    const start = '2026-07-28'
    const meals: Meal[] = []
    const weights: WeightEntry[] = []
    for (let i = 0; i < 28; i++) {
      const date = addDays(start, i)
      meals.push(meal(date, 1300))
      meals.push({ ...meal(date, 900), id: `p-${date}`, planned: true })
      weights.push(weight(date, 64 - i * 0.05))
    }

    const analysis = buildFourWeekAnalysis({
      data: { ...empty, meals, weights },
      dailyKcalGoal: 1300,
      today: '2026-08-24',
    })

    expect(analysis?.avgKcal).toBe(2200)
  })
})
