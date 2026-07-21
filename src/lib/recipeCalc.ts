import type { FoodItem, MacroSet, RecipeDraft, RecipeIngredientLine } from '../types'
import { guessYieldFactor } from './cookingYield'
import { emptyMacros, round1, scalePer100g, sumMacros } from './nutrition'

/** КБЖУ ингредиента в пересчёте на 100 г после готовки (сырое / коэффициент выхода). */
export function ingredientPer100Cooked(ing: RecipeIngredientLine): MacroSet {
  const y = ing.yieldFactor > 0 ? ing.yieldFactor : 1
  return {
    kcal: round1(ing.per100g.kcal / y),
    protein: round1(ing.per100g.protein / y),
    fat: round1(ing.per100g.fat / y),
    carbs: round1(ing.per100g.carbs / y),
  }
}

/** Обратно: КБЖУ на 100 г готового → на 100 г сырого. */
export function ingredientPer100RawFromCooked(
  per100Cooked: MacroSet,
  yieldFactor: number,
): MacroSet {
  const y = yieldFactor > 0 ? yieldFactor : 1
  return {
    kcal: round1(per100Cooked.kcal * y),
    protein: round1(per100Cooked.protein * y),
    fat: round1(per100Cooked.fat * y),
    carbs: round1(per100Cooked.carbs * y),
  }
}

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

/** Restore an editable draft from a saved dish (or a minimal fallback). */
export function draftFromFoodItem(food: FoodItem): RecipeDraft {
  const snap = food.recipe
  if (snap?.ingredients?.length) {
    return computeRecipe({
      name: food.name,
      ingredients: snap.ingredients,
      cookedGramsOverride: snap.totalCookedGrams > 0 ? snap.totalCookedGrams : null,
      notes: snap.notes,
    })
  }
  return computeRecipe({
    name: food.name,
    ingredients: [
      {
        name: food.name,
        gramsRaw: 100,
        per100g: food.per100g,
        source: 'estimate',
        yieldFactor: 1,
      },
    ],
    cookedGramsOverride: 100,
  })
}

export function recipeTextFromDraft(draft: Pick<RecipeDraft, 'name' | 'ingredients'>): string {
  const lines = [
    draft.name.trim(),
    ...draft.ingredients
      .filter((i) => i.name.trim() && i.gramsRaw > 0)
      .map((i) => `${i.name.trim()} ${i.gramsRaw} гр`),
  ]
  return lines.filter(Boolean).join('\n')
}
