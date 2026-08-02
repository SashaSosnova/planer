import { describe, expect, it } from 'vitest'
import { buildParseFoodLabelPrompt, normalizeFoodLabelResult } from './parseFoodLabel'

describe('buildParseFoodLabelPrompt', () => {
  it('includes OCR text and place hint', () => {
    const prompt = buildParseFoodLabelPrompt('Творог 5% белки 16', 'Пятёрочка')
    expect(prompt).toContain('Творог 5%')
    expect(prompt).toContain('Пятёрочка')
    expect(prompt).toContain('per100g')
    expect(prompt).toContain('этикетки')
  })
})

describe('normalizeFoodLabelResult', () => {
  it('keeps valid items and place', () => {
    const result = normalizeFoodLabelResult({
      place: 'Mechtai',
      items: [
        {
          name: 'Латте',
          per100g: { kcal: 45, protein: 2, fat: 2, carbs: 5 },
        },
        {
          name: '  ',
          per100g: { kcal: 100, protein: 0, fat: 0, carbs: 0 },
        },
        {
          name: 'Мусор',
          per100g: { kcal: 2, protein: 0, fat: 0, carbs: 0 },
        },
      ],
    })
    expect(result.place).toBe('Mechtai')
    expect(result.items).toHaveLength(1)
    expect(result.items[0]!.name).toBe('Латте')
    expect(result.items[0]!.per100g.kcal).toBe(45)
  })

  it('falls back to placeHint when LLM place empty', () => {
    const result = normalizeFoodLabelResult(
      {
        place: null,
        items: [
          {
            name: 'Сырок',
            per100g: { kcal: 380, protein: 8, fat: 20, carbs: 35 },
            note: 'оценка',
          },
        ],
      },
      { placeHint: 'ВкусВилл' },
    )
    expect(result.place).toBe('ВкусВилл')
    expect(result.items[0]!.note).toBe('оценка')
  })

  it('drops impossible macros', () => {
    const result = normalizeFoodLabelResult({
      items: [
        {
          name: 'Масло',
          per100g: { kcal: 900, protein: 0, fat: 99, carbs: 0 },
        },
        {
          name: 'Нереально',
          per100g: { kcal: 200, protein: 150, fat: 0, carbs: 0 },
        },
      ],
    })
    expect(result.items.map((i) => i.name)).toEqual(['Масло'])
  })
})
