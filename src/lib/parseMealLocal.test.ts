import { describe, expect, it } from 'vitest'
import type { FoodRef } from '../types'
import { generateAliases } from './foodAliases'
import { extractMealGrams, parseMealLocal } from './parseMealLocal'

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

const tvorog: FoodRef = {
  id: 't1',
  name: 'Творог',
  aliases: generateAliases('Творог'),
  per100g: { kcal: 100, protein: 16, fat: 5, carbs: 3 },
  kind: 'ingredient',
}

const tvorozhnySyr: FoodRef = {
  id: 't2',
  name: 'Творожный сыр',
  aliases: generateAliases('Творожный сыр'),
  per100g: { kcal: 250, protein: 6, fat: 24, carbs: 3 },
  kind: 'ingredient',
}

describe('extractMealGrams', () => {
  it.each([
    ['творог 200 г', 'творог', 200],
    ['творога 200 гр', 'творога', 200],
    ['творог 200гр', 'творог', 200],
    ['200 г творога', 'творога', 200],
    ['200 гр творога', 'творога', 200],
    ['200гр творога', 'творога', 200],
    ['гречка', 'гречка', null],
  ] as const)('%s → name=%s grams=%s', (input, name, grams) => {
    expect(extractMealGrams(input)).toEqual({ name, grams })
  })
})

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

  it.each(['200 г творога', '200 гр творога', '200гр творога', 'творога 200 г', 'творог 200 гр'])(
    'matches Творог for %s',
    (input) => {
      const draft = parseMealLocal(input, [tvorog, tvorozhnySyr])
      expect(draft.items).toHaveLength(1)
      expect(draft.items[0]!.name).toBe('Творог')
      expect(draft.items[0]!.grams).toBe(200)
      expect(draft.items[0]!.source).toBe('library')
      expect(draft.parseSource).toBe('library')
    },
  )

  it('does not pick Творожный сыр when only that product exists for творога', () => {
    const draft = parseMealLocal('200 гр творога', [tvorozhnySyr])
    expect(draft.items[0]!.name).not.toBe('Творожный сыр')
    expect(draft.items[0]!.source).toBe('estimate')
  })

  it('empty-ish unknown food stays estimate', () => {
    const draft = parseMealLocal('хумус из марса 50 г', [])
    expect(draft.items[0]!.source).toBe('estimate')
    expect(draft.items[0]!.name).toMatch(/хумус/i)
  })
})
