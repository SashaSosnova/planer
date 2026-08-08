/**
 * Catalog-first meal pipeline: split → applyCatalogToSplit → estimate unknowns.
 * Samples reused from human/newline/fixes tests + user-reported diary patterns.
 * LLM is mocked via deepseekJson — no API key required.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FoodRef, MealType } from '../types'
import { generateAliases } from './foodAliases'
import { scalePer100g } from './nutrition'
import { buildMealEstimatePrompt, buildMealSplitPrompt, type MealSplitLine } from './parseMealSplit'

vi.mock('./deepseek', () => ({
  deepseekJson: vi.fn(),
  isDeepseekConfigured: vi.fn(() => true),
}))

vi.mock('./parseMealLlm', () => ({
  isLlmConfigured: vi.fn(() => false),
}))

import { deepseekJson } from './deepseek'
import { isLlmConfigured } from './parseMealLlm'
import {
  applyCatalogToSplit,
  estimateMealItemMacros,
  estimateUnknownMacrosWithLlm,
  parseMealCatalogFirst,
  splitMealTextWithLlm,
} from './parseMealCatalogFirst'
import { parseMeal } from './parseMeal'
import { parseMealLocal } from './parseMealLocal'

function food(
  id: string,
  name: string,
  per100g: { kcal: number; protein: number; fat: number; carbs: number },
  opts: { portionGrams?: number; kind?: 'ingredient' | 'dish'; extraAliases?: string[] } = {},
): FoodRef {
  const aliases = [...new Set([...generateAliases(name), ...(opts.extraAliases ?? [])])]
  return {
    id,
    name,
    aliases,
    per100g,
    kind: opts.kind ?? 'ingredient',
    ...(opts.portionGrams != null ? { portionGrams: opts.portionGrams } : {}),
  }
}

/** Shared mini-catalog for realistic diary cases. */
const CATALOG: FoodRef[] = [
  food('egg', 'Яйцо куриное', { kcal: 157, protein: 13, fat: 11, carbs: 0.7 }, {
    portionGrams: 55,
    extraAliases: ['яйцо', 'яйца', 'яиц'],
  }),
  food('parmesan', 'Сыр пармезан', { kcal: 392, protein: 33, fat: 29, carbs: 0 }, { portionGrams: 20 }),
  food('butter', 'Масло сливочное', { kcal: 748, protein: 0.5, fat: 82.5, carbs: 0.8 }, {
    portionGrams: 10,
  }),
  food('ham', 'Ветчина ореховая', { kcal: 145, protein: 18, fat: 8, carbs: 1 }, { portionGrams: 30 }),
  food('tvorog', 'Творог', { kcal: 100, protein: 16, fat: 5, carbs: 3 }),
  food('creamCheese', 'Творожный сыр', { kcal: 250, protein: 6, fat: 24, carbs: 3 }),
  food('cheese', 'Сыр', { kcal: 350, protein: 25, fat: 27, carbs: 0 }),
  food('milk', 'Молоко', { kcal: 52, protein: 2.9, fat: 2.5, carbs: 4.7 }, { portionGrams: 200 }),
  food('coffee', 'Кофе', { kcal: 2, protein: 0.1, fat: 0, carbs: 0.3 }, { portionGrams: 200 }),
  food('grechka', 'Гречка', { kcal: 110, protein: 4, fat: 1, carbs: 21 }),
  food('chicken', 'Курица', { kcal: 110, protein: 23, fat: 1.5, carbs: 0 }, {
    extraAliases: ['куриная грудка', 'курицы'],
  }),
  food('bread', 'Хлеб', { kcal: 265, protein: 9, fat: 3, carbs: 49 }, { portionGrams: 30 }),
  food('apple', 'Яблоко', { kcal: 52, protein: 0.3, fat: 0.2, carbs: 14 }, { portionGrams: 150 }),
  food('oatmeal', 'Овсянка', { kcal: 88, protein: 3, fat: 1.5, carbs: 15 }, { portionGrams: 40 }),
  food('caramel', 'Карамель мягкая', { kcal: 400, protein: 1, fat: 8, carbs: 80 }, { portionGrams: 20 }),
  food('iriska', 'Ириска', { kcal: 450, protein: 2, fat: 10, carbs: 80 }, { portionGrams: 15 }),
  food('rice', 'Рис', { kcal: 130, protein: 2.7, fat: 0.3, carbs: 28 }),
]

function libMacros(f: FoodRef, grams: number) {
  return { ...scalePer100g(f.per100g, grams), source: 'library' as const, foodId: f.id, name: f.name, grams }
}

beforeEach(() => {
  vi.mocked(deepseekJson).mockReset()
  vi.mocked(isLlmConfigured).mockReturnValue(false)
})

// ─── applyCatalogToSplit (pure, no LLM) ─────────────────────────────────────

describe('applyCatalogToSplit', () => {
  it('null grams → catalog portionGrams; explicit grams win', () => {
    const { items, unknown } = applyCatalogToSplit(
      [
        { name: 'яйцо куриное', grams: null },
        { name: 'сыр пармезан', grams: 5 },
        { name: 'масло сливочное', grams: 2 },
        { name: 'ветчина ореховая', grams: 10 },
      ],
      CATALOG,
      false,
    )
    expect(unknown).toEqual([])
    expect(items.map((i) => ({ n: i!.name, g: i!.grams, s: i!.source }))).toEqual([
      { n: 'Яйцо куриное', g: 55, s: 'library' },
      { n: 'Сыр пармезан', g: 5, s: 'library' },
      { n: 'Масло сливочное', g: 2, s: 'library' },
      { n: 'Ветчина ореховая', g: 10, s: 'library' },
    ])
  })

  it('bare sweet names use portion (1 piece)', () => {
    const { items, unknown } = applyCatalogToSplit(
      [
        { name: 'яйцо куриное', grams: null },
        { name: 'карамель мягкая', grams: null },
        { name: 'ириска', grams: null },
      ],
      CATALOG,
      false,
    )
    expect(unknown).toEqual([])
    expect(items.map((i) => i!.grams)).toEqual([55, 20, 15])
  })

  it('unknown product keeps slot null and listed in unknown', () => {
    const { items, unknown } = applyCatalogToSplit(
      [
        { name: 'творог', grams: 200 },
        { name: 'хумус из марса', grams: 50 },
      ],
      CATALOG,
      false,
    )
    expect(items[0]).toMatchObject(libMacros(CATALOG.find((f) => f.id === 'tvorog')!, 200))
    expect(items[1]).toBeNull()
    expect(unknown).toEqual([{ index: 1, name: 'Хумус из марса', grams: 50 }])
  })

  it('unknown without grams uses name default or 100', () => {
    const { unknown } = applyCatalogToSplit([{ name: 'хумус из марса', grams: null }], CATALOG, false)
    expect(unknown[0]!.grams).toBe(100)
    expect(unknown[0]!.name).toBe('Хумус из марса')
  })

  it('unknown egg-like name without catalog still gets ~55 g via name default', () => {
    const { unknown } = applyCatalogToSplit([{ name: 'яйцо перепелиное', grams: null }], [], false)
    expect(unknown[0]!.grams).toBe(55)
  })

  it('eatingOut skips catalog matching — all unknown', () => {
    const { items, unknown } = applyCatalogToSplit(
      [{ name: 'паста карбонара', grams: null }],
      CATALOG,
      true,
    )
    expect(items[0]).toBeNull()
    expect(unknown).toHaveLength(1)
    expect(unknown[0]!.grams).toBe(300) // eatingOut default when no name rule
  })

  it('scales library macros from per100g', () => {
    const tvorog = CATALOG.find((f) => f.id === 'tvorog')!
    const { items } = applyCatalogToSplit([{ name: 'творог', grams: 200 }], [tvorog], false)
    expect(items[0]!.kcal).toBe(scalePer100g(tvorog.per100g, 200).kcal)
    expect(items[0]!.protein).toBe(scalePer100g(tvorog.per100g, 200).protein)
  })

  it('empty/whitespace name becomes «Блюдо» unknown', () => {
    const { unknown } = applyCatalogToSplit([{ name: '  ', grams: 100 }], CATALOG, false)
    expect(unknown[0]!.name).toBe('Блюдо')
  })

  it.each([
    {
      label: 'newline breakfast list',
      lines: [
        { name: 'яйцо куриное', grams: null },
        { name: 'сыр пармезан', grams: 5 },
        { name: 'масло сливочное', grams: 2 },
        { name: 'ветчина ореховая', grams: 10 },
      ] satisfies MealSplitLine[],
      expectGrams: [55, 5, 2, 10],
      expectUnknown: 0,
    },
    {
      label: 'comma multi known',
      lines: [
        { name: 'гречка', grams: 100 },
        { name: 'курица', grams: 100 },
        { name: 'хлеб', grams: 20 },
      ] satisfies MealSplitLine[],
      expectGrams: [100, 100, 20],
      expectUnknown: 0,
    },
    {
      label: 'coffee + milk as two lines',
      lines: [
        { name: 'кофе', grams: null },
        { name: 'молоко', grams: null },
      ] satisfies MealSplitLine[],
      expectGrams: [200, 200],
      expectUnknown: 0,
    },
    {
      label: 'mixed known + unknown',
      lines: [
        { name: 'овсянка', grams: 40 },
        { name: 'батончик протеиновый xyz', grams: 60 },
      ] satisfies MealSplitLine[],
      expectGrams: [40, null],
      expectUnknown: 1,
    },
  ])('$label', ({ lines, expectGrams, expectUnknown }) => {
    const { items, unknown } = applyCatalogToSplit(lines, CATALOG, false)
    expect(unknown).toHaveLength(expectUnknown)
    expectGrams.forEach((g, i) => {
      if (g == null) expect(items[i]).toBeNull()
      else expect(items[i]!.grams).toBe(g)
    })
  })
})

// ─── Prompts ────────────────────────────────────────────────────────────────

describe('catalog-first prompts', () => {
  it('split prompt forbids counting КБЖУ and piece-as-grams', () => {
    const p = buildMealSplitPrompt({
      text: 'яйцо\nсыр 5 г',
      mealType: 'breakfast',
      eatingOut: false,
    })
    expect(p).toMatch(/grams = null/i)
    expect(p).toMatch(/НЕ считай КБЖУ/i)
    expect(p).toMatch(/ЗАПРЕЩЕНО: штуки как граммы/i)
    expect(p).toContain('яйцо')
  })

  it('split prompt mentions coffee-with-milk split rule', () => {
    const p = buildMealSplitPrompt({
      text: 'кофе с молоком',
      eatingOut: false,
    })
    expect(p).toMatch(/кофе с молоком/i)
  })

  it('estimate prompt asks for portion macros and coffee-with-milk kcal floor', () => {
    const p = buildMealEstimatePrompt([{ name: 'салат цезарь', grams: 300 }])
    expect(p).toMatch(/не на 100 г/i)
    expect(p).toContain('салат цезарь')
    expect(p).toMatch(/кофе с молоком/i)
  })
})

// ─── split / estimate LLM wrappers (mocked deepseek) ───────────────────────

describe('splitMealTextWithLlm / estimateUnknownMacrosWithLlm', () => {
  it('maps null grams and drops empty names', async () => {
    vi.mocked(deepseekJson).mockResolvedValue({
      mealType: 'breakfast',
      items: [
        { name: 'яйцо', grams: null },
        { name: '', grams: 10 },
        { name: 'сыр', grams: 5 },
      ],
    })
    const split = await splitMealTextWithLlm('яйцо\nсыр 5 г', 'breakfast', false)
    expect(split.items).toEqual([
      { name: 'яйцо', grams: null },
      { name: 'сыр', grams: 5 },
    ])
  })

  it('treats non-positive grams as null', async () => {
    vi.mocked(deepseekJson).mockResolvedValue({
      items: [{ name: 'яйцо', grams: 0 }],
    })
    const split = await splitMealTextWithLlm('яйцо', undefined, false)
    expect(split.items[0]!.grams).toBeNull()
  })

  it('throws when LLM returns no items', async () => {
    vi.mocked(deepseekJson).mockResolvedValue({ items: [] })
    await expect(splitMealTextWithLlm('???', undefined, false)).rejects.toThrow(/не вернул/)
  })

  it('estimate missing rows stay empty (caller marks not found)', async () => {
    vi.mocked(deepseekJson).mockResolvedValue({ items: [] })
    const rows = await estimateUnknownMacrosWithLlm([{ name: 'хумус', grams: 50 }])
    expect(rows).toHaveLength(1)
    expect(rows[0]!.kcal).toBe(0)
    expect(rows[0]!.grams).toBe(50)
  })

  it('estimate returns empty for empty unknown list without calling API', async () => {
    const rows = await estimateUnknownMacrosWithLlm([])
    expect(rows).toEqual([])
    expect(deepseekJson).not.toHaveBeenCalled()
  })
})

// ─── parseMealCatalogFirst (mocked deepseek) ───────────────────────────────

describe('parseMealCatalogFirst', () => {
  function mockSplitThenEstimate(
    split: { mealType?: MealType; eatingOut?: boolean; items: MealSplitLine[]; notes?: string },
    estimates?: Array<{ name: string; grams: number; kcal: number; protein: number; fat: number; carbs: number }>,
  ) {
    vi.mocked(deepseekJson).mockImplementation(async (prompt: string) => {
      if (prompt.includes('Разбей текст')) return split
      if (prompt.includes('Оцени КБЖУ')) return { items: estimates ?? [] }
      throw new Error(`unexpected prompt: ${prompt.slice(0, 80)}`)
    })
  }

  it('all catalog hits → library parseSource, no estimate call needed', async () => {
    mockSplitThenEstimate({
      mealType: 'breakfast',
      items: [
        { name: 'яйцо куриное', grams: null },
        { name: 'масло сливочное', grams: 2 },
      ],
    })
    const draft = await parseMealCatalogFirst(
      `яйцо куриное
масло сливочное 2 г`,
      CATALOG,
      'breakfast',
      false,
    )
    expect(draft.items).toHaveLength(2)
    expect(draft.items.every((i) => i.source === 'library')).toBe(true)
    expect(draft.parseSource).toBe('library')
    expect(draft.isApproximate).toBe(false)
    expect(draft.items[0]!.grams).toBe(55)
    expect(draft.items[1]!.grams).toBe(2)
    // only split call
    expect(deepseekJson).toHaveBeenCalledTimes(1)
  })

  it('unknowns trigger estimate LLM and mark approximate', async () => {
    mockSplitThenEstimate(
      {
        mealType: 'lunch',
        items: [
          { name: 'гречка', grams: 100 },
          { name: 'хумус из марса', grams: 50 },
        ],
      },
      [{ name: 'хумус из марса', grams: 50, kcal: 80, protein: 4, fat: 5, carbs: 6 }],
    )
    const draft = await parseMealCatalogFirst('гречка 100 г, хумус из марса 50 г', CATALOG, 'lunch', false)
    expect(draft.items).toHaveLength(2)
    expect(draft.items[0]!.source).toBe('library')
    expect(draft.items[1]!.source).toBe('estimate')
    expect(draft.items[1]!.kcal).toBe(80)
    expect(draft.parseSource).toBe('deepseek')
    expect(draft.isApproximate).toBe(true)
    expect(draft.notes).toMatch(/справочник/i)
    expect(deepseekJson).toHaveBeenCalledTimes(2)
  })

  it('estimate LLM failure → mark not found (no fake kcal)', async () => {
    let call = 0
    vi.mocked(deepseekJson).mockImplementation(async (prompt: string) => {
      call++
      if (prompt.includes('Разбей текст')) {
        return { items: [{ name: 'хумус из марса', grams: 50 }] }
      }
      throw new Error('estimate offline')
    })
    const draft = await parseMealCatalogFirst('хумус из марса 50 г', CATALOG, undefined, false)
    expect(call).toBe(2)
    expect(draft.items[0]!.source).toBe('unknown')
    expect(draft.items[0]!.kcal).toBe(0)
  })

  it('zero macros on non-drink → mark not found', async () => {
    mockSplitThenEstimate(
      { items: [{ name: 'хумус', grams: 50 }] },
      [{ name: 'хумус', grams: 50, kcal: 0, protein: 0, fat: 0, carbs: 0 }],
    )
    const draft = await parseMealCatalogFirst('хумус 50 г', [], undefined, false)
    expect(draft.items[0]!.source).toBe('unknown')
    expect(draft.items[0]!.kcal).toBe(0)
  })

  it('water may keep ~0 kcal', async () => {
    mockSplitThenEstimate(
      { items: [{ name: 'вода', grams: 250 }] },
      [{ name: 'вода', grams: 250, kcal: 0, protein: 0, fat: 0, carbs: 0 }],
    )
    const draft = await parseMealCatalogFirst('вода 250 г', [], undefined, false)
    expect(draft.items[0]!.kcal).toBe(0)
  })

  it('eatingOut from split marks approximate and skips library', async () => {
    mockSplitThenEstimate(
      {
        eatingOut: true,
        items: [{ name: 'салат цезарь', grams: 300 }],
      },
      [{ name: 'салат цезарь', grams: 300, kcal: 420, protein: 25, fat: 28, carbs: 18 }],
    )
    const draft = await parseMealCatalogFirst(
      'Салат из курицы, капусты, моркови, перца, заправка оливковое масло 300 гр',
      CATALOG,
      undefined,
      true,
    )
    expect(draft.eatingOut).toBe(true)
    expect(draft.isApproximate).toBe(true)
    expect(draft.items[0]!.source).toBe('estimate')
    expect(draft.items[0]!.name).toMatch(/салат/i)
  })

  it('throws when split yields nothing usable after sanitize', async () => {
    mockSplitThenEstimate({ items: [{ name: 'x', grams: -1 }] })
    // grams coerced to null in splitMealTextWithLlm only — here we go through parseMealCatalogFirst
    // which calls splitMealTextWithLlm first. Negative grams → null → portion 100 → ok.
    // Force empty by returning empty after filter:
    vi.mocked(deepseekJson).mockResolvedValue({ items: [{ name: '' }] })
    await expect(parseMealCatalogFirst('???', CATALOG, undefined, false)).rejects.toThrow()
  })
})

// ─── parseMeal orchestration ───────────────────────────────────────────────

describe('parseMeal orchestration (catalog-first)', () => {
  it('single catalog hit fast path skips LLM even when configured', async () => {
    vi.mocked(isLlmConfigured).mockReturnValue(true)
    const draft = await parseMeal('200 гр творога', CATALOG)
    expect(draft.items[0]!.name).toBe('Творог')
    expect(draft.items[0]!.grams).toBe(200)
    expect(draft.parseSource).toBe('library')
    expect(deepseekJson).not.toHaveBeenCalled()
  })

  it('LLM on → catalog-first (deepseek) for multi-line list', async () => {
    vi.mocked(isLlmConfigured).mockReturnValue(true)
    vi.mocked(deepseekJson).mockImplementation(async (prompt: string) => {
      if (prompt.includes('Разбей текст')) {
        return {
          mealType: 'breakfast',
          items: [
            { name: 'яйцо куриное', grams: null },
            { name: 'сыр пармезан', grams: 5 },
            { name: 'масло сливочное', grams: 2 },
            { name: 'ветчина ореховая', grams: 10 },
          ],
        }
      }
      return { items: [] }
    })
    const text = `яйцо куриное
сыр пармезан 5 г
масло сливочное 2 г
ветчина ореховая 10 г`
    const draft = await parseMeal(text, CATALOG)
    expect(draft.items).toHaveLength(4)
    expect(draft.items.map((i) => i.grams)).toEqual([55, 5, 2, 10])
    expect(draft.items.every((i) => i.source === 'library')).toBe(true)
    expect(deepseekJson).toHaveBeenCalled()
  })

  it('LLM fail → local fallback', async () => {
    vi.mocked(isLlmConfigured).mockReturnValue(true)
    vi.mocked(deepseekJson).mockRejectedValue(new Error('offline'))
    const draft = await parseMeal('гречка 100 г, курица 100 г', CATALOG)
    expect(draft.items.map((i) => i.name)).toEqual(['Гречка', 'Курица'])
    expect(draft.items.map((i) => i.grams)).toEqual([100, 100])
  })

  it('LLM off → local without calling deepseek', async () => {
    vi.mocked(isLlmConfigured).mockReturnValue(false)
    const draft = await parseMeal('овсянка 40 г', CATALOG)
    expect(draft.items[0]!.name).toBe('Овсянка')
    expect(deepseekJson).not.toHaveBeenCalled()
  })

  it('meal type marker preserved after catalog-first', async () => {
    vi.mocked(isLlmConfigured).mockReturnValue(true)
    vi.mocked(deepseekJson).mockImplementation(async (prompt: string) => {
      if (prompt.includes('Разбей текст')) {
        return {
          mealType: 'snack',
          items: [
            { name: 'гречка', grams: 100 },
            { name: 'курица', grams: 100 },
          ],
        }
      }
      return { items: [] }
    })
    // Multi-item so library fast path does not skip LLM
    const draft = await parseMeal('завтрак: гречка 100 г, курица 100 г', CATALOG)
    expect(draft.mealType).toBe('breakfast')
    expect(draft.items.map((i) => i.name)).toEqual(['Гречка', 'Курица'])
  })
})

// ─── Realistic rawText × simulated LLM split matrix ────────────────────────

type RealisticCase = {
  cat: string
  rawText: string
  /** What a well-behaved split LLM should return for this text. */
  llmSplit: MealSplitLine[]
  eatingOut?: boolean
  expectNames?: string[]
  expectGrams?: Array<number | null>
  expectSources?: Array<'library' | 'estimate'>
  expectUnknownCount?: number
  /** Also check local fallback produces same item count (when applicable). */
  checkLocalCount?: number
}

/**
 * Sources: newlineMealList.test, mealParse.fixes, parseMeal.human, parseMealLocal,
 * user-reported breakfast list, coffee-with-milk, eating-out salad prose.
 */
const REALISTIC: RealisticCase[] = [
  {
    cat: 'newline',
    rawText: `яйцо куриное
сыр пармезан 5 г
масло сливочное 2 г
ветчина ореховая 10 г`,
    llmSplit: [
      { name: 'яйцо куриное', grams: null },
      { name: 'сыр пармезан', grams: 5 },
      { name: 'масло сливочное', grams: 2 },
      { name: 'ветчина ореховая', grams: 10 },
    ],
    expectNames: ['Яйцо куриное', 'Сыр пармезан', 'Масло сливочное', 'Ветчина ореховая'],
    expectGrams: [55, 5, 2, 10],
    expectSources: ['library', 'library', 'library', 'library'],
    checkLocalCount: 4,
  },
  {
    cat: 'bare-portion',
    rawText: `яйцо куриное
карамель мягкая
ириска`,
    llmSplit: [
      { name: 'яйцо куриное', grams: null },
      { name: 'карамель мягкая', grams: null },
      { name: 'ириска', grams: null },
    ],
    expectGrams: [55, 20, 15],
    expectSources: ['library', 'library', 'library'],
    checkLocalCount: 3,
  },
  {
    cat: 'explicit-grams',
    rawText: '200 гр творога',
    llmSplit: [{ name: 'творог', grams: 200 }],
    expectNames: ['Творог'],
    expectGrams: [200],
    expectSources: ['library'],
  },
  {
    cat: 'explicit-grams',
    rawText: 'творог 200 г',
    llmSplit: [{ name: 'творог', grams: 200 }],
    expectNames: ['Творог'],
    expectGrams: [200],
  },
  {
    cat: 'coffee',
    rawText: 'кофе с молоком',
    llmSplit: [
      { name: 'кофе', grams: null },
      { name: 'молоко', grams: null },
    ],
    expectNames: ['Кофе', 'Молоко'],
    expectGrams: [200, 200],
    expectSources: ['library', 'library'],
  },
  {
    cat: 'coffee',
    rawText: 'кофе с молоком',
    llmSplit: [{ name: 'кофе с молоком', grams: null }],
    // no dish in catalog → unknown → estimate path when full pipeline; applyCatalog only:
    expectUnknownCount: 1,
  },
  {
    cat: 'multi-comma',
    rawText: 'гречка 100 г, курица 100 г, хлеб 20 г, яблоко 150 г, творог 200 г',
    llmSplit: [
      { name: 'гречка', grams: 100 },
      { name: 'курица', grams: 100 },
      { name: 'хлеб', grams: 20 },
      { name: 'яблоко', grams: 150 },
      { name: 'творог', grams: 200 },
    ],
    expectNames: ['Гречка', 'Курица', 'Хлеб', 'Яблоко', 'Творог'],
    expectGrams: [100, 100, 20, 150, 200],
    checkLocalCount: 5,
  },
  {
    cat: 'multi-semicolon',
    rawText: 'гречка 100 г; курица 100 г',
    llmSplit: [
      { name: 'гречка', grams: 100 },
      { name: 'курица', grams: 100 },
    ],
    expectGrams: [100, 100],
  },
  {
    cat: 'mixed-unknown',
    rawText: 'овсянка 40 г, хумус из марса 50 г',
    llmSplit: [
      { name: 'овсянка', grams: 40 },
      { name: 'хумус из марса', grams: 50 },
    ],
    expectUnknownCount: 1,
    expectGrams: [40, null],
  },
  {
    cat: 'eating-out',
    rawText: 'Салат из курицы, капусты, моркови, перца, заправка оливковое масло, украшен зеленью 300 гр',
    llmSplit: [{ name: 'салат с курицей', grams: 300 }],
    eatingOut: true,
    expectUnknownCount: 1,
  },
  {
    cat: 'eating-out',
    rawText: 'в кафе паста карбонара',
    llmSplit: [{ name: 'паста карбонара', grams: null }],
    eatingOut: true,
    expectUnknownCount: 1,
  },
  {
    cat: 'mealType-body',
    rawText: 'обед: гречка 100 г, курица 100 г',
    llmSplit: [
      { name: 'гречка', grams: 100 },
      { name: 'курица', grams: 100 },
    ],
    expectNames: ['Гречка', 'Курица'],
  },
  {
    cat: 'declension',
    rawText: '200 г курицы',
    llmSplit: [{ name: 'курица', grams: 200 }],
    expectNames: ['Курица'],
    expectGrams: [200],
  },
  {
    cat: 'collision',
    rawText: 'творожный сыр 30 г',
    llmSplit: [{ name: 'творожный сыр', grams: 30 }],
    expectNames: ['Творожный сыр'],
    expectGrams: [30],
  },
  {
    cat: 'collision',
    rawText: 'сыр 40 г',
    llmSplit: [{ name: 'сыр', grams: 40 }],
    expectNames: ['Сыр'],
    expectGrams: [40],
  },
  {
    cat: 'rice',
    rawText: 'рис 100 г',
    llmSplit: [{ name: 'рис', grams: 100 }],
    expectNames: ['Рис'],
    expectGrams: [100],
  },
  {
    cat: 'breakfast-toast',
    rawText: 'на завтрак тост 30 г',
    llmSplit: [{ name: 'тост', grams: 30 }],
    // тост may be unknown or хлеб — without toast in catalog → unknown
    expectUnknownCount: 1,
  },
  {
    cat: 'sweets-bare',
    rawText: 'ириска',
    llmSplit: [{ name: 'ириска', grams: null }],
    expectNames: ['Ириска'],
    expectGrams: [15],
    expectSources: ['library'],
  },
  {
    cat: 'four-item-short',
    // User shorthand; LLM normalizes egg to catalog phrasing (prompt examples).
    rawText: 'яйцо, хлеб, сыр, яблоко',
    llmSplit: [
      { name: 'яйцо куриное', grams: null },
      { name: 'хлеб', grams: null },
      { name: 'сыр', grams: null },
      { name: 'яблоко', grams: null },
    ],
    expectGrams: [55, 30, 100, 150],
    expectSources: ['library', 'library', 'library', 'library'],
  },
  {
    cat: 'kg',
    rawText: '0.2 кг творога',
    llmSplit: [{ name: 'творог', grams: 200 }],
    expectGrams: [200],
    expectNames: ['Творог'],
  },
]

describe('realistic diary matrix → applyCatalogToSplit', () => {
  it(`defines ≥18 realistic cases (got ${REALISTIC.length})`, () => {
    expect(REALISTIC.length).toBeGreaterThanOrEqual(18)
  })

  it.each(REALISTIC.map((c) => [c.cat, c.rawText.slice(0, 48), c] as const))(
    '[%s] %s',
    (_cat, _short, c) => {
      const { items, unknown } = applyCatalogToSplit(c.llmSplit, CATALOG, Boolean(c.eatingOut))

      if (c.expectUnknownCount != null) {
        expect(unknown.length).toBe(c.expectUnknownCount)
      }
      if (c.expectNames) {
        expect(items.filter(Boolean).map((i) => i!.name)).toEqual(c.expectNames)
      }
      if (c.expectGrams) {
        c.expectGrams.forEach((g, i) => {
          if (g == null) expect(items[i]).toBeNull()
          else expect(items[i]!.grams).toBe(g)
        })
      }
      if (c.expectSources) {
        c.expectSources.forEach((s, i) => {
          expect(items[i]!.source).toBe(s)
        })
      }
      // Library macros must scale
      for (const item of items) {
        if (item?.source === 'library' && item.foodId) {
          const f = CATALOG.find((x) => x.id === item.foodId)!
          expect(item.kcal).toBe(scalePer100g(f.per100g, item.grams).kcal)
        }
      }

      if (c.checkLocalCount != null && !c.eatingOut) {
        const local = parseMealLocal(c.rawText, CATALOG)
        expect(local.items.length).toBe(c.checkLocalCount)
      }
    },
  )
})

describe('realistic diary matrix → full catalog-first (mocked LLM)', () => {
  const PIPELINE_CASES = REALISTIC.filter((c) => c.expectUnknownCount !== 1 || c.eatingOut)

  it.each(
    PIPELINE_CASES.filter((c) => !c.eatingOut && c.expectSources?.every((s) => s === 'library')).map(
      (c) => [c.cat, c.rawText.slice(0, 40), c] as const,
    ),
  )('[%s] all-library pipeline %s', async (_cat, _short, c) => {
    vi.mocked(deepseekJson).mockImplementation(async (prompt: string) => {
      if (prompt.includes('Разбей текст')) {
        return { mealType: 'breakfast', items: c.llmSplit }
      }
      return { items: [] }
    })
    const draft = await parseMealCatalogFirst(c.rawText, CATALOG, undefined, false)
    expect(draft.parseSource).toBe('library')
    if (c.expectGrams) {
      expect(draft.items.map((i) => i.grams)).toEqual(c.expectGrams)
    }
    expect(deepseekJson).toHaveBeenCalledTimes(1)
  })

  it('mixed unknown runs estimate step', async () => {
    const c = REALISTIC.find((x) => x.cat === 'mixed-unknown')!
    vi.mocked(deepseekJson).mockImplementation(async (prompt: string) => {
      if (prompt.includes('Разбей текст')) return { items: c.llmSplit }
      return {
        items: [{ name: 'хумус из марса', grams: 50, kcal: 90, protein: 5, fat: 6, carbs: 4 }],
      }
    })
    const draft = await parseMealCatalogFirst(c.rawText, CATALOG, undefined, false)
    expect(draft.items).toHaveLength(2)
    expect(draft.items[0]!.source).toBe('library')
    expect(draft.items[1]!.source).toBe('estimate')
    expect(draft.items[1]!.kcal).toBe(90)
    expect(draft.parseSource).toBe('deepseek')
  })

  it('eating-out complex salad → single estimate', async () => {
    const c = REALISTIC.find((x) => x.rawText.includes('Салат из курицы'))!
    vi.mocked(deepseekJson).mockImplementation(async (prompt: string) => {
      if (prompt.includes('Разбей текст')) {
        return { eatingOut: true, items: c.llmSplit }
      }
      return {
        items: [{ name: 'салат с курицей', grams: 300, kcal: 350, protein: 28, fat: 20, carbs: 12 }],
      }
    })
    const draft = await parseMealCatalogFirst(c.rawText, CATALOG, undefined, true)
    expect(draft.eatingOut).toBe(true)
    expect(draft.items).toHaveLength(1)
    expect(draft.items[0]!.source).toBe('estimate')
    expect(draft.items[0]!.kcal).toBe(350)
  })
})

describe('estimateMealItemMacros', () => {
  it('returns LLM estimate without catalog disambiguation', async () => {
    vi.mocked(deepseekJson).mockResolvedValue({
      items: [{ name: 'Творог', grams: 200, kcal: 220, protein: 36, fat: 10, carbs: 6 }],
    })
    const item = await estimateMealItemMacros('творог', 200)
    expect(item.source).toBe('estimate')
    expect(item.foodId).toBeUndefined()
    expect(item.grams).toBe(200)
    expect(item.kcal).toBe(220)
  })

  it('falls back to heuristic when LLM fails', async () => {
    vi.mocked(deepseekJson).mockRejectedValue(new Error('offline'))
    const item = await estimateMealItemMacros('творог', 200)
    expect(item.source).toBe('estimate')
    expect(item.kcal).toBeGreaterThan(0)
  })
})
