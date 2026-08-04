import { describe, expect, it } from 'vitest'
import type { FoodItem, Meal } from '../types'
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

  it('does not treat «кусок» as juice (сок)', () => {
    expect(isVegetableName('кусок помидора')).toBe(true)
    expect(isVegetableName('помидор')).toBe(true)
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

  it('counts tomato grams inside a sandwich recipe', () => {
    const foods: FoodItem[] = [
      {
        id: 'butter',
        name: 'Бутерброд',
        aliases: [],
        per100g: { kcal: 250, protein: 10, fat: 12, carbs: 25 },
        updatedAt: 1,
        kind: 'dish',
        recipe: {
          ingredients: [
            {
              name: 'Хлеб',
              gramsRaw: 40,
              per100g: { kcal: 260, protein: 8, fat: 2, carbs: 50 },
              source: 'library',
              yieldFactor: 1,
            },
            {
              name: 'Помидор',
              gramsRaw: 50,
              per100g: { kcal: 20, protein: 1, fat: 0, carbs: 4 },
              source: 'library',
              yieldFactor: 1,
            },
            {
              name: 'Сыр',
              gramsRaw: 30,
              per100g: { kcal: 350, protein: 25, fat: 28, carbs: 0 },
              source: 'library',
              yieldFactor: 1,
            },
          ],
          totalRawGrams: 120,
          totalCookedGrams: 120,
          totalMacros: { kcal: 300, protein: 15, fat: 12, carbs: 22 },
        },
      },
    ]
    const meals: Meal[] = [
      {
        id: '1',
        date: '2026-07-15',
        mealType: 'lunch',
        rawText: 'бутер',
        items: [
          {
            name: 'Бутерброд',
            grams: 120,
            foodId: 'butter',
            kcal: 300,
            protein: 15,
            fat: 12,
            carbs: 22,
            source: 'library',
          },
        ],
        totals: { kcal: 300, protein: 15, fat: 12, carbs: 22 },
        isApproximate: false,
        eatingOut: false,
        createdAt: 1,
      },
    ]
    expect(vegGramsFromMeals(meals, foods)).toBe(50)
  })

  it('falls back when veg is only in the meal phrase', () => {
    const meals = [
      {
        ...mealWith({ name: 'Бутерброд', grams: 120 }),
        rawText: 'бутер с помидором',
      },
    ]
    expect(vegGramsFromMeals(meals)).toBe(40)
  })
})
