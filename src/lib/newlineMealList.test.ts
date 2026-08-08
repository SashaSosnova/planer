import { describe, expect, it } from 'vitest'
import { parseMealLocal } from './parseMealLocal'
import { isComplexMealText } from './mealComplexity'
import { generateAliases } from './foodAliases'
import type { FoodRef } from '../types'
import { findBestFood, scoreFoodMatch } from './foodMatch'

const text = `яйцо куриное
сыр пармезан 5 г
масло сливочное 2 г
ветчина ореховая 10 г`

function food(name: string, portionGrams?: number): FoodRef {
  return {
    id: name,
    name,
    aliases: generateAliases(name),
    per100g: { kcal: 100, protein: 10, fat: 5, carbs: 5 },
    kind: 'ingredient',
    ...(portionGrams ? { portionGrams } : {}),
  }
}

describe('newline meal list (user style)', () => {
  it('is not complex', () => {
    expect(isComplexMealText(text)).toBe(false)
  })

  it('splits into 4 items locally when catalog matches', () => {
    const foods = [
      food('Яйцо куриное', 55),
      food('Сыр пармезан'),
      food('Масло сливочное'),
      food('Ветчина ореховая'),
    ]
    const draft = parseMealLocal(text, foods)
    expect(draft.items.map((i) => ({ n: i.name, g: i.grams, s: i.source }))).toEqual([
      { n: 'Яйцо куриное', g: 55, s: 'library' },
      { n: 'Сыр пармезан', g: 5, s: 'library' },
      { n: 'Масло сливочное', g: 2, s: 'library' },
      { n: 'Ветчина ореховая', g: 10, s: 'library' },
    ])
  })

  it('keeps all newline rows even when some are unknown', () => {
    const draft = parseMealLocal(text, [food('Яйцо куриное', 55)])
    expect(draft.items).toHaveLength(4)
    expect(draft.items[0]!.grams).toBe(55)
    expect(draft.items[1]!.grams).toBe(5)
    expect(draft.items[2]!.grams).toBe(2)
    expect(draft.items[3]!.grams).toBe(10)
  })

  it('bare names without grams use catalog portion (1 piece)', () => {
    const foods = [
      food('Яйцо куриное', 55),
      food('Карамель мягкая', 20),
      food('Ириска', 15),
    ]
    const draft = parseMealLocal(
      `яйцо куриное
карамель мягкая
ириска`,
      foods,
    )
    expect(draft.items.map((i) => ({ n: i.name, g: i.grams }))).toEqual([
      { n: 'Яйцо куриное', g: 55 },
      { n: 'Карамель мягкая', g: 20 },
      { n: 'Ириска', g: 15 },
    ])
  })

  it('scores compound cheese/ham names', () => {
    const parmesan = food('Сыр пармезан')
    const ham = food('Ветчина ореховая')
    expect(scoreFoodMatch('сыр пармезан', parmesan)).toBeGreaterThanOrEqual(70)
    expect(scoreFoodMatch('ветчина ореховая', ham)).toBeGreaterThanOrEqual(70)
    expect(findBestFood('сыр пармезан', [parmesan], 70)?.name).toBe('Сыр пармезан')
  })
})
