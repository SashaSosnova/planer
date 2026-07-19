import { describe, expect, it } from 'vitest'
import type { FoodRef } from '../types'
import { parseMealLocal } from './parseMealLocal'

const grechka: FoodRef = {
  id: 'g1',
  name: 'Гречка',
  aliases: ['гречка'],
  per100g: { kcal: 110, protein: 4, fat: 1, carbs: 21 },
  kind: 'ingredient',
}

const kurica: FoodRef = {
  id: 'k1',
  name: 'Курица',
  aliases: ['курица', 'куриная грудка'],
  per100g: { kcal: 110, protein: 23, fat: 1.5, carbs: 0 },
  kind: 'ingredient',
}

describe('parseMealLocal', () => {
  it('keeps multi-item lists instead of collapsing to one library match', () => {
    const draft = parseMealLocal('гречка 100 г, курица 100 г', [grechka, kurica])
    expect(draft.items).toHaveLength(2)
    expect(draft.items.map((i) => i.name)).toEqual(['Гречка', 'Курица'])
    expect(draft.totals.kcal).toBe(220)
  })

  it('matches a single known product', () => {
    const draft = parseMealLocal('гречка 50 г', [grechka])
    expect(draft.items).toHaveLength(1)
    expect(draft.items[0]!.name).toBe('Гречка')
    expect(draft.items[0]!.grams).toBe(50)
    expect(draft.parseSource).toBe('library')
  })

  it('allocates explicit weight for coffee with milk', () => {
    const draft = parseMealLocal('кофе с молоком 200 г', [])
    expect(draft.items).toHaveLength(2)
    const totalGrams = draft.items.reduce((s, i) => s + i.grams, 0)
    expect(totalGrams).toBe(200)
    expect(draft.items.some((i) => /молок/i.test(i.name))).toBe(true)
  })

  it('uses defaults when coffee with milk has no weight', () => {
    const draft = parseMealLocal('кофе с молоком', [])
    expect(draft.items).toHaveLength(2)
    expect(draft.items[0]!.grams).toBe(200)
    expect(draft.items[1]!.grams).toBe(60)
  })
})
