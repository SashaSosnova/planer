import { describe, expect, it } from 'vitest'
import type { Meal } from '../types'
import {
  calcSweetBudgetKcal,
  isSweetName,
  sweetKcalFromMeals,
  sweetScaleZone,
} from './sweets'

function meal(partial: Partial<Meal> & Pick<Meal, 'id' | 'date'>): Meal {
  return {
    mealType: 'snack',
    rawText: 'тест',
    items: [],
    totals: { kcal: 0, protein: 0, fat: 0, carbs: 0 },
    isApproximate: false,
    eatingOut: false,
    createdAt: 1,
    ...partial,
  }
}

describe('isSweetName', () => {
  it('detects common treats', () => {
    expect(isSweetName('Шоколад молочный')).toBe(true)
    expect(isSweetName('мороженое пломбир')).toBe(true)
    expect(isSweetName('печенье овсяное')).toBe(true)
    expect(isSweetName('торт Наполеон')).toBe(true)
  })

  it('skips savory false positives', () => {
    expect(isSweetName('перец сладкий')).toBe(false)
    expect(isSweetName('куриная грудка')).toBe(false)
    expect(isSweetName('салат цезарь')).toBe(false)
  })
})

describe('calcSweetBudgetKcal', () => {
  it('is about 10% of the daily goal within clamps', () => {
    expect(calcSweetBudgetKcal(1400)).toBe(140)
    expect(calcSweetBudgetKcal(1561)).toBe(156)
    expect(calcSweetBudgetKcal(500)).toBe(80)
    expect(calcSweetBudgetKcal(3000)).toBe(220)
  })
})

describe('sweetKcalFromMeals', () => {
  it('sums matching item kcal', () => {
    const meals = [
      meal({
        id: '1',
        date: '2026-08-04',
        items: [
          {
            name: 'Шоколад',
            grams: 30,
            kcal: 160,
            protein: 2,
            fat: 10,
            carbs: 15,
            source: 'library',
          },
          {
            name: 'Яблоко',
            grams: 100,
            kcal: 52,
            protein: 0,
            fat: 0,
            carbs: 14,
            source: 'library',
          },
        ],
        totals: { kcal: 212, protein: 2, fat: 10, carbs: 29 },
      }),
    ]
    expect(sweetKcalFromMeals(meals)).toBe(160)
  })

  it('counts a pure treat snack from raw text when items miss the name', () => {
    const meals = [
      meal({
        id: '1',
        date: '2026-08-04',
        rawText: 'мороженое',
        mealType: 'snack',
        items: [
          {
            name: 'Пломбир',
            grams: 80,
            kcal: 180,
            protein: 3,
            fat: 10,
            carbs: 18,
            source: 'estimate',
          },
        ],
        totals: { kcal: 180, protein: 3, fat: 10, carbs: 18 },
      }),
    ]
    expect(sweetKcalFromMeals(meals)).toBe(180)
  })
})

describe('sweetScaleZone', () => {
  it('marks over budget', () => {
    expect(sweetScaleZone(100, 140)).toBe('ok')
    expect(sweetScaleZone(150, 140)).toBe('warn')
    expect(sweetScaleZone(180, 140)).toBe('over')
  })
})
