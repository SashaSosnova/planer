import { describe, expect, it } from 'vitest'
import {
  applyItemPatch,
  foodMatchesCatalogQuery,
  normalizeCatalogQuery,
  patchDraft,
  rematchItemByName,
  replaceItemWithFood,
} from './MealDraftEditor'
import type { FoodItem, MealItem, ParsedMealDraft } from '../types'

function item(partial: Partial<MealItem> = {}): MealItem {
  return {
    name: 'Коул слоу',
    grams: 150,
    kcal: 180,
    protein: 2,
    fat: 12,
    carbs: 14,
    source: 'estimate',
    ...partial,
  }
}

function food(
  id: string,
  name: string,
  per100g: FoodItem['per100g'],
  kind: FoodItem['kind'] = 'ingredient',
  aliases: string[] = [],
): FoodItem {
  return { id, name, aliases, per100g, kind, updatedAt: 1 }
}

describe('applyItemPatch portion edits', () => {
  it('does not zero macros when grams patch is 0 (cleared field)', () => {
    const items = [item()]
    const next = applyItemPatch(items, 0, { grams: 0 }, [])
    expect(next[0]!.grams).toBe(150)
    expect(next[0]!.kcal).toBe(180)
  })

  it('scales macros when portion changes to a positive weight', () => {
    const items = [item({ grams: 100, kcal: 100, protein: 10, fat: 5, carbs: 8 })]
    const next = applyItemPatch(items, 0, { grams: 50 }, [])
    expect(next[0]!.grams).toBe(50)
    expect(next[0]!.kcal).toBe(50)
    expect(next[0]!.protein).toBe(5)
  })

  it('rescales from catalog when foodId is linked', () => {
    const linked = food('f1', 'Коул слоу', { kcal: 120, protein: 1, fat: 8, carbs: 10 })
    const items = [item({ foodId: 'f1', source: 'library', grams: 100, kcal: 120 })]
    const next = applyItemPatch(items, 0, { grams: 200 }, [linked])
    expect(next[0]!.grams).toBe(200)
    expect(next[0]!.kcal).toBe(240)
    expect(next[0]!.source).toBe('library')
  })

  it('rename keeps macros until explicit rematch', () => {
    const items = [item({ name: 'Коул слоу', grams: 100, kcal: 180 })]
    const next = applyItemPatch(items, 0, { name: 'хумус из марса' }, [])
    expect(next[0]!.name).toBe('Хумус из марса')
    expect(next[0]!.kcal).toBe(180)
    expect(next[0]!.source).toBe('estimate')
  })

  it('capitalization-only rename keeps macros', () => {
    const items = [
      item({
        name: 'креветки отварные',
        grams: 100,
        kcal: 98,
        protein: 20,
        fat: 1,
        carbs: 0,
        source: 'estimate',
      }),
    ]
    const next = applyItemPatch(items, 0, { name: 'Креветки отварные' }, [])
    expect(next[0]!.name).toBe('Креветки отварные')
    expect(next[0]!.kcal).toBe(98)
  })
})

describe('rematch / replace', () => {
  const raw = food('raw', 'Куриное филе бедра сырое', {
    kcal: 110,
    protein: 20,
    fat: 3,
    carbs: 0,
  })
  const grill = food(
    'grill',
    'Куриное филе гриль',
    { kcal: 160, protein: 28, fat: 5, carbs: 0 },
    'dish',
    ['куриное филе гриль'],
  )

  it('catalog substring search finds long product by short word', () => {
    const ice = food(
      'ice',
      'Мороженое пломбир ванильный Магнат в шоколадной глазури',
      { kcal: 250, protein: 4, fat: 14, carbs: 28 },
      'ingredient',
      ['мороженое'],
    )
    const q = normalizeCatalogQuery('мороженое')
    expect(foodMatchesCatalogQuery(ice, q)).toBe(true)
    expect(foodMatchesCatalogQuery(raw, q)).toBe(false)
  })

  it('catalog substring search matches brand and ё/е', () => {
    const ice = {
      ...food('ice', 'Пломбир', { kcal: 200, protein: 3, fat: 12, carbs: 20 }),
      brand: 'Магнат',
    }
    expect(foodMatchesCatalogQuery(ice, normalizeCatalogQuery('магнат'))).toBe(true)
    expect(foodMatchesCatalogQuery(ice, normalizeCatalogQuery('мороженое'))).toBe(false)
    const withYo = food('yo', 'Морожёное', { kcal: 200, protein: 3, fat: 12, carbs: 20 })
    expect(foodMatchesCatalogQuery(withYo, normalizeCatalogQuery('мороженое'))).toBe(true)
  })

  it('rematchItemByName links catalog hit', () => {
    const items = [item({ name: 'куриное филе гриль', grams: 100, kcal: 1, source: 'unknown' })]
    const next = rematchItemByName(items, 0, 'куриное филе гриль', [raw, grill])
    expect(next[0]!.name).toBe('Куриное филе гриль')
    expect(next[0]!.foodId).toBe('grill')
    expect(next[0]!.kcal).toBe(160)
    expect(next[0]!.source).toBe('library')
  })

  it('rematchItemByName keeps estimate macros when catalog miss', () => {
    const items = [item({ name: 'хумус из марса', grams: 50, kcal: 99, source: 'estimate' })]
    const next = rematchItemByName(items, 0, 'хумус из марса', [raw])
    expect(next[0]!.source).toBe('estimate')
    expect(next[0]!.kcal).toBe(99)
    expect(next[0]!.foodId).toBeUndefined()
  })

  it('rematchItemByName marks unknown when missing and no macros', () => {
    const items = [item({ name: 'хумус из марса', grams: 50, kcal: 0, source: 'unknown' })]
    const next = rematchItemByName(items, 0, 'хумус из марса', [raw])
    expect(next[0]!.source).toBe('unknown')
    expect(next[0]!.kcal).toBe(0)
  })

  it('replaceItemWithFood swaps catalog product keeping grams', () => {
    const items = [
      item({
        name: 'Куриное филе бедра сырое',
        foodId: 'raw',
        source: 'library',
        grams: 120,
        kcal: 132,
      }),
    ]
    const next = replaceItemWithFood(items, 0, grill)
    expect(next[0]!.name).toBe('Куриное филе гриль')
    expect(next[0]!.foodId).toBe('grill')
    expect(next[0]!.grams).toBe(120)
    expect(next[0]!.kcal).toBe(192)
  })
})

describe('unlink from library', () => {
  it('clears foodId and unlocks estimate source', () => {
    const linked = food('f1', 'Коул слоу', { kcal: 120, protein: 1, fat: 8, carbs: 10 })
    const items = [
      item({
        foodId: 'f1',
        source: 'library',
        grams: 100,
        kcal: 120,
        protein: 1,
        fat: 8,
        carbs: 10,
      }),
    ]
    const next = applyItemPatch(
      items,
      0,
      { foodId: undefined, source: 'estimate' },
      [linked],
    )
    expect(next[0]!.foodId).toBeUndefined()
    expect(next[0]!.source).toBe('estimate')
    expect(next[0]!.kcal).toBe(120)
  })
})

describe('patchDraft after catalog pick', () => {
  const soft01 = food(
    's01',
    'Творог мягкий 0,1%',
    { kcal: 55, protein: 10, fat: 0.1, carbs: 3.4 },
    'ingredient',
    ['творог'],
  )
  const soft5 = food(
    's5',
    'Творог мягкий 5%',
    { kcal: 92, protein: 8, fat: 5, carbs: 3.6 },
    'ingredient',
    ['творог'],
  )
  const apple = food('apple', 'Яблоко', {
    kcal: 52,
    protein: 0.3,
    fat: 0.2,
    carbs: 14,
  })

  it('clears clarify note and sets library badge when pick resolves', () => {
    const draft: ParsedMealDraft = {
      mealType: 'snack',
      items: [
        {
          name: 'Творог',
          grams: 200,
          kcal: 0,
          protein: 0,
          fat: 0,
          carbs: 0,
          source: 'unknown',
        },
        {
          name: 'Яблоко',
          grams: 150,
          foodId: 'apple',
          kcal: 78,
          protein: 0.5,
          fat: 0.3,
          carbs: 21,
          source: 'library',
        },
      ],
      totals: { kcal: 78, protein: 0.5, fat: 0.3, carbs: 21 },
      isApproximate: true,
      eatingOut: false,
      parseSource: 'library',
      notes: 'Уточните продукт — в справочнике несколько похожих.',
    }
    const next = patchDraft(
      draft,
      0,
      replaceItemWithFood(draft.items, 0, soft01)[0]!,
      [soft01, soft5, apple],
    )
    expect(next.items[0]!.source).toBe('library')
    expect(next.items[0]!.foodId).toBe('s01')
    expect(next.notes).toBeUndefined()
    expect(next.parseSource).toBe('library')
    expect(next.isApproximate).toBe(false)
  })
})
