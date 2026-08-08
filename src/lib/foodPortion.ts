import type { FoodItem, MacroSet } from '../types'
import { round1, scalePer100g } from './nutrition'

/** Default grams when adding food to a meal. */
export function defaultFoodGrams(food: Pick<FoodItem, 'portionGrams'>): number {
  const g = food.portionGrams
  return g != null && g > 0 ? g : 100
}

/** Typical piece/serving size from the food name when weight was omitted. */
export function defaultGramsForFoodName(name: string): number | null {
  const n = name
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
    .trim()
  if (!n) return null
  if (/яйц/.test(n)) return 55
  if (/латте|капучино|флэт\s*уайт|раф|кофе/.test(n)) return 200
  if (/чай/.test(n)) return 200
  if (/тост|хлеб/.test(n)) return 30
  if (/овсянк/.test(n)) return 40
  return null
}

/** True if the meal text already names a weight (г / мл / кг). */
export function mealTextHasExplicitGrams(text: string): boolean {
  // Avoid \\b — ASCII-only and breaks Cyrillic «г».
  return /\d+(?:[.,]\d+)?\s*(?:кг|kg|грамм(?:а|ов)?|гр|г|мл|ml)(?=\s|$|[^\p{L}])/iu.test(
    text,
  )
}

/**
 * Grams after parse.
 * Without an explicit weight in the text, a bare product name means one catalog
 * portion (`portionGrams`) — «яйцо куриное», «карамель мягкая» = 1 шт/порция.
 * Also replaces LLM stubs (100/200/300) and piece-counts mistaken as grams (1–12).
 */
export function resolveParsedGrams(
  parsedGrams: number | null | undefined,
  food: Pick<FoodItem, 'portionGrams'> | null | undefined,
  textHasWeights: boolean,
  nameHint?: string,
): number {
  const catalogPortion =
    food?.portionGrams != null && food.portionGrams > 0 ? food.portionGrams : null
  // Name fallback only when the card has no portion yet (egg ≈ 55 г и т.п.).
  const namePortion = nameHint ? defaultGramsForFoodName(nameHint) : null
  const portion = catalogPortion ?? namePortion ?? 100

  if (!(parsedGrams != null && parsedGrams > 0)) return portion

  if (!textHasWeights) {
    if (
      catalogPortion != null &&
      (parsedGrams === 100 || parsedGrams === 200 || parsedGrams === 300)
    ) {
      return catalogPortion
    }
    // LLM: «1 яйцо» → grams:1 — treat as one portion when we know the size.
    if (parsedGrams < 15 && portion >= 20) {
      return portion
    }
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
