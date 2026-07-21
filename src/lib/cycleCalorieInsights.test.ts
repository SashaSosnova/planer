import { describe, expect, it } from 'vitest'
import { analyzeCycleCalories } from './cycleCalorieInsights'
import type { Meal } from '../types'

function meal(date: string, kcal: number, rawText = 'обед'): Meal {
  return {
    id: `${date}-${kcal}-${rawText}`,
    date,
    mealType: 'lunch',
    rawText,
    items: [{ name: rawText, grams: 100, kcal, protein: 10, fat: 5, carbs: 10, source: 'estimate' }],
    totals: { kcal, protein: 10, fat: 5, carbs: 10 },
    isApproximate: true,
    eatingOut: false,
    createdAt: 1,
  }
}

describe('analyzeCycleCalories', () => {
  it('builds a personal tip when there is enough diary data', () => {
    const starts = [
      { id: '1', date: '2026-01-01', createdAt: 1 },
      { id: '2', date: '2026-01-29', createdAt: 2 },
      { id: '3', date: '2026-02-26', createdAt: 3 },
    ]
    const meals: Meal[] = []
    // Follicular-ish days (cycle day ~8): under goal
    for (const d of ['2026-01-08', '2026-01-09', '2026-02-05', '2026-02-06', '2026-03-05', '2026-03-06']) {
      meals.push(meal(d, 1200, 'курица салат'))
    }
    // Luteal-ish days (cycle day ~22): over + sweets
    for (const d of ['2026-01-22', '2026-01-23', '2026-02-19', '2026-02-20', '2026-03-19', '2026-03-20']) {
      meals.push(meal(d, 1600, 'шоколад слойка'))
    }

    const insights = analyzeCycleCalories(starts, meals, 1350, {
      cycleLengthDays: 28,
      periodLengthDays: 5,
      today: '2026-03-20',
    })
    expect(insights.sampleDays).toBeGreaterThanOrEqual(12)
    expect(insights.phases.length).toBeGreaterThanOrEqual(2)
    expect(insights.tip).toBeTruthy()
    expect(insights.tip).toMatch(/сладк|ккал|энерг|воды|аппетит|план/i)
    expect(insights.tip).not.toMatch(/фолликуляр|лютеинов|овуляц/i)
  })

  it('falls back to generic tip with little data', () => {
    const insights = analyzeCycleCalories(
      [{ id: '1', date: '2026-07-01', createdAt: 1 }],
      [meal('2026-07-03', 1300)],
      1350,
      { today: '2026-07-03' },
    )
    expect(insights.tip).toMatch(/воды|энерг|отдых/i)
    expect(insights.tip).not.toMatch(/фолликуляр|лютеинов/i)
  })
})
