import type { FoodRef, MealType, ParsedMealDraft } from '../types'
import { textSuggestsEatingOut } from './eatingOut'
import { findBestFood, scoreFoodMatch } from './foodMatch'
import { isComplexMealText } from './mealComplexity'
import { isLlmConfigured, parseMealWithLlm } from './parseMealLlm'
import { extractMealGrams, parseMealLocal } from './parseMealLocal'
import { coerceMealType, defaultMealTypeForNow, extractMealTypeFromText } from './labels'
import {
  defaultFoodGrams,
  mealTextHasExplicitGrams,
  resolveParsedGrams,
} from './foodPortion'
import { guessFallbackCategory, scalePer100g, sumMacros } from './nutrition'
import { sanitizeMealItems } from './sanitize'

/** Comma/semicolon/newline lists must not collapse to a single fuzzy library hit. */
function looksLikeMealList(text: string): boolean {
  return /[,;\n]/.test(text)
}

function tryWholeLibraryMatch(
  text: string,
  foods: FoodRef[],
  mealType: MealType | undefined,
): ParsedMealDraft | null {
  if (looksLikeMealList(text)) return null

  const collapsed = text.replace(/\s+/g, ' ').trim()
  const { name, grams: parsedGrams } = extractMealGrams(collapsed)
  if (!name) return null

  const food = findBestFood(name, foods, 70)
  if (!food) return null

  const grams = parsedGrams ?? defaultFoodGrams(food)
  if (!Number.isFinite(grams) || grams <= 0) return null

  const macros = scalePer100g(food.per100g, grams)
  const item = {
    name: food.name,
    grams,
    foodId: food.id,
    ...macros,
    source: 'library' as const,
  }
  return {
    mealType: mealType ?? defaultMealTypeForNow(),
    items: [item],
    totals: sumMacros([item]),
    isApproximate: false,
    eatingOut: false,
    parseSource: 'library',
    notes:
      food.kind === 'dish'
        ? 'Найдено готовое блюдо из справочника — без разбивки на ингредиенты.'
        : 'Совпало с продуктом из справочника.',
  }
}

type ParsedItem = {
  name: string
  grams: number
  foodId?: string | null
  kcal?: number
  protein?: number
  fat?: number
  carbs?: number
  source: 'library' | 'estimate'
}

/**
 * Cloud/LLM sometimes picks a related catalog item («творожный сыр» for «творога»).
 * Re-check against the user phrase; rematch or fall back to estimate.
 */
function resolveLibraryFood(
  item: ParsedItem,
  foods: FoodRef[],
  userQuery: string | undefined,
  singleItem: boolean,
): FoodRef | null {
  if (!item.foodId) return null
  const claimed = foods.find((f) => f.id === item.foodId)
  if (!claimed) return null

  const query = singleItem && userQuery ? userQuery : item.name
  if (scoreFoodMatch(query, claimed) >= 55) return claimed

  return findBestFood(query, foods, 55)
}

function toLibraryItem(food: FoodRef, grams: number) {
  return {
    name: food.name,
    grams,
    foodId: food.id,
    ...scalePer100g(food.per100g, grams),
    source: 'library' as const,
  }
}

/** Visible for tests — applies library foodId checks against the user phrase. */
export function finalizeDraft(
  mealType: MealType,
  items: ParsedItem[],
  foods: FoodRef[],
  eatingOut: boolean,
  notes?: string,
  parseSource: ParsedMealDraft['parseSource'] = 'deepseek',
  userText?: string,
): ParsedMealDraft {
  const queryName = userText ? extractMealGrams(userText.replace(/\s+/g, ' ').trim()).name : ''
  const singleItem = items.length === 1
  const textHasWeights = userText ? mealTextHasExplicitGrams(userText) : true

  const resolved = items.map((item) => {
    const query = singleItem && queryName ? queryName : item.name
    const userLabel = (singleItem && queryName ? queryName : item.name) || 'Блюдо'

    if (!eatingOut) {
      // 1) Validate claimed catalog id (even if model marked source=estimate).
      if (item.foodId) {
        const viaId = resolveLibraryFood(
          { ...item, source: 'library' },
          foods,
          queryName || undefined,
          singleItem,
        )
        if (viaId) {
          return toLibraryItem(
            viaId,
            resolveParsedGrams(item.grams, viaId, textHasWeights),
          )
        }
      }

      // 2) LLM often returns the right name without foodId / as estimate — rematch.
      const viaName = findBestFood(query, foods, 70)
      if (viaName) {
        return toLibraryItem(
          viaName,
          resolveParsedGrams(item.grams, viaName, textHasWeights),
        )
      }

      // 3) Wrong catalog id / model renamed product («творог» → «Творожный сыр»).
      // Drop foodId and prefer the user's wording for a single-item phrase.
      if (item.foodId || (singleItem && queryName)) {
        const grams = item.grams > 0 ? item.grams : 100
        const keepModelMacros =
          item.source !== 'library' &&
          ((item.kcal ?? 0) > 0 ||
            (item.protein ?? 0) > 0 ||
            (item.fat ?? 0) > 0 ||
            (item.carbs ?? 0) > 0)
        const macros = keepModelMacros
          ? {
              kcal: item.kcal ?? 0,
              protein: item.protein ?? 0,
              fat: item.fat ?? 0,
              carbs: item.carbs ?? 0,
            }
          : scalePer100g(guessFallbackCategory(userLabel), grams)
        return {
          name: userLabel,
          grams,
          ...macros,
          source: 'estimate' as const,
        }
      }
    }

    const grams = item.grams > 0 ? item.grams : 100
    return {
      name: item.name,
      grams,
      kcal: item.kcal ?? 0,
      protein: item.protein ?? 0,
      fat: item.fat ?? 0,
      carbs: item.carbs ?? 0,
      source: 'estimate' as const,
    }
  })

  const clean = sanitizeMealItems(resolved)
  return {
    mealType: coerceMealType(mealType),
    items: clean,
    totals: sumMacros(clean),
    isApproximate: eatingOut || clean.some((i) => i.source === 'estimate'),
    eatingOut,
    parseSource,
    notes,
  }
}

export async function parseMeal(
  text: string,
  foods: FoodRef[],
  mealType?: MealType,
  eatingOutHint = false,
): Promise<ParsedMealDraft> {
  const trimmed = text.trim()
  if (!trimmed) {
    throw new Error('Введите, что вы съели')
  }

  const fromText = extractMealTypeFromText(trimmed)
  const resolvedType = fromText.mealType ?? mealType
  const body = fromText.cleaned

  const complex = isComplexMealText(body)
  const eatingOut = eatingOutHint || textSuggestsEatingOut(body) || complex

  // Known product/dish in library — never split with LLM/regex
  if (!eatingOut) {
    const whole = tryWholeLibraryMatch(body, foods, resolvedType)
    if (whole) return whole
  }

  // Prefer local catalog matching; DeepSeek only when something is missing.
  const local = parseMealLocal(body, foods, resolvedType, eatingOut)
  const withType = fromText.mealType
    ? { ...local, mealType: fromText.mealType }
    : local
  const allFromLibrary =
    !eatingOut &&
    withType.items.length > 0 &&
    withType.items.every((i) => i.source === 'library')

  if (allFromLibrary) {
    return {
      ...withType,
      parseSource: 'library',
      isApproximate: false,
      notes:
        withType.items.length > 1
          ? 'Все позиции найдены в справочнике.'
          : withType.notes,
    }
  }

  if (isLlmConfigured()) {
    try {
      const draft = await parseMealWithLlm(body, foods, resolvedType, eatingOut)
      return finalizeDraft(
        fromText.mealType ?? draft.mealType,
        draft.items,
        foods,
        draft.eatingOut,
        draft.notes,
        'deepseek',
        body,
      )
    } catch {
      // keep local estimate below
    }
  }

  return withType
}
