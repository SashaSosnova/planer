import type { FoodItem, MacroSet } from '../types'
import { round1, scalePer100g } from './nutrition'

/** Default grams when adding food to a meal. */
export function defaultFoodGrams(food: Pick<FoodItem, 'portionGrams'>): number {
  const g = food.portionGrams
  return g != null && g > 0 ? g : 100
}

/** True if the meal text already names a weight (г / мл / кг). */
export function mealTextHasExplicitGrams(text: string): boolean {
  // Avoid \\b — ASCII-only and breaks Cyrillic «г».
  return /\d+(?:[.,]\d+)?\s*(?:кг|kg|грамм(?:а|ов)?|гр|г|мл|ml)(?=\s|$|[^\p{L}])/iu.test(
    text,
  )
}

/**
 * Grams after parse: keep explicit weights; if the model/local path left a
 * generic stub (100/200/300) and the catalog has a portion — use the portion.
 */
export function resolveParsedGrams(
  parsedGrams: number | null | undefined,
  food: Pick<FoodItem, 'portionGrams'> | null | undefined,
  textHasWeights: boolean,
): number {
  const portion = food ? defaultFoodGrams(food) : 100
  if (!(parsedGrams != null && parsedGrams > 0)) return portion
  if (
    !textHasWeights &&
    food?.portionGrams != null &&
    food.portionGrams > 0 &&
    (parsedGrams === 100 || parsedGrams === 200 || parsedGrams === 300)
  ) {
    return food.portionGrams
  }
  return parsedGrams
}

/** КБЖУ, введённые на порцию → на 100 г (хранение в справочнике). */
export function per100FromPortionMacros(portionMacros: MacroSet, portionGrams: number): MacroSet {
  if (!(portionGrams > 0)) {
    return {
      kcal: round1(portionMacros.kcal),
      protein: round1(portionMacros.protein),
      fat: round1(portionMacros.fat),
      carbs: round1(portionMacros.carbs),
    }
  }
  const k = 100 / portionGrams
  return {
    kcal: round1(portionMacros.kcal * k),
    protein: round1(portionMacros.protein * k),
    fat: round1(portionMacros.fat * k),
    carbs: round1(portionMacros.carbs * k),
  }
}

/** КБЖУ на 100 г → на типичную порцию (для формы редактирования). */
export function portionMacrosFromPer100(per100g: MacroSet, portionGrams: number): MacroSet {
  return scalePer100g(per100g, portionGrams > 0 ? portionGrams : 100)
}

export function parsePortionGrams(raw: string): number | null {
  const t = raw.trim().replace(',', '.')
  if (!t) return null
  const n = Number(t)
  if (!Number.isFinite(n) || n <= 0 || n > 5000) return null
  return Math.round(n * 10) / 10
}
