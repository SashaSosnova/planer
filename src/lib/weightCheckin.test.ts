import { describe, expect, it } from 'vitest'
import type { Meal } from '../types'
import { buildWeightCheckin } from './weightCheckin'

function meal(partial: Partial<Meal> & Pick<Meal, 'id' | 'date'>): Meal {
  return {
    mealType: 'dinner',
    rawText: partial.rawText ?? 'еда',
    items: partial.items ?? [
      {
        name: partial.rawText ?? 'еда',
        grams: 200,
        kcal: 400,
        protein: 20,
        fat: 10,
        carbs: 40,
        source: 'estimate',
      },
    ],
    totals: partial.totals ?? { kcal: 400, protein: 20, fat: 10, carbs: 40 },
    isApproximate: false,
    eatingOut: false,
    createdAt: 1,
    ...partial,
  }
}

describe('buildWeightCheckin', () => {
  it('returns null without weights', () => {
    expect(buildWeightCheckin({ weights: [] })).toBeNull()
  })

  it('shows first weigh-in without delta', () => {
    const c = buildWeightCheckin({
      weights: [{ id: '1', date: '2026-07-30', kg: 70, createdAt: 1 }],
    })
    expect(c?.hero).toBe('70,0 кг')
    expect(c?.note).toMatch(/Первая точка/)
  })

  it('shows delta vs previous weigh-in', () => {
    const c = buildWeightCheckin({
      weights: [
        { id: '1', date: '2026-07-29', kg: 70.2, createdAt: 1 },
        { id: '2', date: '2026-07-30', kg: 69.6, createdAt: 2 },
      ],
      meals: [],
      dailyKcalGoal: 1800,
    })
    expect(c?.hero).toBe('−0,6 кг')
    expect(c?.tone).toBe('down')
    expect(c?.note).toMatch(/не заполнено/)
  })

  it('links eating out + carbs to morning gain', () => {
    const c = buildWeightCheckin({
      weights: [
        { id: '1', date: '2026-07-29', kg: 68.0, createdAt: 1 },
        { id: '2', date: '2026-07-30', kg: 68.8, createdAt: 2 },
      ],
      dailyKcalGoal: 1800,
      meals: [
        meal({
          id: 'm1',
          date: '2026-07-29',
          eatingOut: true,
          rawText: 'пицца пепперони',
          totals: { kcal: 2200, protein: 70, fat: 90, carbs: 240 },
          items: [
            {
              name: 'Пицца пепперони',
              grams: 350,
              kcal: 2200,
              protein: 70,
              fat: 90,
              carbs: 240,
              source: 'estimate',
            },
          ],
        }),
      ],
    })
    expect(c?.hero).toBe('+0,8 кг')
    expect(c?.tone).toBe('up')
    expect(c?.note).toMatch(/вне дома|углевод|вод/i)
  })

  it('treats gain after deficit as water, not food', () => {
    const c = buildWeightCheckin({
      weights: [
        { id: '1', date: '2026-07-29', kg: 70.0, createdAt: 1 },
        { id: '2', date: '2026-07-30', kg: 70.5, createdAt: 2 },
      ],
      dailyKcalGoal: 1800,
      meals: [
        meal({
          id: 'm1',
          date: '2026-07-29',
          rawText: 'курица и салат',
          totals: { kcal: 1200, protein: 100, fat: 40, carbs: 60 },
          items: [
            {
              name: 'Курица',
              grams: 200,
              kcal: 800,
              protein: 80,
              fat: 30,
              carbs: 0,
              source: 'library',
            },
            {
              name: 'Салат',
              grams: 200,
              kcal: 400,
              protein: 20,
              fat: 10,
              carbs: 60,
              source: 'library',
            },
          ],
        }),
      ],
    })
    expect(c?.note).toMatch(/дефицит|вода/i)
  })

  it('notes deficit agreement on a drop', () => {
    const c = buildWeightCheckin({
      weights: [
        { id: '1', date: '2026-07-29', kg: 70.0, createdAt: 1 },
        { id: '2', date: '2026-07-30', kg: 69.5, createdAt: 2 },
      ],
      dailyKcalGoal: 1800,
      meals: [
        meal({
          id: 'm1',
          date: '2026-07-29',
          rawText: 'омлет',
          totals: { kcal: 1300, protein: 90, fat: 50, carbs: 70 },
        }),
      ],
    })
    expect(c?.hero).toBe('−0,5 кг')
    expect(c?.note).toMatch(/дефицит|согласуется/i)
  })
})
