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
