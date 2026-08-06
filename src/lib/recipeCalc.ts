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

/**
 * Density scale after pan weigh-in: estimatedCooked / actualCooked.
 * Heavier finished dish → lower kcal per 100 g cooked on each ingredient row.
 */
export function cookedDensityScale(
  draft: Pick<RecipeDraft, 'estimatedCookedGrams' | 'totalCookedGrams'>,
): number {
  const est = draft.estimatedCookedGrams
  const actual = draft.totalCookedGrams
  if (!(est > 0) || !(actual > 0)) return 1
  return est / actual
}

function scaleMacros(m: MacroSet, factor: number): MacroSet {
  return {
    kcal: round1(m.kcal * factor),
    protein: round1(m.protein * factor),
    fat: round1(m.fat * factor),
    carbs: round1(m.carbs * factor),
  }
}

/** Ingredient per-100g cooked, adjusted for dish-level cooked weight override. */
export function ingredientPer100CookedForDish(
  ing: RecipeIngredientLine,
  draft: Pick<RecipeDraft, 'estimatedCookedGrams' | 'totalCookedGrams'>,
): MacroSet {
  return scaleMacros(ingredientPer100Cooked(ing), cookedDensityScale(draft))
}

/** Cooked grams from yield alone: сырой × выход (no pan redistribution). */
export function ingredientCookedGramsFromYield(ing: RecipeIngredientLine): number {
  const y = ing.yieldFactor > 0 ? ing.yieldFactor : 1
  return round1(ing.gramsRaw * y)
}

/** Cooked grams of one ingredient after redistributing pan weight across yields. */
export function ingredientCookedGramsForDish(
  ing: RecipeIngredientLine,
  draft: Pick<RecipeDraft, 'estimatedCookedGrams' | 'totalCookedGrams'>,
): number {
  const estimated = ingredientCookedGramsFromYield(ing)
  const scale = cookedDensityScale(draft)
  return round1(scale > 0 ? estimated / scale : estimated)
}

/** Convert edited (dish-adjusted) cooked per-100g back to raw per-100g storage. */
export function ingredientPer100RawFromDishCooked(
  per100CookedDisplayed: MacroSet,
  ing: RecipeIngredientLine,
  draft: Pick<RecipeDraft, 'estimatedCookedGrams' | 'totalCookedGrams'>,
): MacroSet {
  const scale = cookedDensityScale(draft)
  const baseCooked = scale > 0 ? scaleMacros(per100CookedDisplayed, 1 / scale) : per100CookedDisplayed
  return ingredientPer100RawFromCooked(baseCooked, ing.yieldFactor)
}

/** КБЖУ блюда на 100 г готового из суммарных макросов и веса. */
export function dishPer100g(totalMacros: MacroSet, totalCookedGrams: number): MacroSet {
  if (!(totalCookedGrams > 0)) return emptyMacros()
  return {
    kcal: round1((totalMacros.kcal * 100) / totalCookedGrams),
    protein: round1((totalMacros.protein * 100) / totalCookedGrams),
    fat: round1((totalMacros.fat * 100) / totalCookedGrams),
    carbs: round1((totalMacros.carbs * 100) / totalCookedGrams),
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
  const override =
    draft.cookedGramsOverride != null &&
    Number.isFinite(draft.cookedGramsOverride) &&
    draft.cookedGramsOverride > 0
      ? round1(draft.cookedGramsOverride)
      : null
  const totalCookedGrams = override ?? estimatedCooked
  const per100g = dishPer100g(totalMacros, totalCookedGrams)

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
  /** Editor textarea — must be saved so reopen shows the text you calculated from */
  sourceText?: string,
  /** Typical serving when adding the dish to a meal (defaults to 100 g if omitted). */
  portionGrams?: number | null,
  /** Dish group (meat / poultry / grains…); omitted → inferred later in UI. */
  category?: string | null,
): Omit<FoodItem, 'id' | 'updatedAt'> & { id?: string } {
  const text = sourceText?.trim()
  const portion =
    portionGrams != null && Number.isFinite(portionGrams) && portionGrams > 0
      ? Math.round(portionGrams * 10) / 10
      : undefined
  const cat = category?.trim()
  return {
    id: existingId,
    name: recipe.name.trim(),
    aliases: [],
    per100g: recipe.per100g,
    kind: 'dish',
    ...(portion != null ? { portionGrams: portion } : {}),
    ...(cat ? { category: cat } : {}),
    recipe: {
      ingredients: recipe.ingredients,
      totalRawGrams: recipe.totalRawGrams,
      totalCookedGrams: recipe.totalCookedGrams,
      totalMacros: recipe.totalMacros,
      notes: recipe.notes,
      ...(text ? { sourceText: text } : {}),
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

/** Prefer stored free-text source over synthetic «name 100 гр» lines. */
export function recipeEditorText(food: FoodItem): string {
  const source = food.recipe?.sourceText?.trim()
  if (source) return source
  return recipeTextFromDraft(draftFromFoodItem(food))
}
