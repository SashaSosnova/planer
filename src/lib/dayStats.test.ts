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
  dayNotes: [],
  periodStarts: [],
  medDays: [],
  careProducts: [],
  careDays: [],
}

describe('statsForDate', () => {
  it('sums meals for the date and sorts by meal type then createdAt', () => {
    const data: AppData = {
      ...empty,
      meals: [
        meal({
          id: 'lunch-late',
          date: '2026-07-15',
          mealType: 'lunch',
          createdAt: 9,
          totals: { kcal: 200, protein: 0, fat: 0, carbs: 0 },
        }),
        meal({
          id: 'breakfast',
          date: '2026-07-15',
          mealType: 'breakfast',
          createdAt: 5,
          totals: { kcal: 100, protein: 0, fat: 0, carbs: 0 },
        }),
        meal({
          id: 'snack',
          date: '2026-07-15',
          mealType: 'snack',
          createdAt: 1,
          totals: { kcal: 50, protein: 0, fat: 0, carbs: 0 },
        }),
        meal({ id: 'c', date: '2026-07-14', createdAt: 1, totals: { kcal: 999, protein: 0, fat: 0, carbs: 0 } }),
      ],
      weights: [{ id: 'w', date: '2026-07-15', kg: 60, createdAt: 1 }],
      steps: [{ id: 's', date: '2026-07-15', count: 5000, createdAt: 1 }],
      dayNotes: [
        {
          id: 'n',
          date: '2026-07-15',
          text: 'Нормальный день',
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    }
    const day = statsForDate(data, '2026-07-15')
    expect(day.meals.map((m) => m.id)).toEqual(['breakfast', 'lunch-late', 'snack'])
    expect(day.totals.kcal).toBe(350)
    expect(day.weightKg).toBe(60)
    expect(day.steps).toBe(5000)
    expect(day.noteText).toBe('Нормальный день')
    expect(day.approximate).toBe(false)
  })

  it('marks approximate when eating out', () => {
    const data: AppData = {
      ...empty,
      meals: [meal({ id: '1', date: '2026-07-15', eatingOut: true })],
    }
    expect(statsForDate(data, '2026-07-15').approximate).toBe(true)
  })

  it('counts meals marked planned in eaten totals', () => {
    const data: AppData = {
      ...empty,
      meals: [
        meal({
          id: 'eaten',
          date: '2026-07-15',
          mealType: 'breakfast',
          totals: { kcal: 400, protein: 20, fat: 10, carbs: 30 },
          items: [
            {
              name: 'огурец',
              grams: 100,
              kcal: 15,
              protein: 1,
              fat: 0,
              carbs: 3,
              source: 'estimate',
            },
          ],
        }),
        meal({
          id: 'plan',
          date: '2026-07-15',
          mealType: 'lunch',
          planned: true,
          totals: { kcal: 800, protein: 40, fat: 20, carbs: 60 },
          items: [
            {
              name: 'торт',
              grams: 100,
              kcal: 400,
              protein: 5,
              fat: 20,
              carbs: 50,
              source: 'estimate',
            },
          ],
        }),
      ],
    }
    const day = statsForDate(data, '2026-07-15')
    expect(day.meals).toHaveLength(2)
    expect(day.totals.kcal).toBe(1200)
    expect(day.vegGrams).toBe(100)
    expect(day.sweetKcal).toBe(400)
    expect(day.approximate).toBe(false)
  })

  it('marks the day approximate when an eating-out meal was stored as planned', () => {
    const data: AppData = {
      ...empty,
      meals: [
        meal({
          id: 'plan',
          date: '2026-07-15',
          planned: true,
          eatingOut: true,
          totals: { kcal: 500, protein: 0, fat: 0, carbs: 0 },
        }),
      ],
    }
    const day = statsForDate(data, '2026-07-15')
    expect(day.totals.kcal).toBe(500)
    expect(day.approximate).toBe(true)
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
        { id: 'w1', date: '2026-07-13', kg: 61, createdAt: 1 }, // Mon
        { id: 'w2', date: '2026-07-15', kg: 60.8, createdAt: 2 }, // mid-week ignored
        { id: 'w3', date: '2026-07-19', kg: 60.5, createdAt: 3 }, // Sun
      ],
      steps: [
        { id: 's1', date: '2026-07-13', count: 4000, createdAt: 1 },
        { id: 's2', date: '2026-07-14', count: 6000, createdAt: 2 },
      ],
    }
    // 2026-07-13 is Monday → Sunday 2026-07-19
    const week = buildWeekStats(data, '2026-07-13', 1800)
    expect(week.totals.kcal).toBe(300)
    expect(week.kcalGoal).toBe(1800 * 7)
    expect(week.weightStart).toBe(61)
    expect(week.weightEnd).toBe(60.5)
    expect(week.weightDelta).toBe(-0.5)
    expect(week.avgSteps).toBe(5000)
  })

  it('omits weight delta when Monday or Sunday is missing', () => {
    const data: AppData = {
      ...empty,
      weights: [
        { id: 'w1', date: '2026-07-13', kg: 61, createdAt: 1 },
        { id: 'w2', date: '2026-07-17', kg: 60.5, createdAt: 2 },
      ],
    }
    const week = buildWeekStats(data, '2026-07-13', 1800)
    expect(week.weightDelta).toBeUndefined()
  })
})

describe('buildTodayTimeline', () => {
  it('shows current-week past days separately; collapses only finished weeks', () => {
    const data: AppData = {
      ...empty,
      meals: [
        meal({ id: 'old', date: '2026-07-06', totals: { kcal: 50, protein: 0, fat: 0, carbs: 0 } }),
        meal({ id: 'cur', date: '2026-07-14', totals: { kcal: 80, protein: 0, fat: 0, carbs: 0 } }),
        meal({ id: 'tod', date: '2026-07-15', totals: { kcal: 90, protein: 0, fat: 0, carbs: 0 } }),
      ],
    }
    const tl = buildTodayTimeline(data, 1800, '2026-07-15')
    expect(tl.today.date).toBe('2026-07-15')
    expect(tl.recentDays.map((d) => d.date)).toEqual(['2026-07-14'])
    expect(tl.historyWeeks.some((w) => w.weekStart === '2026-07-06')).toBe(true)
    expect(tl.historyWeeks.some((w) => w.weekStart === '2026-07-13')).toBe(false)
  })

  it('does not surface journal-only days', () => {
    const data: AppData = {
      ...empty,
      dayNotes: [
        {
          id: 'n1',
          date: '2026-07-06',
          text: 'Тихий день',
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: 'n2',
          date: '2026-07-14',
          text: 'Было ок',
          createdAt: 2,
          updatedAt: 2,
        },
      ],
    }
    const tl = buildTodayTimeline(data, 1800, '2026-07-15')
    expect(tl.recentDays.some((d) => d.date === '2026-07-14')).toBe(false)
    expect(tl.historyWeeks.some((w) => w.weekStart === '2026-07-06')).toBe(false)
    expect(tl.historyWeeks.some((w) => w.weekStart === '2026-07-13')).toBe(false)
  })
})
