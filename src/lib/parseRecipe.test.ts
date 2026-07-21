import { describe, expect, it } from 'vitest'
import type { FoodRef } from '../types'
import { generateAliases } from './foodAliases'
import { findBestFood, scoreFoodMatch } from './foodMatch'
import {
  extractRecipeIngredientHints,
  parseRecipeLocal,
  resolveRecipeIngredient,
} from './parseRecipe'

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

const pastaDish = food('dish', 'Паста с кабачком и курицей', 'dish', {
  kcal: 120,
  protein: 10,
  fat: 4,
  carbs: 12,
})
const pasta = food('pasta', 'Паста', 'ingredient', {
  kcal: 150,
  protein: 5,
  fat: 3,
  carbs: 25,
})
const dryMacaroni = food('dry', 'Макароны сухие', 'ingredient', {
  kcal: 350,
  protein: 12,
  fat: 1,
  carbs: 70,
})
const dressing = food('dress', 'Заправка для пасты', 'ingredient', {
  kcal: 82,
  protein: 5,
  fat: 5.8,
  carbs: 2.5,
})

const RECIPE = `Паста с мидиями

Заправка для пасты 200 гр
Макароны сухие 200 гр`

describe('extractRecipeIngredientHints', () => {
  it('skips dish title and keeps user ingredient names', () => {
    expect(extractRecipeIngredientHints(RECIPE)).toEqual([
      { name: 'Заправка для пасты', grams: 200 },
      { name: 'Макароны сухие', grams: 200 },
    ])
  })
})

describe('макароны / паста collisions', () => {
  it.each(['Макароны сухие', 'макароны', 'макароны сухие'])(
    '"%s" does not match Паста с кабачком и курицей',
    (query) => {
      expect(scoreFoodMatch(query, pastaDish)).toBeLessThan(70)
      expect(findBestFood(query, [pastaDish], 70)).toBeNull()
    },
  )

  it('prefers Макароны сухие over pasta dish when both exist', () => {
    expect(findBestFood('Макароны сухие', [pastaDish, dryMacaroni], 70)?.name).toBe(
      'Макароны сухие',
    )
  })

  it('"паста" alone prefers plain Паста, not the dish', () => {
    expect(findBestFood('паста', [pastaDish, pasta], 70)?.name).toBe('Паста')
    expect(findBestFood('паста', [pastaDish], 70)).toBeNull()
  })
})

describe('resolveRecipeIngredient', () => {
  it('rejects LLM foodId of pasta dish for макароны сухие', () => {
    const line = resolveRecipeIngredient(
      'Макароны сухие',
      200,
      [pastaDish, pasta],
      'dish',
      2.3,
      'набухание',
      { kcal: 350, protein: 12, fat: 1, carbs: 70 },
    )
    expect(line.name).toBe('Макароны сухие')
    expect(line.foodId).toBeUndefined()
    expect(line.source).toBe('estimate')
    expect(line.per100g.kcal).toBe(350)
  })

  it('accepts correct dry macaroni from catalog', () => {
    const line = resolveRecipeIngredient(
      'Макароны сухие',
      200,
      [pastaDish, dryMacaroni],
      'dish', // wrong id from model
    )
    expect(line.name).toBe('Макароны сухие')
    expect(line.foodId).toBe('dry')
    expect(line.source).toBe('library')
  })

  it('keeps dressing match without stealing pasta dish', () => {
    const line = resolveRecipeIngredient('Заправка для пасты', 200, [pastaDish, dressing])
    expect(line.name).toBe('Заправка для пасты')
    expect(line.foodId).toBe('dress')
    expect(line.source).toBe('library')
  })
})

describe('parseRecipeLocal', () => {
  it('does not substitute pasta dish for макароны сухие', () => {
    const draft = parseRecipeLocal(RECIPE, [pastaDish, dressing])
    expect(draft.name).toBe('Паста с мидиями')
    expect(draft.ingredients).toHaveLength(2)
    expect(draft.ingredients[0]!.name).toBe('Заправка для пасты')
    expect(draft.ingredients[0]!.foodId).toBe('dress')
    expect(draft.ingredients[1]!.name).toBe('Макароны сухие')
    expect(draft.ingredients[1]!.source).toBe('estimate')
    expect(draft.ingredients[1]!.foodId).toBeUndefined()
  })

  it('links dry macaroni when present in catalog', () => {
    const draft = parseRecipeLocal(RECIPE, [pastaDish, dressing, dryMacaroni])
    expect(draft.ingredients[1]!.name).toBe('Макароны сухие')
    expect(draft.ingredients[1]!.foodId).toBe('dry')
    expect(draft.ingredients[1]!.source).toBe('library')
  })
})
