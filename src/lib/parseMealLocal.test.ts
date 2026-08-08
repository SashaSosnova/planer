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

  it('uses catalog portionGrams when weight omitted', () => {
    const sandwich: FoodRef = {
      id: 's1',
      name: 'Бутерброд',
      aliases: ['бутерброд'],
      per100g: { kcal: 250, protein: 12, fat: 15, carbs: 20 },
      kind: 'dish',
      portionGrams: 180,
    }
    const coffee: FoodRef = {
      id: 'c1',
      name: 'Кофе',
      aliases: ['кофе'],
      per100g: { kcal: 2, protein: 0.1, fat: 0, carbs: 0.3 },
      kind: 'ingredient',
      portionGrams: 250,
    }
    const draft = parseMealLocal('бутерброд и кофе', [sandwich, coffee])
    expect(draft.items.map((i) => ({ name: i.name, grams: i.grams, id: i.foodId }))).toEqual([
      { name: 'Бутерброд', grams: 180, id: 's1' },
      { name: 'Кофе', grams: 250, id: 'c1' },
    ])
  })

  it('uses defaults when coffee with milk has no weight', () => {
    const draft = parseMealLocal('кофе с молоком', [])
    expect(draft.items).toHaveLength(2)
    expect(draft.items[0]!.grams).toBe(200)
    expect(draft.items[1]!.grams).toBe(60)
  })

  it('keeps catalog dish «кофе с молоком» in a list without splitting', () => {
    const coffeeMilk: FoodRef = {
      id: 'cm1',
      name: 'Кофе с молоком',
      aliases: generateAliases('Кофе с молоком'),
      per100g: { kcal: 30, protein: 1.5, fat: 1.5, carbs: 2.5 },
      kind: 'dish',
      portionGrams: 250,
    }
    const iriska: FoodRef = {
      id: 'i1',
      name: 'Ириска',
      aliases: generateAliases('Ириска'),
      per100g: { kcal: 450, protein: 2, fat: 10, carbs: 80 },
      kind: 'ingredient',
      portionGrams: 15,
    }
    const draft = parseMealLocal('кофе с молоком, ириска', [coffeeMilk, iriska])
    expect(draft.items).toHaveLength(2)
    expect(draft.items.map((i) => i.name)).toEqual(['Кофе с молоком', 'Ириска'])
    expect(draft.items.every((i) => i.source === 'library')).toBe(true)
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
    expect(draft.items[0]!.source).toBe('unknown')
  })

  it('empty-ish unknown food is marked not found (no fake kcal)', () => {
    const draft = parseMealLocal('хумус из марса 50 г', [])
    expect(draft.items[0]!.source).toBe('unknown')
    expect(draft.items[0]!.kcal).toBe(0)
    expect(draft.items[0]!.name).toMatch(/хумус/i)
  })
})
