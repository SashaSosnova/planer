/**
 * Realistic human inputs for add-meal parsing (local path + meal-type strip).
 * Goals: grams, library match, КБЖУ scale, mealType, eatingOut/approximate.
 */
import { describe, expect, it } from 'vitest'
import type { FoodRef, MealType, ParsedMealDraft } from '../types'
import { generateAliases } from './foodAliases'
import { findBestFood } from './foodMatch'
import { extractMealTypeFromText } from './labels'
import { scalePer100g } from './nutrition'
import { extractMealGrams, parseMealLocal } from './parseMealLocal'
import { parseMeal } from './parseMeal'

function food(
  id: string,
  name: string,
  per100g: { kcal: number; protein: number; fat: number; carbs: number },
  kind: 'ingredient' | 'dish' = 'ingredient',
  extraAliases: string[] = [],
): FoodRef {
  const aliases = [...new Set([...generateAliases(name), ...extraAliases])]
  return { id, name, aliases, per100g, kind }
}

const LIBRARY: FoodRef[] = [
  food('rice', 'Рис', { kcal: 130, protein: 2.7, fat: 0.3, carbs: 28 }),
  food('ricePorridge', 'Рисовая каша', { kcal: 90, protein: 2, fat: 1, carbs: 18 }, 'dish'),
  food('cheese', 'Сыр', { kcal: 350, protein: 25, fat: 27, carbs: 0 }),
  food('syrniki', 'Сырники', { kcal: 220, protein: 12, fat: 10, carbs: 20 }, 'dish'),
  food('milk', 'Молоко', { kcal: 52, protein: 2.9, fat: 2.5, carbs: 4.7 }),
  food('milkshake', 'Молочный коктейль', { kcal: 120, protein: 4, fat: 4, carbs: 18 }, 'dish'),
  food('tvorog', 'Творог', { kcal: 100, protein: 16, fat: 5, carbs: 3 }),
  food('creamCheese', 'Творожный сыр', { kcal: 250, protein: 6, fat: 24, carbs: 3 }),
  food('chicken', 'Курица', { kcal: 110, protein: 23, fat: 1.5, carbs: 0 }, 'ingredient', [
    'куриная грудка',
    'курицы',
  ]),
  food('egg', 'Яйцо', { kcal: 155, protein: 13, fat: 11, carbs: 1.1 }, 'ingredient', [
    'яйца',
    'яиц',
  ]),
  food('oatmeal', 'Овсянка', { kcal: 88, protein: 3, fat: 1.5, carbs: 15 }),
  food('bread', 'Хлеб', { kcal: 265, protein: 9, fat: 3, carbs: 49 }),
  food('apple', 'Яблоко', { kcal: 52, protein: 0.3, fat: 0.2, carbs: 14 }),
  food('grechka', 'Гречка', { kcal: 110, protein: 4, fat: 1, carbs: 21 }),
  food('pastaDish', 'Паста с кабачком и курицей', { kcal: 120, protein: 10, fat: 4, carbs: 12 }, 'dish'),
  food('pasta', 'Паста', { kcal: 150, protein: 5, fat: 3, carbs: 25 }),
]

type Expectation = {
  /** Expected item names (library canonical or estimate wording). */
  names?: string[]
  /** Exact grams per item, same order as names when both set. */
  grams?: number[]
  itemCount?: number
  mealType?: MealType
  eatingOut?: boolean
  approximate?: boolean
  /** First item source */
  source?: 'library' | 'estimate'
  /** First item library name */
  firstName?: string
  firstGrams?: number
  /** Totals kcal within ±0.2 */
  totalsKcal?: number
}

function parseHuman(text: string, foods: FoodRef[] = LIBRARY): ParsedMealDraft {
  const { mealType, cleaned } = extractMealTypeFromText(text)
  const draft = parseMealLocal(cleaned, foods, mealType ?? undefined)
  return mealType ? { ...draft, mealType } : draft
}

function assertCase(input: string, exp: Expectation, foods: FoodRef[] = LIBRARY) {
  const draft = parseHuman(input, foods)
  const label = JSON.stringify({ input, exp, actual: summarize(draft) })

  if (exp.itemCount != null) {
    expect(draft.items.length, label).toBe(exp.itemCount)
  }
  if (exp.names) {
    expect(
      draft.items.map((i) => i.name),
      label,
    ).toEqual(exp.names)
  }
  if (exp.grams) {
    expect(
      draft.items.map((i) => i.grams),
      label,
    ).toEqual(exp.grams)
  }
  if (exp.firstName != null) {
    expect(draft.items[0]?.name, label).toBe(exp.firstName)
  }
  if (exp.firstGrams != null) {
    expect(draft.items[0]?.grams, label).toBe(exp.firstGrams)
  }
  if (exp.source) {
    expect(draft.items[0]?.source, label).toBe(exp.source)
  }
  if (exp.mealType) {
    expect(draft.mealType, label).toBe(exp.mealType)
  }
  if (exp.eatingOut != null) {
    expect(draft.eatingOut, label).toBe(exp.eatingOut)
  }
  if (exp.approximate != null) {
    expect(draft.isApproximate, label).toBe(exp.approximate)
  }
  if (exp.totalsKcal != null) {
    expect(Math.abs(draft.totals.kcal - exp.totalsKcal), label).toBeLessThanOrEqual(0.2)
  }

  // Library items must scale КБЖУ from per100g
  for (const item of draft.items) {
    if (item.source === 'library' && item.foodId) {
      const f = foods.find((x) => x.id === item.foodId)
      if (f) {
        const expected = scalePer100g(f.per100g, item.grams)
        expect(item.kcal, `${label} kcal`).toBe(expected.kcal)
        expect(item.protein, `${label} protein`).toBe(expected.protein)
      }
    }
    expect(item.grams, label).toBeGreaterThan(0)
  }
}

function summarize(draft: ParsedMealDraft) {
  return {
    mealType: draft.mealType,
    eatingOut: draft.eatingOut,
    approximate: draft.isApproximate,
    items: draft.items.map((i) => ({
      name: i.name,
      grams: i.grams,
      source: i.source,
      kcal: i.kcal,
    })),
    totalsKcal: draft.totals.kcal,
  }
}

/** Cases that must pass for everyday confidence. */
const CASES: Array<{ input: string; exp: Expectation; cat: string }> = [
  // —— grams formats ——
  { cat: 'grams', input: 'творог 200 г', exp: { firstName: 'Творог', firstGrams: 200, source: 'library' } },
  { cat: 'grams', input: 'творог 200г', exp: { firstName: 'Творог', firstGrams: 200, source: 'library' } },
  { cat: 'grams', input: 'творог 200 гр', exp: { firstName: 'Творог', firstGrams: 200, source: 'library' } },
  { cat: 'grams', input: 'творог 200грамм', exp: { firstName: 'Творог', firstGrams: 200, source: 'library' } },
  { cat: 'grams', input: '200 г творога', exp: { firstName: 'Творог', firstGrams: 200, source: 'library' } },
  { cat: 'grams', input: '200г творога', exp: { firstName: 'Творог', firstGrams: 200, source: 'library' } },
  { cat: 'grams', input: '200 гр творога', exp: { firstName: 'Творог', firstGrams: 200, source: 'library' } },
  { cat: 'grams', input: '200грамм творога', exp: { firstName: 'Творог', firstGrams: 200, source: 'library' } },
  { cat: 'grams', input: 'творог 150.5 г', exp: { firstName: 'Творог', firstGrams: 150.5, source: 'library' } },
  { cat: 'grams', input: 'творог 150,5 г', exp: { firstName: 'Творог', firstGrams: 150.5, source: 'library' } },
  { cat: 'grams', input: '0.2 кг творога', exp: { firstName: 'Творог', firstGrams: 200, source: 'library' } },
  { cat: 'grams', input: 'творог 0.2 кг', exp: { firstName: 'Творог', firstGrams: 200, source: 'library' } },
  { cat: 'grams', input: 'творог 0,2 кг', exp: { firstName: 'Творог', firstGrams: 200, source: 'library' } },
  { cat: 'grams', input: 'яблоко', exp: { firstName: 'Яблоко', firstGrams: 100, source: 'library' } },
  { cat: 'grams', input: 'хлеб 30 г', exp: { firstName: 'Хлеб', firstGrams: 30, totalsKcal: 79.5 } },
  { cat: 'grams', input: 'молоко 200 ml', exp: { firstName: 'Молоко', firstGrams: 200, source: 'library' } },
  { cat: 'grams', input: '200 мл молока', exp: { firstName: 'Молоко', firstGrams: 200, source: 'library' } },

  // —— declensions / colloquial ——
  { cat: 'decl', input: '200 г курицы', exp: { firstName: 'Курица', firstGrams: 200, source: 'library' } },
  { cat: 'decl', input: 'куриная грудка 150 г', exp: { firstName: 'Курица', firstGrams: 150, source: 'library' } },
  { cat: 'decl', input: 'яйца 100 г', exp: { firstName: 'Яйцо', firstGrams: 100, source: 'library' } },
  { cat: 'decl', input: 'овсянки 40 г', exp: { firstName: 'Овсянка', firstGrams: 40, source: 'library' } },
  { cat: 'decl', input: 'гречки 100г', exp: { firstName: 'Гречка', firstGrams: 100, source: 'library' } },
  { cat: 'decl', input: 'хлеба 20 г', exp: { firstName: 'Хлеб', firstGrams: 20, source: 'library' } },
  { cat: 'decl', input: 'творог примерно 200 г', exp: { firstName: 'Творог', firstGrams: 200, source: 'library' } },
  { cat: 'decl', input: 'около 200 г творога', exp: { firstName: 'Творог', firstGrams: 200, source: 'library' } },

  // —— multi-item ——
  {
    cat: 'multi',
    input: 'гречка 100 г, курица 100 г',
    exp: { names: ['Гречка', 'Курица'], grams: [100, 100], totalsKcal: 220 },
  },
  {
    cat: 'multi',
    input: 'гречка 100 г; курица 100 г',
    exp: { names: ['Гречка', 'Курица'], grams: [100, 100] },
  },
  {
    cat: 'multi',
    input: 'гречка 100 г\nкурица 100 г',
    exp: { names: ['Гречка', 'Курица'], grams: [100, 100] },
  },
  {
    cat: 'multi',
    input: 'яблоко 150 г, творог 200 г',
    exp: { names: ['Яблоко', 'Творог'], grams: [150, 200] },
  },
  {
    cat: 'multi',
    input: 'хлеб 20 г, сыр 30 г',
    exp: { names: ['Хлеб', 'Сыр'], grams: [20, 30] },
  },
  {
    cat: 'multi',
    input: 'кофе с молоком',
    exp: { itemCount: 2, grams: [200, 60], approximate: true },
  },
  {
    cat: 'multi',
    input: 'кофе с молоком 2,5%',
    exp: { itemCount: 2 },
  },
  {
    cat: 'multi',
    input: 'овсянка 40 г, яблоко 120 г, творог 100 г',
    exp: { names: ['Овсянка', 'Яблоко', 'Творог'], grams: [40, 120, 100] },
  },
  {
    cat: 'multi',
    input: 'чай с мёдом',
    exp: { itemCount: 2, approximate: true },
  },

  // —— meal type markers ——
  {
    cat: 'mealType',
    input: 'завтрак: овсянка 40 г',
    exp: { mealType: 'breakfast', firstName: 'Овсянка', firstGrams: 40 },
  },
  {
    cat: 'mealType',
    input: 'обед: гречка 100 г, курица 100 г',
    exp: { mealType: 'lunch', names: ['Гречка', 'Курица'] },
  },
  {
    cat: 'mealType',
    input: 'ужин — паста 200 г',
    exp: { mealType: 'dinner', firstName: 'Паста', firstGrams: 200 },
  },
  {
    cat: 'mealType',
    input: 'перекус: яблоко 150 г',
    exp: { mealType: 'snack', firstName: 'Яблоко', firstGrams: 150 },
  },
  {
    cat: 'mealType',
    input: 'съел на обед: гречка 100 г',
    exp: { mealType: 'lunch', firstName: 'Гречка', firstGrams: 100 },
  },
  {
    cat: 'mealType',
    input: 'на завтрак тост 30 г',
    exp: { mealType: 'breakfast', firstGrams: 30 },
  },
  {
    cat: 'mealType',
    input: 'полдник: творог 100 г',
    exp: { mealType: 'snack', firstName: 'Творог', firstGrams: 100 },
  },

  // —— eating out ——
  {
    cat: 'out',
    input: 'вне дома паста карбонара',
    exp: { eatingOut: true, approximate: true, itemCount: 1 },
  },
  {
    cat: 'out',
    input: 'в кафе салат 200 г',
    exp: { eatingOut: true, approximate: true, firstGrams: 200 },
  },
  {
    cat: 'out',
    input: 'фастфуд бургер',
    exp: { eatingOut: true, approximate: true, itemCount: 1 },
  },
  {
    cat: 'out',
    input: 'ресторан стейк',
    exp: { eatingOut: true, approximate: true },
  },

  // —— dish vs ingredient ——
  {
    cat: 'dish',
    input: 'паста с кабачком и курицей 300 г',
    exp: { firstName: 'Паста с кабачком и курицей', firstGrams: 300, source: 'library' },
  },
  {
    cat: 'dish',
    input: 'паста 200 г',
    exp: { firstName: 'Паста', firstGrams: 200, source: 'library' },
  },
  {
    cat: 'dish',
    input: 'рисовая каша 200 г',
    exp: { firstName: 'Рисовая каша', firstGrams: 200, source: 'library' },
  },

  // —— name collisions ——
  {
    cat: 'collision',
    input: 'рис 100 г',
    exp: { firstName: 'Рис', firstGrams: 100, source: 'library' },
  },
  {
    cat: 'collision',
    input: 'сыр 40 г',
    exp: { firstName: 'Сыр', firstGrams: 40, source: 'library' },
  },
  {
    cat: 'collision',
    input: 'сырники 150 г',
    exp: { firstName: 'Сырники', firstGrams: 150, source: 'library' },
  },
  {
    cat: 'collision',
    input: 'молоко 200 г',
    exp: { firstName: 'Молоко', firstGrams: 200, source: 'library' },
  },
  {
    cat: 'collision',
    input: 'молочный коктейль 300 г',
    exp: { firstName: 'Молочный коктейль', firstGrams: 300, source: 'library' },
  },
  {
    cat: 'collision',
    input: '200 гр творога',
    exp: { firstName: 'Творог', firstGrams: 200, source: 'library' },
  },
  {
    cat: 'collision',
    input: 'творожный сыр 30 г',
    exp: { firstName: 'Творожный сыр', firstGrams: 30, source: 'library' },
  },

  // —— edge / garbage ——
  {
    cat: 'edge',
    input: 'asdf qwerty 50 г',
    exp: { source: 'estimate', firstGrams: 50, approximate: true },
  },
  {
    cat: 'edge',
    input: '123',
    exp: { itemCount: 1, approximate: true },
  },
  {
    cat: 'edge',
    input: '!!!',
    exp: { itemCount: 1, approximate: true },
  },
  {
    cat: 'edge',
    input: 'рис 50г, курица 80г, хлеб 20г',
    exp: { names: ['Рис', 'Курица', 'Хлеб'], grams: [50, 80, 20] },
  },
]

/** Documented limitations — asserted softly (must not crash; ideal behavior noted). */
const KNOWN_ISSUES: Array<{ input: string; note: string; check: (d: ParsedMealDraft) => void }> = [
  {
    input: '2 яйца',
    note: 'Число штук без единиц не переводится в граммы (остаётся default 100 г на фразу)',
    check: (d) => {
      expect(d.items.length).toBe(1)
      // Not 2×55g eggs — local parser has no piece→grams rules
      expect(d.items[0]!.grams).not.toBe(110)
    },
  },
  {
    input: 'гречка и курица',
    note: '«и» не разделяет список (чтобы не ломать названия блюд) — одна позиция',
    check: (d) => {
      expect(d.items.length).toBe(1)
    },
  },
  {
    input: 'яичница',
    note: 'Без продукта «Яичница» в справочнике → estimate, не Яйцо',
    check: (d) => {
      expect(d.items[0]!.source).toBe('estimate')
      expect(d.items[0]!.name.toLowerCase()).toContain('яичница')
    },
  },
  {
    input: 'тварог 200 г',
    note: 'Опечатка со сменой буквы («тварог») — нет edit-distance, estimate',
    check: (d) => {
      expect(d.items[0]!.source).toBe('estimate')
      expect(d.items[0]!.grams).toBe(200)
    },
  },
]

describe('human add-meal matrix', () => {
  it(`has at least 50 case definitions (got ${CASES.length})`, () => {
    expect(CASES.length).toBeGreaterThanOrEqual(50)
  })

  describe('strict', () => {
    it.each(CASES.map((c) => [c.cat, c.input, c] as const))('[%s] %s', (_cat, _input, c) => {
      assertCase(c.input, c.exp)
    })
  })

  describe('known issues (documented limitations)', () => {
    it.each(KNOWN_ISSUES.map((c) => [c.input, c.note, c] as const))(
      '%s — %s',
      (_input, _note, c) => {
        const draft = parseHuman(c.input)
        c.check(draft)
      },
    )
  })
})

describe('extractMealGrams human formats', () => {
  it.each([
    ['200грамм творога', 'творога', 200],
    ['творог 200грамм', 'творог', 200],
    ['0.2 кг творога', 'творога', 200],
    ['творог 0.2 кг', 'творог', 200],
    ['творог 0,2 кг', 'творог', 200],
    ['200 ml молока', 'молока', 200],
  ] as const)('%s', (input, name, grams) => {
    expect(extractMealGrams(input)).toEqual({ name, grams })
  })
})

describe('findBestFood collisions', () => {
  it('рис ≠ рисовая каша', () => {
    expect(findBestFood('рис', LIBRARY)?.name).toBe('Рис')
    expect(findBestFood('рисовая каша', LIBRARY)?.name).toBe('Рисовая каша')
  })

  it('сыр ≠ сырники', () => {
    expect(findBestFood('сыр', LIBRARY)?.name).toBe('Сыр')
    expect(findBestFood('сырники', LIBRARY)?.name).toBe('Сырники')
  })

  it('молоко ≠ молочный коктейль', () => {
    expect(findBestFood('молоко', LIBRARY)?.name).toBe('Молоко')
    expect(findBestFood('молочный коктейль', LIBRARY)?.name).toBe('Молочный коктейль')
  })

  it('паста short query does not win long dish', () => {
    expect(findBestFood('паста', LIBRARY)?.name).toBe('Паста')
  })
})

describe('parseMeal empty', () => {
  it('throws on empty', async () => {
    await expect(parseMeal('', LIBRARY)).rejects.toThrow(/Введите/)
  })
})
