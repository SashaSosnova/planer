/**
 * Ambiguous catalog matches: short query hits several head-stem variants
 * («творог» → мягкий 0,1% / 5%) — do not auto-pick or invent КБЖУ.
 */
import { describe, expect, it } from 'vitest'
import type { FoodRef } from '../types'
import { generateAliases } from './foodAliases'
import {
  findBestFood,
  findFoodCandidates,
  resolveCatalogMatch,
  scoreFoodMatch,
} from './foodMatch'
import { applyCatalogToSplit } from './parseMealCatalogFirst'
import {
  catalogPickGroups,
  catalogPickOptions,
  rematchItemByName,
} from '../components/MealDraftEditor'
import type { FoodItem, MealItem } from '../types'

const PER100 = { kcal: 100, protein: 10, fat: 5, carbs: 8 }

function food(
  id: string,
  name: string,
  kind: 'ingredient' | 'dish' = 'ingredient',
  per100g = PER100,
): FoodRef {
  return {
    id,
    name,
    aliases: generateAliases(name),
    per100g,
    kind,
  }
}

function asFoodItem(f: FoodRef): FoodItem {
  return { ...f, updatedAt: 1 }
}

const soft01 = food('s01', 'Творог мягкий 0,1%', 'ingredient', {
  kcal: 55,
  protein: 10,
  fat: 0.1,
  carbs: 3.4,
})
const soft5 = food('s5', 'Творог мягкий 5%', 'ingredient', {
  kcal: 92,
  protein: 8.1,
  fat: 5,
  carbs: 3.6,
})
const cream = food('cream', 'Творожный сыр', 'ingredient', {
  kcal: 250,
  protein: 6,
  fat: 24,
  carbs: 3,
})
const plain = food('plain', 'Творог', 'ingredient', {
  kcal: 110,
  protein: 18,
  fat: 5,
  carbs: 3,
})

describe('head-stem score for soft cottage variants', () => {
  it('scores «творог» high enough on soft variants, not on творожный сыр', () => {
    expect(scoreFoodMatch('творог', soft01)).toBeGreaterThanOrEqual(70)
    expect(scoreFoodMatch('творог', soft5)).toBeGreaterThanOrEqual(70)
    expect(scoreFoodMatch('творога', soft5)).toBeGreaterThanOrEqual(70)
    expect(scoreFoodMatch('творог', cream)).toBeLessThan(55)
  })
})

describe('resolveCatalogMatch ambiguous soft cottage', () => {
  it('asks to pick when only soft variants exist', () => {
    const r = resolveCatalogMatch('творог', [soft01, soft5, cream], { minScore: 70 })
    expect(r.kind).toBe('ambiguous')
    if (r.kind !== 'ambiguous') return
    expect(r.candidates.map((c) => c.food.id).sort()).toEqual(['s01', 's5'])
  })

  it('auto-picks plain «Творог» when present', () => {
    const r = resolveCatalogMatch('творог', [soft01, soft5, plain], { minScore: 70 })
    expect(r.kind).toBe('match')
    if (r.kind !== 'match') return
    expect(r.food.id).toBe('plain')
  })

  it('findBestFood returns null when ambiguous', () => {
    expect(findBestFood('творог', [soft01, soft5], 70)).toBeNull()
  })

  it('exact longer query still matches one soft variant', () => {
    const r = resolveCatalogMatch('Творог мягкий 5%', [soft01, soft5], { minScore: 70 })
    expect(r.kind).toBe('match')
    if (r.kind !== 'match') return
    expect(r.food.id).toBe('s5')
  })
})

describe('applyCatalogToSplit leaves ambiguous as unknown (no LLM slot)', () => {
  it('творог → needs pick, not unknown estimate queue', () => {
    const { items, unknown, needsPick } = applyCatalogToSplit(
      [{ name: 'творог', grams: 200 }],
      [soft01, soft5],
      false,
    )
    expect(needsPick).toBe(1)
    expect(unknown).toHaveLength(0)
    expect(items[0]?.source).toBe('unknown')
    expect(items[0]?.name).toBe('Творог')
    expect(items[0]?.grams).toBe(200)
    expect(items[0]?.kcal).toBe(0)
  })

  it('яблоко still library when unique', () => {
    const apple = food('apple', 'Яблоко', 'ingredient', {
      kcal: 52,
      protein: 0.3,
      fat: 0.2,
      carbs: 14,
    })
    const { items, unknown, needsPick } = applyCatalogToSplit(
      [
        { name: 'творог', grams: 200 },
        { name: 'яблоко', grams: 150 },
      ],
      [soft01, soft5, apple],
      false,
    )
    expect(needsPick).toBe(1)
    expect(unknown).toHaveLength(0)
    expect(items[0]?.source).toBe('unknown')
    expect(items[1]?.source).toBe('library')
    expect(items[1]?.foodId).toBe('apple')
  })
})

describe('catalogPickOptions / rematch', () => {
  const foods = [soft01, soft5, cream].map(asFoodItem)

  it('exposes both soft variants for «Творог»', () => {
    const opts = catalogPickOptions('Творог', foods)
    expect(opts.map((f) => f.id).sort()).toEqual(['s01', 's5'])
  })

  it('rematch stays unmatched when ambiguous', () => {
    const items: MealItem[] = [
      {
        name: 'Творог',
        grams: 200,
        kcal: 0,
        protein: 0,
        fat: 0,
        carbs: 0,
        source: 'unknown',
      },
    ]
    const next = rematchItemByName(items, 0, 'Творог', foods)
    expect(next[0]?.source).toBe('unknown')
    expect(next[0]?.foodId).toBeUndefined()
  })
})

describe('findFoodCandidates ranking', () => {
  it('lists soft variants ahead of false friends', () => {
    const cands = findFoodCandidates('творог', [cream, soft01, soft5], 55)
    expect(cands.map((c) => c.food.id).sort()).toEqual(['s01', 's5'])
    expect(cands.every((c) => c.score >= 70)).toBe(true)
  })
})

describe('catalogPickGroups related', () => {
  const hard = asFoodItem(
    food('hard', 'Сыр твёрдый Пармезан', 'ingredient', {
      kcal: 350,
      protein: 25,
      fat: 27,
      carbs: 0,
    }),
  )
  const creamItem = asFoodItem(cream)
  const softFoods = [asFoodItem(soft01), asFoodItem(soft5)]

  it('«сыр» lists творожный сыр under related when nothing auto-matches', () => {
    const onlyCream = catalogPickGroups('Сыр', [creamItem])
    expect(onlyCream.primary).toHaveLength(0)
    expect(onlyCream.related.map((f) => f.id)).toEqual(['cream'])
  })

  it('«сыр» auto-match keeps творожный сыр in related', () => {
    const onlyHard = catalogPickGroups('Сыр', [hard])
    expect(onlyHard.primary).toHaveLength(0)
    expect(onlyHard.related).toHaveLength(0)

    const both = catalogPickGroups('Сыр', [hard, creamItem])
    expect(both.primary).toHaveLength(0)
    expect(both.related.map((f) => f.id)).toEqual(['cream'])
  })

  it('«творог» primary soft variants; related excludes творожный сыр', () => {
    const g = catalogPickGroups('Творог', [...softFoods, creamItem])
    expect(g.primary.map((f) => f.id).sort()).toEqual(['s01', 's5'])
    expect(g.related.map((f) => f.id)).not.toContain('cream')
  })
})
