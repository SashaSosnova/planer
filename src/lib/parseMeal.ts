import { httpsCallable } from 'firebase/functions'
import { getFirebaseFunctions, isFirebaseConfigured } from '../firebase'
import type { FoodRef, MealType, ParsedMealDraft } from '../types'
import { textSuggestsEatingOut } from './eatingOut'
import { findBestFood, scoreFoodMatch } from './foodMatch'
import { isComplexMealText } from './mealComplexity'
import { isLlmConfigured, parseMealWithLlm } from './parseMealLlm'
import { extractMealGrams, parseMealLocal } from './parseMealLocal'
import { coerceMealType, defaultMealTypeForNow, extractMealTypeFromText } from './labels'
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
  const grams = parsedGrams ?? 100
  if (!name || !Number.isFinite(grams) || grams <= 0) return null

  const food = findBestFood(name, foods, 70)
  if (!food) return null

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

type ParseMealRequest = {
  text: string
  mealType?: MealType
  eatingOut?: boolean
  foods: FoodRef[]
}

type ParseMealResponse = {
  mealType: MealType
  eatingOut?: boolean
  items: Array<{
    name: string
    grams: number
    foodId?: string | null
    kcal?: number
    protein?: number
    fat?: number
    carbs?: number
    source: 'library' | 'estimate'
  }>
  notes?: string
}

/**
 * Cloud/LLM sometimes picks a related catalog item («творожный сыр» for «творога»).
 * Re-check against the user phrase; rematch or fall back to estimate.
 */
function resolveLibraryFood(
  item: ParseMealResponse['items'][number],
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
  items: ParseMealResponse['items'],
  foods: FoodRef[],
  eatingOut: boolean,
  notes?: string,
  parseSource: ParsedMealDraft['parseSource'] = 'cloud',
  userText?: string,
): ParsedMealDraft {
  const queryName = userText ? extractMealGrams(userText.replace(/\s+/g, ' ').trim()).name : ''
  const singleItem = items.length === 1

  const resolved = items.map((item) => {
    const grams = item.grams > 0 ? item.grams : 100
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
        if (viaId) return toLibraryItem(viaId, grams)
      }

      // 2) LLM often returns the right name without foodId / as estimate — rematch.
      const viaName = findBestFood(query, foods, 70)
      if (viaName) return toLibraryItem(viaName, grams)

      // 3) Wrong catalog id / model renamed product («творог» → «Творожный сыр»).
      // Drop foodId and prefer the user's wording for a single-item phrase.
      if (item.foodId || (singleItem && queryName)) {
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

  // 1) Cloud Function (preferred — key stays on server)
  if (isFirebaseConfigured()) {
    try {
      const callable = httpsCallable<ParseMealRequest, ParseMealResponse>(
        getFirebaseFunctions(),
        'parseMeal',
      )
      const result = await callable({
        text: body,
        mealType: resolvedType,
        eatingOut,
        foods: foods.map((f) => ({
          id: f.id,
          name: f.name,
          aliases: f.aliases,
          per100g: f.per100g,
          kind: f.kind,
        })),
      })
      return finalizeDraft(
        fromText.mealType ?? coerceMealType(result.data.mealType, resolvedType ?? defaultMealTypeForNow()),
        result.data.items,
        foods,
        Boolean(result.data.eatingOut ?? eatingOut),
        result.data.notes,
        'cloud',
        body,
      )
    } catch {
      // continue
    }
  }

  // 2) DeepSeek flash — complex / eating out / any text when configured
  if (isLlmConfigured() && (complex || eatingOut)) {
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
      // continue to local
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
      // continue
    }
  }

  const local = parseMealLocal(body, foods, resolvedType, eatingOut)
  return fromText.mealType ? { ...local, mealType: fromText.mealType } : local
}
