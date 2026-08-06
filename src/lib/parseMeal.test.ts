import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FoodRef } from '../types'
import { generateAliases } from './foodAliases'
import { finalizeDraft, parseMeal } from './parseMeal'

vi.mock('./parseMealLlm', async () => {
  const actual = await vi.importActual<typeof import('./parseMealLlm')>('./parseMealLlm')
  return {
    ...actual,
    isLlmConfigured: vi.fn(() => false),
    parseMealWithLlm: vi.fn(),
  }
})

import { isLlmConfigured, parseMealWithLlm } from './parseMealLlm'

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
    expect(draft.items[0]!.source).toBe('estimate')
    expect(draft.items[0]!.foodId).toBeUndefined()
  })

  it('drops wrong foodId even when model marked source=estimate', () => {
    const draft = finalizeDraft(
      'snack',
      [
        {
          name: 'Творожный сыр',
          grams: 200,
          foodId: 't2',
          kcal: 500,
          protein: 12,
          fat: 48,
          carbs: 6,
          source: 'estimate',
        },
      ],
      [tvorozhnySyr],
      false,
      undefined,
      'deepseek',
      '200 гр творог',
    )
    expect(draft.items[0]!.name).toBe('творог')
    expect(draft.items[0]!.source).toBe('estimate')
    expect(draft.items[0]!.foodId).toBeUndefined()
  })

  it('keeps user wording when model renames without foodId', () => {
    const draft = finalizeDraft(
      'snack',
      [
        {
          name: 'Творожный сыр',
          grams: 200,
          kcal: 180,
          protein: 30,
          fat: 10,
          carbs: 6,
          source: 'estimate',
        },
      ],
      [tvorozhnySyr],
      false,
      undefined,
      'deepseek',
      '200 гр творог',
    )
    expect(draft.items[0]!.name).toBe('творог')
    expect(draft.items[0]!.foodId).toBeUndefined()
    expect(draft.items[0]!.kcal).toBe(180)
  })

  it('promotes estimate item to library when name matches catalog', () => {
    const draft = finalizeDraft(
      'breakfast',
      [
        {
          name: 'Творожный сыр',
          grams: 30,
          kcal: 80,
          protein: 2,
          fat: 7,
          carbs: 1,
          source: 'estimate',
        },
      ],
      [tvorog, tvorozhnySyr],
      false,
      undefined,
      'deepseek',
      'творожный сыр 30 г',
    )
    expect(draft.items[0]!.name).toBe('Творожный сыр')
    expect(draft.items[0]!.foodId).toBe('t2')
    expect(draft.items[0]!.source).toBe('library')
    expect(draft.items[0]!.kcal).toBe(75) // 250 * 0.3
  })
})

describe('parseMeal', () => {
  beforeEach(() => {
    vi.mocked(isLlmConfigured).mockReturnValue(false)
    vi.mocked(parseMealWithLlm).mockReset()
  })

  it('rejects empty text', async () => {
    await expect(parseMeal('  ', [])).rejects.toThrow(/Введите/)
  })

  it('library-matches leading grams without LLM', async () => {
    const draft = await parseMeal('200 гр творога', [tvorog, tvorozhnySyr])
    expect(draft.items[0]!.name).toBe('Творог')
    expect(draft.items[0]!.grams).toBe(200)
    expect(draft.parseSource).toBe('library')
    expect(parseMealWithLlm).not.toHaveBeenCalled()
  })

  it('resolves multi-item catalog lists locally without DeepSeek', async () => {
    vi.mocked(isLlmConfigured).mockReturnValue(true)
    const caramel: FoodRef = {
      id: 'c1',
      name: 'Карамель мягкая',
      aliases: generateAliases('Карамель мягкая'),
      per100g: { kcal: 400, protein: 0, fat: 0, carbs: 100 },
      kind: 'ingredient',
      portionGrams: 20,
    }
    const iriska: FoodRef = {
      id: 'i1',
      name: 'Ириска',
      aliases: generateAliases('Ириска'),
      per100g: { kcal: 450, protein: 2, fat: 10, carbs: 80 },
      kind: 'ingredient',
      portionGrams: 15,
    }
    const draft = await parseMeal('карамель мягкая, ириска', [caramel, iriska])
    expect(draft.parseSource).toBe('library')
    expect(draft.items.map((i) => i.name)).toEqual(['Карамель мягкая', 'Ириска'])
    expect(draft.items.every((i) => i.source === 'library')).toBe(true)
    expect(parseMealWithLlm).not.toHaveBeenCalled()
  })

  it('calls DeepSeek when a list item is missing from the catalog', async () => {
    vi.mocked(isLlmConfigured).mockReturnValue(true)
    vi.mocked(parseMealWithLlm).mockResolvedValue({
      mealType: 'snack',
      items: [
        {
          name: 'Творог',
          grams: 200,
          foodId: 't1',
          ...tvorog.per100g,
          source: 'library',
        },
        {
          name: 'хумус из марса',
          grams: 50,
          kcal: 120,
          protein: 4,
          fat: 8,
          carbs: 10,
          source: 'estimate',
        },
      ],
      totals: { kcal: 0, protein: 0, fat: 0, carbs: 0 },
      isApproximate: true,
      eatingOut: false,
      parseSource: 'deepseek',
    })

    const draft = await parseMeal('творог 200 г, хумус из марса 50 г', [tvorog])
    expect(parseMealWithLlm).toHaveBeenCalledOnce()
    expect(draft.parseSource).toBe('deepseek')
    expect(draft.items).toHaveLength(2)
  })
})
