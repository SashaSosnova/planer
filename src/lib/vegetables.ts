import type { Meal } from '../types'

function normalize(name: string): string {
  return name.toLowerCase().replace(/ё/g, 'е')
}

/** Starchy / processed items that should not count as vegetables. */
/** Note: JS \\w / \\b are ASCII-only — use Cyrillic ranges. */
const EXCLUDE =
  /картофел|пюре|сок|кетчуп|томатн[а-я]*\s*паст|чипсы|фри|крахмал/i

/**
 * Vegetable markers in Russian meal/item names.
 * Mixed dishes (e.g. «салат с курицей») count fully when a marker matches.
 */
const INCLUDE =
  /овощ|огурец|помидор|томат|капуст|морков|свекл|перец|кабачок|цукини|баклажан|брокколи|салат|шпинат|фасоль|стручков|горош|кукуруз|редис|репа(?:[^а-я]|$)|тыква|сельдерей|лук(?:[^а-я]|$)|чеснок|руккол|латук|репчат|базилик|петрушк|укроп|пекинск|кольраби|спаржа|артишок|патиссон|дайкон|щавель|зелень/i

export function isVegetableName(name: string): boolean {
  const n = normalize(name)
  if (!n.trim()) return false
  if (EXCLUDE.test(n)) return false
  return INCLUDE.test(n)
}

/** Sum grams of vegetable-like items across meals. */
export function vegGramsFromMeals(meals: Meal[]): number {
  let total = 0
  for (const meal of meals) {
    for (const item of meal.items) {
      if (isVegetableName(item.name)) total += item.grams
    }
  }
  return Math.round(total)
}
