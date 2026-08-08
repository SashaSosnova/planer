import type { FoodRef, MealType, ParsedMealDraft } from '../types'
import { deepseekJson, isDeepseekConfigured } from './deepseek'
import { coerceMealType, defaultMealTypeForNow } from './labels'
import { buildParseMealPrompt } from './parseMealPrompt'
import { defaultFoodGrams, defaultGramsForFoodName, resolveParsedGrams } from './foodPortion'
import { unmatchedMealItem } from './mealUnknown'
import { guessFallbackCategory, scalePer100g, sumMacros } from './nutrition'
import { nonNeg, sanitizeMealItems } from './sanitize'

export type LlmItem = {
  name: string
  grams: number
  foodId?: string | null
  needsEstimate?: boolean
  kcal?: number
  protein?: number
  fat?: number
  carbs?: number
  source?: 'library' | 'estimate'
}

export type LlmResult = {
  mealType?: MealType
  eatingOut?: boolean
  items?: LlmItem[]
  notes?: string
}

export type MapLlmDraftOptions = {
  /** Photo / rough estimates — always mark approximate. */
  forceApproximate?: boolean
  /** Prepended to draft notes (e.g. photo disclaimer). */
  notesPrefix?: string
}

export function isLlmConfigured(): boolean {
  return isDeepseekConfigured()
}

export function mapLlmResultToDraft(
  parsed: LlmResult,
  foods: FoodRef[],
  mealType: MealType | undefined,
  eatingOut: boolean,
  options: MapLlmDraftOptions = {},
): ParsedMealDraft {
  const foodMap = new Map(foods.map((f) => [f.id, f]))
  const out = Boolean(parsed.eatingOut ?? eatingOut)

  let usedZeroFallback = false
  const mapped = (parsed.items ?? []).map((item) => {
    const name = String(item.name || 'Блюдо')
    const food = item.foodId ? foodMap.get(item.foodId) : undefined
    const useLibrary =
      Boolean(food) && !out && item.needsEstimate !== true && item.source !== 'estimate'
    const rawGrams = Number(item.grams) > 0 ? Number(item.grams) : null
    const grams =
      rawGrams != null
        ? resolveParsedGrams(rawGrams, food, false, name)
        : food
          ? defaultFoodGrams(food)
          : (defaultGramsForFoodName(name) ?? (out ? 300 : 100))

    if (useLibrary && food) {
      const macros = scalePer100g(food.per100g, grams)
      return {
        name: food.name,
        grams,
        foodId: food.id,
        ...macros,
        source: 'library' as const,
      }
    }

    let kcal = nonNeg(item.kcal)
    let protein = nonNeg(item.protein)
    let fat = nonNeg(item.fat)
    let carbs = nonNeg(item.carbs)

    const looksLikeDrink = /вода|чай(?!\s*с)|американо|эспрессо|чёрн\w*\s*кофе/i.test(name)
    const looksCoffeeMilk = /кофе.*молок|молок.*кофе|латте|капучино/i.test(name)
    const empty = kcal <= 0 && protein <= 0 && fat <= 0 && carbs <= 0

    // Coffee-with-milk wrongly near zero — use milk-drink density, not «not found».
    if (looksCoffeeMilk && kcal > 0 && kcal < 15 && grams >= 100) {
      const fallback = scalePer100g(guessFallbackCategory(name), grams)
      return {
        name,
        grams,
        foodId: item.foodId ?? undefined,
        ...fallback,
        source: 'estimate' as const,
      }
    }

    // Model returned empty macros — do not invent default 150 kcal.
    if (!looksLikeDrink && empty) {
      usedZeroFallback = true
      return unmatchedMealItem(name, grams)
    }

    return {
      name,
      grams,
      foodId: item.foodId ?? undefined,
      kcal,
      protein,
      fat,
      carbs,
      source: 'estimate' as const,
    }
  })

  const items = sanitizeMealItems(mapped)
  if (items.length === 0) {
    throw new Error('DeepSeek не вернул позиции')
  }

  const noteParts: string[] = []
  if (options.notesPrefix?.trim()) noteParts.push(options.notesPrefix.trim())
  if (usedZeroFallback) {
    noteParts.push('Часть позиций без КБЖУ — отмечены как не найденные в справочнике.')
  }

  return {
    mealType: coerceMealType(parsed.mealType ?? mealType, defaultMealTypeForNow()),
    items,
    totals: sumMacros(items),
    isApproximate:
      Boolean(options.forceApproximate) ||
      out ||
      items.some((i) => i.source === 'estimate' || i.source === 'unknown'),
    eatingOut: out,
    parseSource: 'deepseek',
    notes: noteParts.length > 0 ? noteParts.join(' ') : undefined,
  }
}

export async function parseMealWithLlm(
  text: string,
  foods: FoodRef[],
  mealType: MealType | undefined,
  eatingOut: boolean,
): Promise<ParsedMealDraft> {
  const prompt = buildParseMealPrompt({ text, mealType, eatingOut, foods })
  const parsed = await deepseekJson<LlmResult>(prompt)
  return mapLlmResultToDraft(parsed, foods, mealType, eatingOut)
}
