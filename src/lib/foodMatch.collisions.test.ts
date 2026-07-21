/**
 * Non-obvious Russian food-name collisions:
 * short query must not latch onto a related longer product
 * (творог → творожный сыр, сыр → сырники, …).
 */
import { describe, expect, it } from 'vitest'
import type { FoodRef } from '../types'
import { generateAliases } from './foodAliases'
import { findBestFood, scoreFoodMatch } from './foodMatch'
import { finalizeDraft } from './parseMeal'

const PER100 = { kcal: 100, protein: 10, fat: 5, carbs: 8 }

function food(
  id: string,
  name: string,
  kind: 'ingredient' | 'dish' = 'ingredient',
  extraAliases: string[] = [],
): FoodRef {
  return {
    id,
    name,
    aliases: [...new Set([...generateAliases(name), ...extraAliases])],
    per100g: PER100,
    kind,
  }
}

/** Pairs where the short query must never resolve to the longer “cousin”. */
const FALSE_FRIENDS: Array<{
  query: string
  intended: string
  distractor: string
  distractorKind?: 'ingredient' | 'dish'
}> = [
  { query: 'творог', intended: 'Творог', distractor: 'Творожный сыр' },
  { query: 'творога', intended: 'Творог', distractor: 'Творожный сыр' },
  { query: '200 гр творог', intended: 'Творог', distractor: 'Творожный сыр' },
  { query: '200 гр творога', intended: 'Творог', distractor: 'Творожный сыр' },
  { query: 'сыр', intended: 'Сыр', distractor: 'Сырники', distractorKind: 'dish' },
  { query: 'рис', intended: 'Рис', distractor: 'Рисовая каша', distractorKind: 'dish' },
  { query: 'молоко', intended: 'Молоко', distractor: 'Молочный коктейль', distractorKind: 'dish' },
  { query: 'молока', intended: 'Молоко', distractor: 'Молочный коктейль', distractorKind: 'dish' },
  { query: 'гречка', intended: 'Гречка', distractor: 'Гречневая каша', distractorKind: 'dish' },
  { query: 'гречки', intended: 'Гречка', distractor: 'Гречневая каша', distractorKind: 'dish' },
  { query: 'курица', intended: 'Курица', distractor: 'Куриный бульон', distractorKind: 'dish' },
  { query: 'курицы', intended: 'Курица', distractor: 'Куриный бульон', distractorKind: 'dish' },
  {
    query: 'паста',
    intended: 'Паста',
    distractor: 'Паста с кабачком и курицей',
    distractorKind: 'dish',
  },
  { query: 'хлеб', intended: 'Хлеб', distractor: 'Хлебцы' },
  { query: 'кофе', intended: 'Кофе', distractor: 'Кофе с молоком', distractorKind: 'dish' },
  { query: 'яйцо', intended: 'Яйцо', distractor: 'Яичница', distractorKind: 'dish' },
  { query: 'рыба', intended: 'Рыба', distractor: 'Рыбные палочки', distractorKind: 'dish' },
  { query: 'творог', intended: 'Творог', distractor: 'Творожная запеканка', distractorKind: 'dish' },
  { query: 'овсянка', intended: 'Овсянка', distractor: 'Овсяное печенье', distractorKind: 'dish' },
  {
    query: 'макароны сухие',
    intended: 'Макароны сухие',
    distractor: 'Паста с кабачком и курицей',
    distractorKind: 'dish',
  },
  {
    query: 'макароны',
    intended: 'Макароны',
    distractor: 'Паста с кабачком и курицей',
    distractorKind: 'dish',
  },
]

/** Inflection / wording that must still hit the same product. */
const CASE_VARIANTS: Array<{ query: string; name: string; extraAliases?: string[] }> = [
  { query: 'творога', name: 'Творог' },
  { query: 'овсянки', name: 'Овсянка' },
  { query: 'яблока', name: 'Яблоко' },
  { query: 'яйца', name: 'Яйцо', extraAliases: ['яйца', 'яиц'] },
  { query: 'яиц', name: 'Яйцо', extraAliases: ['яйца', 'яиц'] },
  { query: 'курицы', name: 'Курица', extraAliases: ['курицы'] },
  { query: 'хлеба', name: 'Хлеб' },
]

describe('false friends: short query vs related longer product', () => {
  it.each(FALSE_FRIENDS)(
    '"$query" → $intended, never $distractor',
    ({ query, intended, distractor, distractorKind }) => {
      const want = food('want', intended)
      const other = food('other', distractor, distractorKind ?? 'ingredient')

      expect(scoreFoodMatch(query, other)).toBeLessThan(55)
      expect(findBestFood(query, [other], 55)).toBeNull()
      expect(findBestFood(query, [other], 70)).toBeNull()

      expect(findBestFood(query, [want, other], 70)?.name).toBe(intended)
      expect(findBestFood(query, [other, want], 70)?.name).toBe(intended)
      expect(scoreFoodMatch(query, want)).toBeGreaterThan(scoreFoodMatch(query, other))
    },
  )
})

describe('case variants still resolve to the product', () => {
  it.each(CASE_VARIANTS)('"$query" → $name', ({ query, name, extraAliases }) => {
    const item = food('x', name, 'ingredient', extraAliases)
    expect(findBestFood(query, [item], 70)?.name).toBe(name)
  })
})

const LONG_WITH_SHORT: Array<{
  query: string
  longName: string
  shortName: string
  longKind?: 'ingredient' | 'dish'
}> = [
  { query: 'творожный сыр', longName: 'Творожный сыр', shortName: 'Творог' },
  { query: 'сырники', longName: 'Сырники', shortName: 'Сыр', longKind: 'dish' },
  { query: 'рисовая каша', longName: 'Рисовая каша', shortName: 'Рис', longKind: 'dish' },
  {
    query: 'молочный коктейль',
    longName: 'Молочный коктейль',
    shortName: 'Молоко',
    longKind: 'dish',
  },
  { query: 'гречневая каша', longName: 'Гречневая каша', shortName: 'Гречка', longKind: 'dish' },
  { query: 'куриный бульон', longName: 'Куриный бульон', shortName: 'Курица', longKind: 'dish' },
  {
    query: 'паста с кабачком и курицей',
    longName: 'Паста с кабачком и курицей',
    shortName: 'Паста',
    longKind: 'dish',
  },
]

describe('long query picks the long product when both exist', () => {
  it.each(LONG_WITH_SHORT)(
    '"$query" → $longName (not $shortName)',
    ({ query, longName, shortName, longKind }) => {
      const long = food('long', longName, longKind ?? 'ingredient')
      const short = food('short', shortName)
      expect(findBestFood(query, [short, long], 70)?.name).toBe(longName)
      expect(findBestFood(query, [long, short], 70)?.name).toBe(longName)
    },
  )
})

describe('poisoned aliases do not create false friends', () => {
  it.each([
    { query: 'творог', distractor: 'Творожный сыр', poison: 'творог' },
    { query: 'сыр', distractor: 'Сырники', poison: 'сыр' },
    { query: 'рис', distractor: 'Рисовая каша', poison: 'рис' },
    { query: 'молоко', distractor: 'Молочный коктейль', poison: 'молоко' },
    { query: 'курица', distractor: 'Куриный бульон', poison: 'курица' },
  ])(
    'alias "$poison" on "$distractor" still rejects "$query"',
    ({ query, distractor, poison }) => {
      const other = food('other', distractor, 'dish', [poison])
      expect(scoreFoodMatch(query, other)).toBeLessThan(55)
      expect(findBestFood(query, [other])).toBeNull()
    },
  )
})

describe('finalizeDraft rejects LLM mislinks for false friends', () => {
  it.each([
    {
      userText: '200 гр творог',
      wrongName: 'Творожный сыр',
      wrongId: 'cream',
      catalog: [food('cream', 'Творожный сыр')],
      expectName: 'творог',
    },
    {
      userText: '200 гр творога',
      wrongName: 'Творожный сыр',
      wrongId: 'cream',
      catalog: [food('cream', 'Творожный сыр'), food('tv', 'Творог')],
      expectName: 'Творог',
      expectId: 'tv',
      expectSource: 'library' as const,
    },
    {
      userText: 'сыр 40 г',
      wrongName: 'Сырники',
      wrongId: 'syrniki',
      catalog: [food('syrniki', 'Сырники', 'dish')],
      expectName: 'сыр',
    },
    {
      userText: 'рис 100 г',
      wrongName: 'Рисовая каша',
      wrongId: 'porridge',
      catalog: [food('porridge', 'Рисовая каша', 'dish'), food('rice', 'Рис')],
      expectName: 'Рис',
      expectId: 'rice',
      expectSource: 'library' as const,
    },
    {
      userText: 'молоко 200 г',
      wrongName: 'Молочный коктейль',
      wrongId: 'shake',
      catalog: [food('shake', 'Молочный коктейль', 'dish')],
      expectName: 'молоко',
    },
    {
      userText: 'курица 150 г',
      wrongName: 'Куриный бульон',
      wrongId: 'broth',
      catalog: [food('broth', 'Куриный бульон', 'dish'), food('chicken', 'Курица')],
      expectName: 'Курица',
      expectId: 'chicken',
      expectSource: 'library' as const,
    },
    {
      userText: 'паста 100 г',
      wrongName: 'Паста с кабачком и курицей',
      wrongId: 'dish',
      catalog: [food('dish', 'Паста с кабачком и курицей', 'dish')],
      expectName: 'паста',
    },
  ])(
    '$userText: model linked $wrongName → $expectName',
    ({ userText, wrongName, wrongId, catalog, expectName, expectId, expectSource }) => {
      const draft = finalizeDraft(
        'lunch',
        [
          {
            name: wrongName,
            grams: 100,
            foodId: wrongId,
            source: 'library',
          },
        ],
        catalog,
        false,
        undefined,
        'cloud',
        userText,
      )
      const item = draft.items[0]!
      expect(item.name).toBe(expectName)
      expect(item.foodId).toBe(expectId)
      expect(item.source).toBe(expectSource ?? 'estimate')
    },
  )

  it('keeps user wording when model renames without foodId', () => {
    const draft = finalizeDraft(
      'snack',
      [
        {
          name: 'Сырники',
          grams: 40,
          kcal: 140,
          protein: 10,
          fat: 11,
          carbs: 0,
          source: 'estimate',
        },
      ],
      [food('syrniki', 'Сырники', 'dish')],
      false,
      undefined,
      'deepseek',
      'сыр 40 г',
    )
    expect(draft.items[0]!.name).toBe('сыр')
    expect(draft.items[0]!.foodId).toBeUndefined()
    expect(draft.items[0]!.kcal).toBe(140)
  })
})
