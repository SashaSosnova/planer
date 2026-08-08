import type { MealItem } from '../types'
import { capitalizeFoodName } from './foodName'

/** Product not in catalog — no invented КБЖУ (avoids confusing «150 ккал» default). */
export function unmatchedMealItem(name: string, grams: number): MealItem {
  const g = grams > 0 ? grams : 100
  return {
    name: capitalizeFoodName(name.trim() || 'Блюдо'),
    grams: g,
    kcal: 0,
    protein: 0,
    fat: 0,
    carbs: 0,
    source: 'unknown',
  }
}

export function isUnmatchedMealItem(item: Pick<MealItem, 'source'>): boolean {
  return item.source === 'unknown'
}
