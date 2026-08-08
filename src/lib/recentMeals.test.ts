import { describe, expect, it } from 'vitest'
import { cloneMealAsDraft, listRecentMeals } from './recentMeals'
import type { Meal } from '../types'

function meal(partial: Partial<Meal> & Pick<Meal, 'id' | 'createdAt'>): Meal {
  return {
    date: '2026-08-08',
    mealType: 'breakfast',
    rawText: 'яйцо',
    items: [
      {
        name: 'Яйцо куриное',
        grams: 55,
        kcal: 80,
        protein: 7,
        fat: 5,
        carbs: 0.5,
        source: 'library',
        foodId: 'egg',
      },
    ],
    totals: { kcal: 80, protein: 7, fat: 5, carbs: 0.5 },
    isApproximate: false,
    eatingOut: false,
    ...partial,
  }
}

describe('listRecentMeals', () => {
  it('sorts by createdAt desc and dedupes preview', () => {
    const egg = {
      name: 'Яйцо куриное',
      grams: 55,
      kcal: 80,
      protein: 7,
      fat: 5,
      carbs: 0.5,
      source: 'library' as const,
      foodId: 'egg',
    }
    const cottage = {
      name: 'Творог',
      grams: 100,
      kcal: 120,
      protein: 16,
      fat: 5,
      carbs: 3,
      source: 'library' as const,
      foodId: 'tv',
    }
    const meals = [
      meal({ id: '1', createdAt: 1, items: [egg] }),
      meal({
        id: '2',
        createdAt: 3,
        items: [cottage],
        totals: { kcal: 120, protein: 16, fat: 5, carbs: 3 },
      }),
      meal({ id: '3', createdAt: 2, items: [egg] }),
    ]
    const recent = listRecentMeals(meals, 8)
    expect(recent.map((m) => m.id)).toEqual(['2', '3'])
  })

  it('filters by meal type', () => {
    const meals = [
      meal({ id: 'b1', createdAt: 3, mealType: 'breakfast' }),
      meal({ id: 'l1', createdAt: 4, mealType: 'lunch', rawText: 'суп' }),
      meal({ id: 'b2', createdAt: 2, mealType: 'breakfast' }),
    ]
    expect(listRecentMeals(meals, 8, 'breakfast').map((m) => m.id)).toEqual(['b1'])
    expect(listRecentMeals(meals, 8, 'lunch').map((m) => m.id)).toEqual(['l1'])
  })
})

describe('cloneMealAsDraft', () => {
  it('copies items without sharing references', () => {
    const m = meal({ id: '1', createdAt: 1, eatingOut: true })
    const draft = cloneMealAsDraft(m)
    expect(draft.mealType).toBe('breakfast')
    expect(draft.eatingOut).toBe(true)
    expect(draft.items[0]).toEqual(m.items[0])
    expect(draft.items[0]).not.toBe(m.items[0])
    draft.items[0]!.grams = 99
    expect(m.items[0]!.grams).toBe(55)
  })
})
