import { describe, expect, it } from 'vitest'
import type { FoodItem, Meal } from '../types'
import {
  canonicalizeFoodName,
  extractFoodsFromMeals,
  resolvePortionGrams,
} from './seedFoodsFromMeals'

function meal(partial: Partial<Meal> & Pick<Meal, 'items'>): Meal {
  return {
    id: 'm1',
    date: '2026-07-20',
    mealType: 'lunch',
    rawText: '',
    totals: { kcal: 0, protein: 0, fat: 0, carbs: 0 },
    isApproximate: true,
    eatingOut: false,
    createdAt: 1,
    ...partial,
  }
}

const egg: FoodItem = {
  id: 'egg',
  name: 'Яйцо',
  aliases: ['яйцо'],
  per100g: { kcal: 156, protein: 12, fat: 10, carbs: 2 },
  kind: 'ingredient',
  updatedAt: 1,
}

const coffee: FoodItem = {
  id: 'coffee',
  name: 'Кофе с молоком',
  aliases: ['кофе', 'молоком'],
  per100g: { kcal: 15, protein: 0.5, fat: 0.5, carbs: 1.5 },
  kind: 'ingredient',
  updatedAt: 1,
}

describe('canonicalizeFoodName', () => {
  it('maps egg / veg / snack variants', () => {
    expect(canonicalizeFoodName('Яйцо варёное')).toBe('Яйцо')
    expect(canonicalizeFoodName('Огурцы')).toBe('Огурец')
    expect(canonicalizeFoodName('Чипсы lays запеченые')).toBe('Чипсы')
    expect(canonicalizeFoodName('шоколад молочный')).toBe('Шоколад')
    expect(canonicalizeFoodName('Капучино Starbucks 300 мл')).toBe('Капучино')
  })

  it('skips bot junk and compounds', () => {
    expect(canonicalizeFoodName('сводка бота (детали в чате)')).toBeNull()
    expect(canonicalizeFoodName('Перекус')).toBeNull()
    expect(
      canonicalizeFoodName('капустные котлеты 160г, сметана 15%'),
    ).toBeNull()
    expect(canonicalizeFoodName('батончик Goodmix и кофе с молоком')).toBeNull()
    expect(canonicalizeFoodName('1 карамелька Кремка')).toBeNull()
    expect(canonicalizeFoodName('Американо и батончик Goodmix')).toBeNull()
    expect(
      canonicalizeFoodName('салат из огурцов и помидоров с оливковым маслом'),
    ).toBe('Салат из огурцов и помидоров с оливковым маслом')
  })
})

describe('resolvePortionGrams', () => {
  it('uses parenthetical grams when stored as 100g stub', () => {
    expect(resolvePortionGrams({ name: 'чипсы (30г)', grams: 100 })).toBe(30)
    expect(resolvePortionGrams({ name: 'творог мягкий 5% 120г', grams: 100 })).toBe(
      120,
    )
  })

  it('keeps real weighed grams', () => {
    expect(resolvePortionGrams({ name: 'Огурец', grams: 80 })).toBe(80)
  })
})

describe('extractFoodsFromMeals', () => {
  it('adds single sightings and merges chip variants', () => {
    const meals: Meal[] = [
      meal({
        items: [
          {
            name: 'Чипсы lays',
            grams: 30,
            kcal: 160,
            protein: 2,
            fat: 10,
            carbs: 15,
            source: 'estimate',
          },
          {
            name: 'Яйцо варёное',
            grams: 50,
            kcal: 78,
            protein: 6,
            fat: 5,
            carbs: 1,
            source: 'estimate',
          },
          {
            name: 'Кофе с молоком',
            grams: 200,
            kcal: 30,
            protein: 1,
            fat: 1,
            carbs: 3,
            source: 'estimate',
          },
        ],
      }),
      meal({
        id: 'm2',
        items: [
          {
            name: 'чипсы (30г)',
            grams: 100,
            kcal: 149,
            protein: 1.5,
            fat: 7.5,
            carbs: 16.8,
            source: 'estimate',
          },
          {
            name: 'Манго',
            grams: 100,
            kcal: 60,
            protein: 0.8,
            fat: 0.4,
            carbs: 15,
            source: 'estimate',
          },
        ],
      }),
    ]

    const candidates = extractFoodsFromMeals(meals, [egg, coffee])
    const names = candidates.map((c) => c.name)
    expect(names).toContain('Чипсы')
    expect(names).toContain('Манго')
    expect(names).not.toContain('Яйцо')
    expect(names).not.toContain('Кофе с молоком')
    const chips = candidates.find((c) => c.name === 'Чипсы')!
    expect(chips.count).toBe(2)
    // ~495–530 kcal/100g from both samples
    expect(chips.per100g.kcal).toBeGreaterThan(400)
  })

  it('ignores telegram compound stubs', () => {
    const meals: Meal[] = [
      meal({
        items: [
          {
            name: 'сводка бота (детали в чате)',
            grams: 100,
            kcal: 500,
            protein: 0,
            fat: 0,
            carbs: 0,
            source: 'estimate',
          },
        ],
      }),
    ]
    expect(extractFoodsFromMeals(meals, [])).toEqual([])
  })
})
