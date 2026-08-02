import type { FoodItem, MacroSet } from '../types'
import { round1, scalePer100g } from './nutrition'

/** Default grams when adding food to a meal. */
export function defaultFoodGrams(food: Pick<FoodItem, 'portionGrams'>): number {
  const g = food.portionGrams
  return g != null && g > 0 ? g : 100
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
