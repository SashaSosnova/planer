import { describe, expect, it } from 'vitest'
import {
  buildParseFoodLabelPrompt,
  likelyMisTaggedPortionBasis,
  macrosLookPlausible,
  normalizeFoodLabelResult,
} from './parseFoodLabel'

describe('buildParseFoodLabelPrompt', () => {
  it('includes source text, brand hint and portion fields', () => {
    const prompt = buildParseFoodLabelPrompt('Творог 5% белки 16', 'Пятёрочка')
    expect(prompt).toContain('Творог 5%')
    expect(prompt).toContain('Пятёрочка')
    expect(prompt).toContain('portionGrams')
    expect(prompt).toContain('macrosBasis')
    expect(prompt).toContain('НЕ калории')
    expect(prompt).toContain('На 100 г')
    expect(prompt).toContain('вставка пользователя')
  })
})

describe('macrosLookPlausible', () => {
  it('rejects price mistaken for kcal (Whopper OCR)', () => {
    expect(
      macrosLookPlausible({ kcal: 339.4, protein: 3.6, fat: 5.8, carbs: 6.9 }),
    ).toBe(false)
  })

  it('accepts real per100g burger macros', () => {
    expect(
      macrosLookPlausible({ kcal: 263, protein: 10, fat: 16, carbs: 19 }),
    ).toBe(true)
  })
})

describe('normalizeFoodLabelResult', () => {
  it('folds legacy place into item brand', () => {
    const result = normalizeFoodLabelResult({
      place: 'Mechtai',
      items: [
        {
          name: 'Латте',
          macros: { kcal: 45, protein: 2, fat: 2, carbs: 5 },
          macrosBasis: 'per100',
          portionGrams: 250,
        },
        {
          name: '  ',
          macros: { kcal: 100, protein: 0, fat: 0, carbs: 0 },
          macrosBasis: 'per100',
        },
        {
          name: 'Мусор',
          macros: { kcal: 2, protein: 0, fat: 0, carbs: 0 },
          macrosBasis: 'per100',
        },
      ],
    })
    expect(result.items).toHaveLength(1)
    expect(result.items[0]!.name).toBe('Латте')
    expect(result.items[0]!.brand).toBe('Mechtai')
    expect(result.items[0]!.per100g.kcal).toBe(45)
    expect(result.items[0]!.portionGrams).toBe(250)
  })

  it('converts portion macros to per100g', () => {
    const result = normalizeFoodLabelResult({
      items: [
        {
          name: 'Паста карбонара',
          macros: { kcal: 600, protein: 24, fat: 28, carbs: 60 },
          macrosBasis: 'portion',
          portionGrams: 400,
        },
      ],
    })
    expect(result.items).toHaveLength(1)
    expect(result.items[0]!.portionGrams).toBe(400)
    expect(result.items[0]!.per100g.kcal).toBe(150)
    expect(result.items[0]!.per100g.protein).toBe(6)
  })

  it('falls back to brandHint when brand empty', () => {
    const result = normalizeFoodLabelResult(
      {
        place: null,
        items: [
          {
            name: 'Сырок',
            macros: { kcal: 380, protein: 8, fat: 20, carbs: 35 },
            macrosBasis: 'per100',
            note: 'оценка',
          },
        ],
      },
      { brandHint: 'ВкусВилл' },
    )
    expect(result.items[0]!.brand).toBe('ВкусВилл')
    expect(result.items[0]!.note).toBe('оценка')
  })

  it('prefers item brand over legacy place', () => {
    const result = normalizeFoodLabelResult({
      place: 'Пятёрочка',
      items: [
        {
          name: 'Йогурт',
          brand: 'Простоквашино',
          macros: { kcal: 80, protein: 4, fat: 3, carbs: 10 },
          macrosBasis: 'per100',
        },
      ],
    })
    expect(result.items[0]!.brand).toBe('Простоквашино')
  })

  it('drops impossible macros', () => {
    const result = normalizeFoodLabelResult({
      items: [
        {
          name: 'Масло',
          macros: { kcal: 900, protein: 0, fat: 99, carbs: 0 },
          macrosBasis: 'per100',
        },
        {
          name: 'Нереально',
          macros: { kcal: 200, protein: 150, fat: 0, carbs: 0 },
          macrosBasis: 'per100',
        },
      ],
    })
    expect(result.items.map((i) => i.name)).toEqual(['Масло'])
  })

  it('accepts legacy per100g field', () => {
    const result = normalizeFoodLabelResult({
      items: [
        {
          name: 'Йогурт',
          per100g: { kcal: 80, protein: 4, fat: 3, carbs: 10 },
          portionGrams: 125,
        },
      ],
    })
    expect(result.items[0]!.per100g.kcal).toBe(80)
    expect(result.items[0]!.portionGrams).toBe(125)
  })

  it('drops Whopper price-as-kcal row', () => {
    const result = normalizeFoodLabelResult({
      place: 'Бургер Кинг',
      items: [
        {
          name: 'Воппер',
          macros: { kcal: 339.4, protein: 3.6, fat: 5.8, carbs: 6.9 },
          macrosBasis: 'per100',
          portionGrams: 274,
        },
      ],
    })
    expect(result.items).toEqual([])
  })

  it('does not rescale per-100g Whopper macros via weight', () => {
    expect(
      likelyMisTaggedPortionBasis(
        { kcal: 263, protein: 10, fat: 16, carbs: 19 },
        274,
      ),
    ).toBe(true)

    const result = normalizeFoodLabelResult({
      place: 'Бургер Кинг',
      items: [
        {
          name: 'Воппер',
          macros: { kcal: 263, protein: 10, fat: 16, carbs: 19 },
          macrosBasis: 'portion', // wrong — UI was «На 100 г»
          portionGrams: 274,
        },
      ],
    })
    expect(result.items).toHaveLength(1)
    expect(result.items[0]!.brand).toBe('Бургер Кинг')
    expect(result.items[0]!.per100g.kcal).toBe(263)
    expect(result.items[0]!.per100g.protein).toBe(10)
    expect(result.items[0]!.portionGrams).toBe(274)
  })

  it('still converts true portion macros (pasta bowl)', () => {
    expect(
      likelyMisTaggedPortionBasis(
        { kcal: 600, protein: 24, fat: 28, carbs: 60 },
        400,
      ),
    ).toBe(false)
  })

  it('rejects mixed НА 100Г / БЛЮДО columns', () => {
    // 165 kcal + 11/4/20 from 100g column is OK
    expect(
      macrosLookPlausible({ kcal: 165, protein: 11, fat: 4, carbs: 20 }),
    ).toBe(true)
    // 165 kcal with dish protein 25 mixed in
    expect(
      macrosLookPlausible({ kcal: 165, protein: 25, fat: 4, carbs: 20 }),
    ).toBe(false)

    const result = normalizeFoodLabelResult({
      items: [
        {
          name: 'Крылья медово-чесночные',
          macros: { kcal: 165, protein: 25, fat: 4, carbs: 20 },
          macrosBasis: 'per100',
          portionGrams: 220,
        },
        {
          name: 'Крылья медово-чесночные',
          macros: { kcal: 165, protein: 11, fat: 4, carbs: 20 },
          macrosBasis: 'per100',
          portionGrams: 220,
        },
      ],
    })
    expect(result.items).toHaveLength(1)
    expect(result.items[0]!.per100g).toEqual({
      kcal: 165,
      protein: 11,
      fat: 4,
      carbs: 20,
    })
    expect(result.items[0]!.portionGrams).toBe(220)
  })
})
