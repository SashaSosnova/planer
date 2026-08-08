import { describe, expect, it } from 'vitest'
import { isComplexMealText } from './mealComplexity'
import { parseMealLocal } from './parseMealLocal'
import { finalizeDraft } from './parseMeal'
import { resolveParsedGrams, defaultGramsForFoodName } from './foodPortion'
import { guessFallbackCategory } from './nutrition'
import type { FoodRef } from '../types'
import { generateAliases } from './foodAliases'

describe('isComplexMealText', () => {
  it('does not treat 4–6 dish meal lists as one recipe', () => {
    expect(
      isComplexMealText(
        'гречка 100 г, курица 100 г, хлеб 20 г, яблоко 150 г, творог 200 г, кофе с молоком',
      ),
    ).toBe(false)
    expect(isComplexMealText('яйцо, хлеб, сыр, яблоко')).toBe(false)
  })

  it('still flags recipe-like salad descriptions', () => {
    expect(
      isComplexMealText(
        'Салат из курицы, капусты, моркови, перца, заправка оливковое масло, украшен зеленью 300 гр',
      ),
    ).toBe(true)
  })
})

describe('coffee with milk / egg portions', () => {
  it('guesses milk-coffee macros, not black coffee (~4 kcal)', () => {
    const per100 = guessFallbackCategory('кофе с молоком')
    expect(per100.kcal).toBeGreaterThan(20)
  })

  it('defaults egg to ~55 g', () => {
    expect(defaultGramsForFoodName('Яйцо куриное')).toBe(55)
    expect(resolveParsedGrams(2, { portionGrams: 55 }, false, 'Яйцо куриное')).toBe(55)
    expect(resolveParsedGrams(2, null, false, 'яйцо куриное')).toBe(55)
  })

  it('expands кофе с молоком even when catalog has black coffee', () => {
    const coffee: FoodRef = {
      id: 'c1',
      name: 'Кофе',
      aliases: ['кофе'],
      per100g: { kcal: 2, protein: 0.1, fat: 0, carbs: 0.3 },
      kind: 'ingredient',
      portionGrams: 200,
    }
    const milk: FoodRef = {
      id: 'm1',
      name: 'Молоко',
      aliases: generateAliases('Молоко'),
      per100g: { kcal: 52, protein: 2.9, fat: 2.5, carbs: 4.7 },
      kind: 'ingredient',
    }
    const draft = parseMealLocal('кофе с молоком', [coffee, milk])
    expect(draft.items.length).toBe(2)
    const totalKcal = draft.items.reduce((s, i) => s + i.kcal, 0)
    expect(totalKcal).toBeGreaterThan(20)
  })

  it('parses 4–6 item lists without collapsing', () => {
    const foods: FoodRef[] = [
      {
        id: '1',
        name: 'Гречка',
        aliases: ['гречка'],
        per100g: { kcal: 110, protein: 3, fat: 1, carbs: 22 },
        kind: 'ingredient',
      },
      {
        id: '2',
        name: 'Курица',
        aliases: ['курица'],
        per100g: { kcal: 110, protein: 23, fat: 2, carbs: 0 },
        kind: 'ingredient',
      },
      {
        id: '3',
        name: 'Хлеб',
        aliases: ['хлеб'],
        per100g: { kcal: 265, protein: 9, fat: 3, carbs: 49 },
        kind: 'ingredient',
      },
      {
        id: '4',
        name: 'Яблоко',
        aliases: ['яблоко'],
        per100g: { kcal: 52, protein: 0.3, fat: 0.2, carbs: 14 },
        kind: 'ingredient',
      },
      {
        id: '5',
        name: 'Творог',
        aliases: ['творог'],
        per100g: { kcal: 120, protein: 16, fat: 5, carbs: 3 },
        kind: 'ingredient',
      },
    ]
    const draft = parseMealLocal(
      'гречка 100 г, курица 100 г, хлеб 20 г, яблоко 150 г, творог 200 г',
      foods,
    )
    expect(draft.items.length).toBe(5)
    expect(draft.eatingOut).toBe(false)
  })

  it('fixes LLM egg grams=2 via finalizeDraft', () => {
    const egg: FoodRef = {
      id: 'e1',
      name: 'Яйцо куриное',
      aliases: ['яйцо', 'яйца'],
      per100g: { kcal: 157, protein: 13, fat: 11, carbs: 0.7 },
      kind: 'ingredient',
      portionGrams: 55,
    }
    const draft = finalizeDraft(
      'breakfast',
      [{ name: 'Яйцо куриное', grams: 2, foodId: 'e1', source: 'library' }],
      [egg],
      false,
      undefined,
      'deepseek',
      'яйцо куриное',
    )
    expect(draft.items[0]!.grams).toBe(55)
  })
})
