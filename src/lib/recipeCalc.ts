import type { FoodItem, MacroSet, RecipeDraft, RecipeIngredientLine } from '../types'
import { guessYieldFactor } from './cookingYield'
import { emptyMacros, round1, scalePer100g, sumMacros } from './nutrition'

export function computeRecipe(draft: {
  name: string
  ingredients: RecipeIngredientLine[]
  /** Override total cooked weight if user weighed the pan */
  cookedGramsOverride?: number | null
  notes?: string
}): RecipeDraft {
  const lines = draft.ingredients.filter((i) => i.gramsRaw > 0 && i.name.trim())
  const withYield = lines.map((ing) => {
    const y = ing.yieldFactor > 0 ? ing.yieldFactor : guessYieldFactor(ing.name).factor
    const cookedGrams = round1(ing.gramsRaw * y)
    const macros = scalePer100g(ing.per100g, ing.gramsRaw)
    return {
      ...ing,
      yieldFactor: y,
      cookedGrams,
      macros,
    }
  })

  const totalRawGrams = round1(withYield.reduce((s, i) => s + i.gramsRaw, 0))
  const totalMacros = sumMacros(withYield.map((i) => i.macros))
  const estimatedCooked = round1(withYield.reduce((s, i) => s + i.cookedGrams, 0))
  const totalCookedGrams =
    draft.cookedGramsOverride && draft.cookedGramsOverride > 0
      ? draft.cookedGramsOverride
      : estimatedCooked

  const per100g: MacroSet =
    totalCookedGrams > 0
      ? {
          kcal: round1((totalMacros.kcal * 100) / totalCookedGrams),
          protein: round1((totalMacros.protein * 100) / totalCookedGrams),
          fat: round1((totalMacros.fat * 100) / totalCookedGrams),
          carbs: round1((totalMacros.carbs * 100) / totalCookedGrams),
        }
      : emptyMacros()

  return {
    name: draft.name,
    ingredients: withYield.map(({ macros: _m, cookedGrams: _c, ...rest }) => rest),
    totalRawGrams,
    totalCookedGrams,
    estimatedCookedGrams: estimatedCooked,
    totalMacros,
    per100g,
    notes: draft.notes,
  }
}

export function recipeToFoodItem(
  recipe: RecipeDraft,
  existingId?: string,
): Omit<FoodItem, 'id' | 'updatedAt'> & { id?: string } {
  return {
    id: existingId,
    name: recipe.name.trim(),
    aliases: [],
    per100g: recipe.per100g,
    kind: 'dish',
    recipe: {
      ingredients: recipe.ingredients,
      totalRawGrams: recipe.totalRawGrams,
      totalCookedGrams: recipe.totalCookedGrams,
      totalMacros: recipe.totalMacros,
      notes: recipe.notes,
    },
  }
}
