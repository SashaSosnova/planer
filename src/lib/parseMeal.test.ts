import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FoodRef } from '../types'
import { generateAliases } from './foodAliases'
import { finalizeDraft, parseMeal } from './parseMeal'
import { applyCatalogToSplit } from './parseMealCatalogFirst'

vi.mock('./parseMealLlm', () => ({
  isLlmConfigured: vi.fn(() => false),
}))

vi.mock('./parseMealCatalogFirst', async () => {
  const actual = await vi.importActual<typeof import('./parseMealCatalogFirst')>(
    './parseMealCatalogFirst',
  )
  return {
    ...actual,
    parseMealCatalogFirst: vi.fn(),
  }
})

import { isLlmConfigured } from './parseMealLlm'
import { parseMealCatalogFirst } from './parseMealCatalogFirst'

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

describe('finalizeDraft (cloud library guard)', () => {
  it('replaces stub 100/200 g with catalog portion when text has no weights', () => {
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
    const draft = finalizeDraft(
      'breakfast',
      [
        { name: 'Бутерброд', grams: 100, foodId: 's1', source: 'library' },
        { name: 'Кофе', grams: 200, foodId: 'c1', source: 'library' },
      ],
      [sandwich, coffee],
      false,
      undefined,
      'deepseek',
      'бутерброд и кофе',
    )
    expect(draft.items.map((i) => i.grams)).toEqual([180, 250])
  })

  it('rejects LLM foodId Творожный сыр for query творога when Творог exists', () => {
    const draft = finalizeDraft(
      'snack',
      [
        {
          name: 'Творожный сыр',
          grams: 200,
          foodId: 't2',
          source: 'library',
        },
      ],
      [tvorog, tvorozhnySyr],
      false,
      undefined,
      'cloud',
      '200 гр творога',
    )
    expect(draft.items[0]!.name).toBe('Творог')
    expect(draft.items[0]!.foodId).toBe('t1')
    expect(draft.items[0]!.source).toBe('library')
    expect(draft.items[0]!.grams).toBe(200)
  })

  it('falls back to estimate when catalog only has Творожный сыр', () => {
    const draft = finalizeDraft(
      'snack',
      [
        {
          name: 'Творожный сыр',
          grams: 200,
          foodId: 't2',
          source: 'library',
        },
      ],
      [tvorozhnySyr],
      false,
      undefined,
      'cloud',
      '200 гр творога',
    )
    expect(draft.items[0]!.name).toBe('творога')
    expect(draft.items[0]!.foodId).toBeUndefined()
    expect(draft.items[0]!.source).toBe('estimate')
  })

  it('rematches LLM estimate «творог» without foodId to catalog Творог', () => {
    const draft = finalizeDraft(
      'snack',
      [
        {
          name: 'творог',
          grams: 200,
          source: 'estimate',
          kcal: 999,
          protein: 1,
          fat: 1,
          carbs: 1,
        },
      ],
      [tvorog, tvorozhnySyr],
      false,
      undefined,
      'cloud',
      'творог 200 г',
    )
    expect(draft.items[0]!.name).toBe('Творог')
    expect(draft.items[0]!.foodId).toBe('t1')
    expect(draft.items[0]!.source).toBe('library')
    expect(draft.items[0]!.kcal).toBe(200)
  })

  it('keeps LLM estimate macros when rematch would pick a false friend', () => {
    const draft = finalizeDraft(
      'snack',
      [
        {
          name: 'Творожный сыр',
          grams: 30,
          source: 'estimate',
          kcal: 75,
          protein: 1.8,
          fat: 7.2,
          carbs: 0.9,
        },
      ],
      [tvorog, tvorozhnySyr],
      false,
      undefined,
      'cloud',
      'творожный сыр 30 г',
    )
    expect(draft.items[0]!.name).toBe('Творожный сыр')
    expect(draft.items[0]!.foodId).toBe('t2')
    expect(draft.items[0]!.source).toBe('library')
    expect(draft.items[0]!.kcal).toBe(75)
  })
})

describe('applyCatalogToSplit', () => {
  it('uses portion when grams null; keeps explicit grams', () => {
    const egg: FoodRef = {
      id: 'e1',
      name: 'Яйцо куриное',
      aliases: generateAliases('Яйцо куриное'),
      per100g: { kcal: 157, protein: 13, fat: 11, carbs: 0.7 },
      kind: 'ingredient',
      portionGrams: 55,
    }
    const butter: FoodRef = {
      id: 'b1',
      name: 'Масло сливочное',
      aliases: generateAliases('Масло сливочное'),
      per100g: { kcal: 748, protein: 0.5, fat: 82.5, carbs: 0.8 },
      kind: 'ingredient',
      portionGrams: 10,
    }
    const { items, unknown } = applyCatalogToSplit(
      [
        { name: 'яйцо куриное', grams: null },
        { name: 'масло сливочное', grams: 2 },
        { name: 'хумус из марса', grams: 50 },
      ],
      [egg, butter],
      false,
    )
    expect(unknown).toEqual([{ index: 2, name: 'хумус из марса', grams: 50 }])
    expect(items[0]).toMatchObject({ name: 'Яйцо куриное', grams: 55, source: 'library' })
    expect(items[1]).toMatchObject({ name: 'Масло сливочное', grams: 2, source: 'library' })
    expect(items[2]).toBeNull()
  })
})

describe('parseMeal', () => {
  beforeEach(() => {
    vi.mocked(isLlmConfigured).mockReturnValue(false)
    vi.mocked(parseMealCatalogFirst).mockReset()
  })

  it('rejects empty text', async () => {
    await expect(parseMeal('  ', [])).rejects.toThrow(/Введите/)
  })

  it('library-matches leading grams without LLM', async () => {
    const draft = await parseMeal('200 гр творога', [tvorog, tvorozhnySyr])
    expect(draft.items[0]!.name).toBe('Творог')
    expect(draft.items[0]!.grams).toBe(200)
    expect(draft.parseSource).toBe('library')
    expect(parseMealCatalogFirst).not.toHaveBeenCalled()
  })

  it('uses catalog-first LLM pipeline when configured', async () => {
    vi.mocked(isLlmConfigured).mockReturnValue(true)
    vi.mocked(parseMealCatalogFirst).mockResolvedValue({
      mealType: 'breakfast',
      items: [
        {
          name: 'Яйцо куриное',
          grams: 55,
          foodId: 'e1',
          kcal: 86,
          protein: 7,
          fat: 6,
          carbs: 0.4,
          source: 'library',
        },
        {
          name: 'Масло сливочное',
          grams: 2,
          foodId: 'b1',
          kcal: 15,
          protein: 0,
          fat: 1.7,
          carbs: 0,
          source: 'library',
        },
      ],
      totals: { kcal: 101, protein: 7, fat: 7.7, carbs: 0.4 },
      isApproximate: false,
      eatingOut: false,
      parseSource: 'library',
    })

    const text = `яйцо куриное
масло сливочное 2 г`
    const draft = await parseMeal(text, [])
    expect(parseMealCatalogFirst).toHaveBeenCalledOnce()
    expect(draft.items).toHaveLength(2)
    expect(draft.items[0]!.grams).toBe(55)
    expect(draft.items[1]!.grams).toBe(2)
  })

  it('falls back to local when LLM pipeline fails', async () => {
    vi.mocked(isLlmConfigured).mockReturnValue(true)
    vi.mocked(parseMealCatalogFirst).mockRejectedValue(new Error('offline'))
    const draft = await parseMeal('творог 200 г', [tvorog])
    expect(draft.items[0]!.name).toBe('Творог')
    expect(draft.items[0]!.grams).toBe(200)
  })
})
