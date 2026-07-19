import { describe, expect, it } from 'vitest'
import { guessYieldFactor } from './cookingYield'
import { computeRecipe } from './recipeCalc'

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
