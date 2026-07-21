import { describe, expect, it } from 'vitest'
import { guessYieldFactor } from './cookingYield'
import {
  computeRecipe,
  draftFromFoodItem,
  ingredientPer100Cooked,
  ingredientPer100RawFromCooked,
  recipeTextFromDraft,
  recipeToFoodItem,
} from './recipeCalc'

describe('guessYieldFactor', () => {
  it('returns higher yield for pasta and lower for chicken', () => {
    expect(guessYieldFactor('спагетти').factor).toBe(2.3)
    expect(guessYieldFactor('куриная грудка').factor).toBe(0.75)
  })
})

describe('computeRecipe', () => {
  it('preserves total macros while deriving cooked per-100g', () => {
    const recipe = computeRecipe({
      name: 'Паста с курицей',
      ingredients: [
        {
          name: 'спагетти',
          gramsRaw: 100,
          per100g: { kcal: 350, protein: 12, fat: 1.5, carbs: 72 },
          source: 'estimate',
          yieldFactor: 2.3,
        },
        {
          name: 'курица',
          gramsRaw: 100,
          per100g: { kcal: 110, protein: 23, fat: 1.5, carbs: 0 },
          source: 'estimate',
          yieldFactor: 0.75,
        },
      ],
    })
    expect(recipe.totalMacros.kcal).toBe(460)
    expect(recipe.totalCookedGrams).toBe(305) // 230 + 75
    expect(recipe.per100g.kcal).toBeCloseTo((460 * 100) / 305, 1)
  })

  it('converts ingredient per-100g between raw and cooked', () => {
    const raw = { kcal: 350, protein: 12, fat: 1.5, carbs: 72 }
    const cooked = ingredientPer100Cooked({
      name: 'спагетти',
      gramsRaw: 100,
      per100g: raw,
      source: 'estimate',
      yieldFactor: 2.5,
    })
    expect(cooked.kcal).toBe(140)
    expect(cooked.protein).toBe(4.8)
    expect(ingredientPer100RawFromCooked(cooked, 2.5)).toEqual(raw)
  })

  it('round-trips a saved dish into an editable draft', () => {
    const recipe = computeRecipe({
      name: 'Паста с мидиями',
      cookedGramsOverride: 500,
      ingredients: [
        {
          name: 'Макароны сухие',
          gramsRaw: 200,
          per100g: { kcal: 350, protein: 12, fat: 1, carbs: 70 },
          source: 'estimate',
          yieldFactor: 2.3,
        },
      ],
    })
    const food = { ...recipeToFoodItem(recipe), id: 'd1', updatedAt: 1 }
    const again = draftFromFoodItem(food)
    expect(again.name).toBe('Паста с мидиями')
    expect(again.totalCookedGrams).toBe(500)
    expect(again.ingredients[0]!.name).toBe('Макароны сухие')
    expect(recipeTextFromDraft(again)).toContain('Макароны сухие 200 гр')
  })

  it('honors cooked weight override without changing total macros', () => {
    const recipe = computeRecipe({
      name: 'Блюдо',
      cookedGramsOverride: 250,
      ingredients: [
        {
          name: 'курица',
          gramsRaw: 100,
          per100g: { kcal: 110, protein: 23, fat: 1.5, carbs: 0 },
          source: 'estimate',
          yieldFactor: 0.75,
        },
      ],
    })
    expect(recipe.totalMacros.kcal).toBe(110)
    expect(recipe.totalCookedGrams).toBe(250)
    expect(recipe.per100g.kcal).toBe(44)
  })
})
