import { describe, expect, it } from 'vitest'
import type { FoodRef } from '../types'
import { generateAliases } from './foodAliases'
import { finalizeDraft, parseMeal } from './parseMeal'

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
  it('rejects empty text', async () => {
    await expect(parseMeal('  ', [])).rejects.toThrow(/Введите/)
  })

  it('library-matches leading grams without LLM', async () => {
    const draft = await parseMeal('200 гр творога', [tvorog, tvorozhnySyr])
    expect(draft.items[0]!.name).toBe('Творог')
    expect(draft.items[0]!.grams).toBe(200)
    expect(draft.parseSource).toBe('library')
  })
})
