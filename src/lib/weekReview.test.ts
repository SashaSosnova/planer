import { describe, expect, it } from 'vitest'
import type { DayStats, WeekStats } from './dayStats'
import { buildWeekReview } from './weekReview'
import { emptyMacros } from './nutrition'
import type { Meal, MealItem } from '../types'

function item(partial: Pick<MealItem, 'name'> & Partial<MealItem>): MealItem {
  return {
    grams: 100,
    kcal: 100,
    protein: 10,
    fat: 5,
    carbs: 10,
    source: 'library',
    ...partial,
  }
}

function meal(partial: Partial<Meal> & { rawText: string; kcal: number }): Meal {
  const items = partial.items ?? [
    item({ name: partial.rawText, kcal: partial.kcal, protein: 20, fat: 5, carbs: 15 }),
  ]
  const totals = items.reduce(
    (acc, i) => ({
      kcal: acc.kcal + i.kcal,
      protein: acc.protein + i.protein,
      fat: acc.fat + i.fat,
      carbs: acc.carbs + i.carbs,
    }),
    emptyMacros(),
  )
  return {
    id: partial.id ?? `m-${partial.rawText}`,
    date: partial.date ?? '2026-07-06',
    mealType: partial.mealType ?? 'lunch',
    rawText: partial.rawText,
    items,
    totals: { ...totals, kcal: partial.kcal },
    isApproximate: false,
    eatingOut: partial.eatingOut ?? false,
    createdAt: 1,
  }
}

function day(date: string, meals: Meal[], extra: Partial<DayStats> = {}): DayStats {
  const totals = meals.reduce(
    (acc, m) => ({
      kcal: acc.kcal + m.totals.kcal,
      protein: acc.protein + m.totals.protein,
      fat: acc.fat + m.totals.fat,
      carbs: acc.carbs + m.totals.carbs,
    }),
    emptyMacros(),
  )
  return {
    date,
    label: date,
    meals,
    totals,
    vegGrams: extra.vegGrams ?? 0,
    sweetKcal: extra.sweetKcal ?? 0,
    approximate: false,
    hasData: true,
    ...extra,
  }
}

function week(overrides: Partial<WeekStats> = {}, days?: DayStats[]): WeekStats {
  const d = days ?? []
  const totals = d.reduce(
    (acc, x) => ({
      kcal: acc.kcal + x.totals.kcal,
      protein: acc.protein + x.totals.protein,
      fat: acc.fat + x.totals.fat,
      carbs: acc.carbs + x.totals.carbs,
    }),
    emptyMacros(),
  )
  return {
    weekStart: '2026-07-06',
    weekEnd: '2026-07-12',
    label: '6–12 июля',
    days: d,
    totals: totals.kcal > 0 ? totals : { kcal: 10000, protein: 400, fat: 300, carbs: 900 },
    kcalGoal: 12600,
    mealSnippets: [],
    weightStart: 62,
    ...overrides,
  }
}

const DATES = [
  '2026-07-06',
  '2026-07-07',
  '2026-07-08',
  '2026-07-09',
  '2026-07-10',
  '2026-07-11',
  '2026-07-12',
]

describe('buildWeekReview', () => {
  it('treats ~5000 steps and sweets in budget as normal, not a failure', () => {
    const days = DATES.map((date) =>
      day(
        date,
        [
          meal({
            date,
            rawText: 'минтай, гречка, курица, шоколад',
            kcal: 1400,
            items: [
              item({ name: 'минтай', grams: 150, kcal: 120, protein: 25, fat: 2, carbs: 0 }),
              item({ name: 'гречка', grams: 200, kcal: 220, protein: 8, fat: 2, carbs: 40 }),
              item({ name: 'курица', grams: 120, kcal: 160, protein: 28, fat: 4, carbs: 0 }),
              item({ name: 'шоколад', grams: 20, kcal: 110, protein: 1, fat: 7, carbs: 10 }),
              item({ name: 'творог', grams: 150, kcal: 160, protein: 18, fat: 5, carbs: 5 }),
            ],
          }),
        ],
        { vegGrams: 180, sweetKcal: 180, steps: 5077 },
      ),
    )
    const review = buildWeekReview(
      week({ avgSteps: 5077, weightStart: 62, kcalGoal: 1400 * 7 }, days),
    )
    expect(review.text).toMatch(/^Хорошо:/)
    expect(review.text).toMatch(/Нормально:/)
    expect(review.good.join(' ')).toMatch(/минтай|курица|гречка/)
    expect(review.ok.join(' ')).toMatch(/шаги/i)
    expect(review.ok.join(' ')).toMatch(/сладкое/i)
    expect(review.text).not.toMatch(/ошибк/i)
    expect(review.text).not.toMatch(/срыв/i)
    expect(review.text).not.toMatch(/кофе/)
    expect(review.tweak.join(' ')).not.toMatch(/сладкое/)
  })

  it('does not scold high carbs when calories are on plan', () => {
    const review = buildWeekReview(
      week({
        totals: { kcal: 9800, protein: 511, fat: 426, carbs: 900 },
        kcalGoal: 9700,
        avgSteps: 5077,
        days: [],
      }),
    )
    expect(review.text).not.toMatch(/углевод\w* преобладают/)
    expect(review.good.join(' ') + review.ok.join(' ')).toMatch(/ккал/)
  })

  it('suggests more protein and veg as an add, not a ban', () => {
    const days = DATES.slice(0, 3).map((date) =>
      day(date, [meal({ date, rawText: 'тост', kcal: 1400 })], {
        vegGrams: 40,
        sweetKcal: 80,
      }),
    )
    const review = buildWeekReview(week({ weightStart: 62, kcalGoal: 1400 * 3 }, days))
    expect(review.tweak.join(' ')).toMatch(/белка/)
    expect(review.tweak.join(' ')).toMatch(/овощ/)
    expect(review.text).not.toMatch(/запрет/)
  })

  it('praises high steps', () => {
    const review = buildWeekReview(week({ avgSteps: 18231, days: [] }))
    expect(review.good.join(' ')).toMatch(/ходьб/)
    expect(review.text).not.toMatch(/мало/)
  })
})
