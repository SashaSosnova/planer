import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FoodRef } from '../types'
import { generateAliases } from './foodAliases'
import { mapLlmResultToDraft } from './parseMealLlm'
import {
  PHOTO_MEAL_NOTES,
  buildParseMealPhotoPrompt,
  parseMealFromPhoto,
} from './parseMealPhoto'

const kurica: FoodRef = {
  id: 'k1',
  name: 'Курица',
  aliases: generateAliases('Курица'),
  per100g: { kcal: 165, protein: 31, fat: 3.6, carbs: 0 },
  kind: 'ingredient',
}

describe('buildParseMealPhotoPrompt', () => {
  it('asks for approximate portion JSON and includes catalog at home', () => {
    const prompt = buildParseMealPhotoPrompt({
      mealType: 'lunch',
      eatingOut: false,
      foods: [kurica],
    })
    expect(prompt).toContain('По фото еды')
    expect(prompt).toContain('ориентировочные')
    expect(prompt).toContain('k1')
    expect(prompt).toContain('Курица')
    expect(prompt).toContain('"mealType"')
  })

  it('omits catalog when eating out', () => {
    const prompt = buildParseMealPhotoPrompt({
      eatingOut: true,
      foods: [kurica],
    })
    expect(prompt).toContain('eatingOut=true')
    expect(prompt).not.toContain('k1')
  })
})

describe('mapLlmResultToDraft (photo options)', () => {
  it('forces approximate and photo notes prefix', () => {
    const draft = mapLlmResultToDraft(
      {
        mealType: 'dinner',
        items: [
          {
            name: 'Паста с курицей',
            grams: 320,
            needsEstimate: true,
            kcal: 450,
            protein: 28,
            fat: 12,
            carbs: 55,
            source: 'estimate',
          },
        ],
      },
      [kurica],
      'lunch',
      false,
      { forceApproximate: true, notesPrefix: PHOTO_MEAL_NOTES },
    )
    expect(draft.isApproximate).toBe(true)
    expect(draft.parseSource).toBe('deepseek')
    expect(draft.notes).toBe(PHOTO_MEAL_NOTES)
    expect(draft.items).toHaveLength(1)
    expect(draft.items[0]!.name).toBe('Паста с курицей')
    expect(draft.totals.kcal).toBe(450)
  })

  it('uses library macros when foodId matches at home', () => {
    const draft = mapLlmResultToDraft(
      {
        items: [
          {
            name: 'Курица',
            grams: 100,
            foodId: 'k1',
            needsEstimate: false,
            source: 'library',
          },
        ],
      },
      [kurica],
      'lunch',
      false,
    )
    expect(draft.items[0]!.source).toBe('library')
    expect(draft.items[0]!.kcal).toBe(165)
    expect(draft.isApproximate).toBe(false)
  })
})

describe('parseMealFromPhoto', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('throws when DeepSeek is not configured', async () => {
    vi.stubEnv('VITE_DEEPSEEK_API_KEY', '')
    await expect(
      parseMealFromPhoto('data:image/jpeg;base64,xx', [], 'lunch', false),
    ).rejects.toThrow(/VITE_DEEPSEEK_API_KEY/)
  })

  it('maps vision JSON into an approximate draft', async () => {
    vi.stubEnv('VITE_DEEPSEEK_API_KEY', 'test-key')
    const vision = vi.spyOn(await import('./deepseek'), 'deepseekJsonVision').mockResolvedValue({
      mealType: 'lunch',
      eatingOut: false,
      items: [
        {
          name: 'Салат',
          grams: 250,
          needsEstimate: true,
          kcal: 180,
          protein: 8,
          fat: 10,
          carbs: 12,
          source: 'estimate',
        },
      ],
    })

    const draft = await parseMealFromPhoto(
      'data:image/jpeg;base64,abc',
      [kurica],
      'lunch',
      false,
    )

    expect(vision).toHaveBeenCalledOnce()
    const parts = vision.mock.calls[0]![0] as Array<{ type: string }>
    expect(parts.some((p) => p.type === 'image_url')).toBe(true)
    expect(parts.some((p) => p.type === 'text')).toBe(true)
    expect(draft.isApproximate).toBe(true)
    expect(draft.notes).toContain('фото')
    expect(draft.items[0]!.name).toBe('Салат')
  })
})
