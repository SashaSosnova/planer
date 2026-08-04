import type { Meal } from '../types'

/**
 * Treats / sweets — tasty, not a meal.
 * Shared with cycle calorie insights.
 */
export const SWEET_RE =
  /шоколад|мороже|пломбир|эскимо|слойк|киндер|kinder|торт|чизкейк|тирамису|конфет|леденец|чупа|зефир|пастил|мармелад|халв|вафл|батончик|сгущён|сгущен|м&m|m&m|драже|эклер|печенье|пряник|круассан|пирожное|десерт|брауни|brownie|нутелл|nutella|bueno|kitkat|snickers|twix|oreo|карамел|сироп|пастила|рогалик|донат|пончик|muffin|маффин|кекс(?:[^а-я]|$)|candy|sweets?|dessert|ice\s*cream/i

/** Savory / cooking uses that should not count as treats. */
const SWEET_EXCLUDE =
  /перец\s*сладк|сладк(?:ий|ого|ая|ую)?\s*перец|паприк|томатн|соус\s*сладк|кисло.?сладк|салат|куриц|говяд|рыб|суп|борщ/i

/** ~10% of the daily calorie goal, clamped — room for treats without eating the whole deficit. */
export const SWEET_BUDGET_RATIO = 0.1
export const SWEET_BUDGET_MIN_KCAL = 80
export const SWEET_BUDGET_MAX_KCAL = 220

function normalize(name: string): string {
  return name.toLowerCase().replace(/ё/g, 'е')
}

export function isSweetName(name: string): boolean {
  const n = normalize(name)
  if (!n.trim()) return false
  if (SWEET_EXCLUDE.test(n)) return false
  return SWEET_RE.test(n)
}

/** How many kcal of today's goal can go to sweets. */
export function calcSweetBudgetKcal(dailyKcalGoal: number): number {
  if (!(dailyKcalGoal > 0)) return SWEET_BUDGET_MIN_KCAL
  const raw = Math.round(dailyKcalGoal * SWEET_BUDGET_RATIO)
  return Math.min(SWEET_BUDGET_MAX_KCAL, Math.max(SWEET_BUDGET_MIN_KCAL, raw))
}

/**
 * Sum kcal of sweet-like items. If a meal has no matching items but the
 * free-text looks like a pure treat snack, count the whole meal.
 */
export function sweetKcalFromMeals(meals: Meal[]): number {
  let total = 0
  for (const meal of meals) {
    let fromItems = 0
    for (const item of meal.items) {
      if (isSweetName(item.name)) fromItems += Number(item.kcal) || 0
    }
    if (fromItems > 0) {
      total += fromItems
      continue
    }
    const blob = `${meal.rawText} ${meal.items.map((i) => i.name).join(' ')}`
    if (isSweetName(blob) && meal.items.length <= 2) {
      total += Number(meal.totals?.kcal) || 0
    }
  }
  return Math.round(total)
}

export function sweetScaleZone(
  sweetKcal: number,
  budgetKcal: number,
): 'ok' | 'warn' | 'over' {
  const budget = budgetKcal > 0 ? budgetKcal : 1
  if (sweetKcal > budget * 1.15) return 'over'
  if (sweetKcal > budget) return 'warn'
  return 'ok'
}
