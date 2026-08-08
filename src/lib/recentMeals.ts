import type { Meal, MealItem, MealType, ParsedMealDraft } from '../types'
import { mealPreviewText } from './labels'
import { sumMacros } from './nutrition'

function normalizePreviewKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
    .trim()
}

function cloneItems(items: MealItem[]): MealItem[] {
  return items.map((item) => ({ ...item }))
}

/** Newest meals of the same type first, deduped by preview text. */
export function listRecentMeals(
  meals: Meal[],
  limit = 8,
  mealType?: MealType,
): Meal[] {
  const sorted = [...meals]
    .filter((m) => (mealType ? m.mealType === mealType : true))
    .sort((a, b) => b.createdAt - a.createdAt)
  const out: Meal[] = []
  const seen = new Set<string>()
  for (const meal of sorted) {
    if (meal.items.length === 0) continue
    const key = normalizePreviewKey(mealPreviewText(meal))
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(meal)
    if (out.length >= limit) break
  }
  return out
}

export function cloneMealAsDraft(meal: Meal): ParsedMealDraft {
  const items = cloneItems(meal.items)
  const allLibrary = items.length > 0 && items.every((i) => i.source === 'library')
  return {
    mealType: meal.mealType,
    items,
    totals: sumMacros(items),
    isApproximate:
      meal.eatingOut ||
      items.some((i) => i.source === 'estimate' || i.source === 'unknown'),
    eatingOut: meal.eatingOut,
    parseSource: allLibrary ? 'library' : 'local',
    notes: 'Повтор недавнего приёма.',
  }
}
