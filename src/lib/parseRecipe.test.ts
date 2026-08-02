import { describe, expect, it } from 'vitest'
import type { FoodRef } from '../types'
import { generateAliases } from './foodAliases'
import { findBestFood, scoreFoodMatch } from './foodMatch'
import {
  dedupeRecipeIngredients,
  extractIngredientLine,
  extractRecipeIngredientHints,
  isIngredientDuplicate,
  parseRecipeLocal,
  pickIngredientHint,
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

  it('reads grams mid-line (Бефстроганов-style)', () => {
    const text = `Бефстроганов
Говядина 600 г соломкой
Лук 2 шт
Сметана 200 г
Томатная паста 1 ч.л.
Мука 1 ч.л. (по желанию)
Соль, сладкая паприка`
    const hints = extractRecipeIngredientHints(text)
    expect(extractIngredientLine('Говядина 600 г соломкой')).toEqual({
      name: 'Говядина',
      grams: 600,
    })
    expect(hints.find((h) => h.name === 'Говядина')?.grams).toBe(600)
    expect(hints.find((h) => h.name === 'Сметана')?.grams).toBe(200)
    expect(hints.find((h) => h.name === 'Лук')?.grams).toBe(150)
    expect(hints.map((h) => h.name)).toContain('Томатная паста')
  })

  it('matches hints by name, not by index', () => {
    const hints = extractRecipeIngredientHints(`Бефстроганов
Говядина 600 г соломкой
Сметана 200 г`)
    const used = new Set<number>()
    // LLM returns sour cream first — must not steal beef grams/name
    const cream = pickIngredientHint(hints, 'Сметана', used)
    expect(cream).toEqual({ name: 'Сметана', grams: 200 })
    const beef = pickIngredientHint(hints, 'Говядина', used)
    expect(beef).toEqual({ name: 'Говядина', grams: 600 })
  })

  it('splits seasoning lists on commas', () => {
    const hints = extractRecipeIngredientHints(`Бефстроганов
Говядина 600 г
Соль, сладкая паприка`)
    expect(hints.map((h) => h.name)).toEqual(['Говядина', 'Соль', 'сладкая паприка'])
  })
})

describe('dedupeRecipeIngredients', () => {
  it('drops comma-list duplicate of paprika', () => {
    expect(isIngredientDuplicate('Соль, сладкая паприка', 'Сладкая паприка')).toBe(true)
    const lines = dedupeRecipeIngredients([
      {
        name: 'Соль, сладкая паприка',
        gramsRaw: 5,
        per100g: PER100,
        source: 'estimate',
        yieldFactor: 1,
      },
      {
        name: 'Сладкая паприка',
        gramsRaw: 3,
        per100g: PER100,
        source: 'estimate',
        yieldFactor: 1,
      },
      {
        name: 'Соль',
        gramsRaw: 2,
        per100g: PER100,
        source: 'estimate',
        yieldFactor: 1,
      },
    ])
    expect(lines.map((l) => l.name)).toEqual(['Сладкая паприка', 'Соль'])
  })

  it('does not merge томатная паста with паста', () => {
    expect(isIngredientDuplicate('томатная паста', 'паста')).toBe(false)
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

  it('does not map сметана to a salad dish', () => {
    const salad = food('salad', 'Овощной салат со сметаной', 'dish')
    const cream = food('cream', 'Сметана', 'ingredient', {
      kcal: 200,
      protein: 2,
      fat: 20,
      carbs: 3,
    })
    const line = resolveRecipeIngredient('Сметана', 200, [salad, cream])
    expect(line.name).toBe('Сметана')
    expect(line.foodId).toBe('cream')
  })

  it('does not map говядина to an unrelated dish', () => {
    const salad = food('salad', 'Овощной салат со сметаной', 'dish')
    const line = resolveRecipeIngredient('Говядина', 600, [salad, pastaDish], 'salad', 0.75)
    expect(line.name).toBe('Говядина')
    expect(line.foodId).toBeUndefined()
    expect(line.source).toBe('estimate')
  })

  it('does not map говядина to тушеная картошка с говядиной', () => {
    const stew = food('stew', 'Тушеная картошка с говядиной', 'dish')
    expect(scoreFoodMatch('Говядина', stew)).toBeLessThan(70)
    expect(findBestFood('Говядина', [stew], 70)).toBeNull()
    const line = resolveRecipeIngredient('Говядина', 600, [stew], stew.id, 0.75)
    expect(line.name).toBe('Говядина')
    expect(line.foodId).toBeUndefined()
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
