import type { MacroSet, MealItem } from '../types'

export function emptyMacros(): MacroSet {
  return { kcal: 0, protein: 0, fat: 0, carbs: 0 }
}

export function scalePer100g(per100g: MacroSet, grams: number): MacroSet {
  const k = grams / 100
  return {
    kcal: round1(per100g.kcal * k),
    protein: round1(per100g.protein * k),
    fat: round1(per100g.fat * k),
    carbs: round1(per100g.carbs * k),
  }
}

export function sumMacros(items: Pick<MealItem, 'kcal' | 'protein' | 'fat' | 'carbs'>[]): MacroSet {
  return items.reduce(
    (acc, item) => ({
      kcal: round1(acc.kcal + item.kcal),
      protein: round1(acc.protein + item.protein),
      fat: round1(acc.fat + item.fat),
      carbs: round1(acc.carbs + item.carbs),
    }),
    emptyMacros(),
  )
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10
}

export function macrosFromItemFields(item: {
  grams: number
  kcal: number
  protein: number
  fat: number
  carbs: number
}): MacroSet {
  return {
    kcal: round1(item.kcal),
    protein: round1(item.protein),
    fat: round1(item.fat),
    carbs: round1(item.carbs),
  }
}

/** Rough fallback estimates when LLM is unavailable (per 100g). */
export const FALLBACK_ESTIMATES: Record<string, MacroSet> = {
  default: { kcal: 150, protein: 8, fat: 6, carbs: 15 },
  /** Brewed black coffee / americano — nearly zero */
  coffee: { kcal: 2, protein: 0.1, fat: 0, carbs: 0 },
  tea: { kcal: 1, protein: 0, fat: 0, carbs: 0 },
  /** Ready latte/cappuccino cup, not split into parts */
  coffeeMilkDrink: { kcal: 45, protein: 2, fat: 2, carbs: 4 },
  milk: { kcal: 52, protein: 2.9, fat: 2.5, carbs: 4.7 },
  cream20: { kcal: 205, protein: 2.5, fat: 20, carbs: 3.5 },
  bread: { kcal: 265, protein: 9, fat: 3, carbs: 49 },
  fish: { kcal: 140, protein: 20, fat: 6, carbs: 0 },
  cheese: { kcal: 250, protein: 12, fat: 20, carbs: 3 },
  soup: { kcal: 60, protein: 3, fat: 2, carbs: 7 },
  salad: { kcal: 80, protein: 3, fat: 5, carbs: 6 },
  /** Dry pasta / spaghetti per 100g */
  pastaDry: { kcal: 350, protein: 12, fat: 1.5, carbs: 72 },
  pasta: { kcal: 150, protein: 5, fat: 3, carbs: 25 },
  chickenRaw: { kcal: 110, protein: 23, fat: 1.5, carbs: 0 },
  zucchini: { kcal: 20, protein: 1.2, fat: 0.3, carbs: 3.5 },
  oil: { kcal: 900, protein: 0, fat: 100, carbs: 0 },
  meat: { kcal: 200, protein: 22, fat: 12, carbs: 0 },
  dessert: { kcal: 280, protein: 4, fat: 12, carbs: 38 },
}

export function guessFallbackCategory(name: string): MacroSet {
  const n = name.toLowerCase().replace(/ё/g, 'е')
  if (/латте|капучино|флэт\s*уайт|раф/.test(n)) return FALLBACK_ESTIMATES.coffeeMilkDrink
  if (/сливк\w*\s*20|20\s*%\s*сливк|сливки/.test(n)) return FALLBACK_ESTIMATES.cream20
  if (/молок/.test(n)) return FALLBACK_ESTIMATES.milk
  if (/кофе|американо|эспрессо/.test(n)) return FALLBACK_ESTIMATES.coffee
  if (/чай/.test(n)) return FALLBACK_ESTIMATES.tea
  if (/масло|оливк/.test(n)) return FALLBACK_ESTIMATES.oil
  if (/кабачок|цукини/.test(n)) return FALLBACK_ESTIMATES.zucchini
  if (/хлеб|тост|булка|батон/.test(n)) return FALLBACK_ESTIMATES.bread
  if (/форель|лосось|рыба|тунец|сельдь/.test(n)) return FALLBACK_ESTIMATES.fish
  if (/сыр|творог|йогурт/.test(n)) return FALLBACK_ESTIMATES.cheese
  if (/суп|борщ|щи|бульон/.test(n)) return FALLBACK_ESTIMATES.soup
  if (/салат/.test(n)) return FALLBACK_ESTIMATES.salad
  if (/спагетт|макарон|лапш|вермишел|сухи/.test(n)) return FALLBACK_ESTIMATES.pastaDry
  if (/паста|рис|греч|пицц|бургер|шаурма|роллы|суши/.test(n)) {
    return FALLBACK_ESTIMATES.pasta
  }
  /** Breaded / fried chicken strips, nuggets */
  if (/стрипс|наггет|крылыш|наггетс/.test(n)) {
    return { kcal: 250, protein: 18, fat: 14, carbs: 14 }
  }
  if (/филе|грудк|курин/.test(n)) return FALLBACK_ESTIMATES.chickenRaw
  if (/мясо|говяд|свинин|котлет|стейк/.test(n)) return FALLBACK_ESTIMATES.meat
  if (/торт|пирож|десерт|мороженое|шоколад/.test(n)) return FALLBACK_ESTIMATES.dessert
  return FALLBACK_ESTIMATES.default
}

/** Typical restaurant serving size when weight is unknown. */
export function restaurantPortionGrams(name: string): number {
  const n = name.toLowerCase().replace(/ё/g, 'е')
  if (/кофе|чай|американо|латте|капучино/.test(n)) return 250
  if (/суп|борщ|щи|бульон/.test(n)) return 300
  if (/салат/.test(n)) return 200
  if (/пицц/.test(n)) return 350
  if (/бургер|шаурма/.test(n)) return 280
  if (/паста|макарон|рис|греч|плов/.test(n)) return 320
  if (/стейк|мясо|курица|рыба|форель|лосось/.test(n)) return 180
  if (/десерт|торт|мороженое/.test(n)) return 120
  if (/хлеб|тост|булка/.test(n)) return 40
  return 280
}
