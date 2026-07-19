import { describe, expect, it } from 'vitest'
import type { Meal } from '../types'
import { isVegetableName, vegGramsFromMeals } from './vegetables'

function mealWith(...items: Array<{ name: string; grams: number }>): Meal {
  return {
    id: '1',
    date: '2026-07-15',
    mealType: 'lunch',
    rawText: 'тест',
    items: items.map((i) => ({
      name: i.name,
      grams: i.grams,
      kcal: 0,
      protein: 0,
      fat: 0,
      carbs: 0,
      source: 'estimate' as const,
    })),
    totals: { kcal: 0, protein: 0, fat: 0, carbs: 0 },
    isApproximate: false,
    eatingOut: false,
    createdAt: 1,
  }
}

describe('isVegetableName', () => {
  it('matches common vegetables', () => {
    expect(isVegetableName('Огурец')).toBe(true)
    expect(isVegetableName('помидоры черри')).toBe(true)
    expect(isVegetableName('салат с курицей')).toBe(true)
    expect(isVegetableName('овощное рагу')).toBe(true)
    expect(isVegetableName('свёкла варёная')).toBe(true)
  })

  it('excludes starchy and processed items', () => {
    expect(isVegetableName('картофель жареный')).toBe(false)
    expect(isVegetableName('пюре картофельное')).toBe(false)
    expect(isVegetableName('томатный сок')).toBe(false)
    expect(isVegetableName('кетчуп')).toBe(false)
    expect(isVegetableName('томатная паста')).toBe(false)
  })

  it('rejects non-vegetables', () => {
    expect(isVegetableName('куриная грудка')).toBe(false)
    expect(isVegetableName('рис')).toBe(false)
  })
})

describe('vegGramsFromMeals', () => {
  it('sums grams of vegetable items', () => {
    const meals = [
      mealWith({ name: 'огурец', grams: 100 }, { name: 'курица', grams: 150 }),
      mealWith({ name: 'салат овощной', grams: 200 }),
    ]
    expect(vegGramsFromMeals(meals)).toBe(300)
  })

  it('returns 0 when no vegetables', () => {
    expect(vegGramsFromMeals([mealWith({ name: 'яйцо', grams: 60 })])).toBe(0)
  })
})
