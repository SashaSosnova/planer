import type { FoodItem, Meal, MealItem } from '../types'

function normalize(name: string): string {
  return name.toLowerCase().replace(/ё/g, 'е')
}

/**
 * Starchy / processed items that should not count as vegetables.
 * Word-ish boundaries so «кусок» does not match «сок».
 */
const EXCLUDE =
  /картофел|(?<![а-яё])пюре(?![а-яё])|(?<![а-яё])сок(?![а-яё])|кетчуп|томатн[а-яё]*\s*паст|чипсы|(?<![а-яё])фри(?![а-яё])|крахмал/i

/**
 * Vegetable markers in Russian meal/item names.
 * Mixed dishes (e.g. «салат с курицей») count fully when a marker matches.
 */
const INCLUDE =
  /овощ|огурец|помидор|томат|капуст|морков|свекл|перец|кабачок|цукини|баклажан|брокколи|салат|шпинат|фасоль|стручков|горош|кукуруз|редис|репа(?:[^а-я]|$)|тыква|сельдерей|лук(?:[^а-я]|$)|чеснок|руккол|латук|репчат|базилик|петрушк|укроп|пекинск|кольраби|спаржа|артишок|патиссон|дайкон|щавель|зелень|листов/i

export function isVegetableName(name: string): boolean {
  const n = normalize(name)
  if (!n.trim()) return false
  if (EXCLUDE.test(n)) return false
  return INCLUDE.test(n)
}

function vegGramsFromRecipeItem(item: MealItem, foods: FoodItem[]): number {
  if (!item.foodId) return 0
  const food = foods.find((f) => f.id === item.foodId)
  const recipe = food?.recipe
  if (!recipe?.ingredients?.length) return 0

  const base =
    recipe.totalCookedGrams > 0
      ? recipe.totalCookedGrams
      : recipe.totalRawGrams > 0
        ? recipe.totalRawGrams
        : 0
  if (!(base > 0) || !(item.grams > 0)) return 0

  const scale = item.grams / base
  let veg = 0
  for (const ing of recipe.ingredients) {
    if (!isVegetableName(ing.name)) continue
    const cooked =
      ing.gramsRaw > 0 ? ing.gramsRaw * (ing.yieldFactor > 0 ? ing.yieldFactor : 1) : 0
    veg += cooked * scale
  }
  return veg
}

/** Vegetable grams for one meal line (name match or recipe ingredients). */
export function vegGramsFromItem(item: MealItem, foods: FoodItem[] = []): number {
  if (isVegetableName(item.name)) return Number(item.grams) || 0
  return vegGramsFromRecipeItem(item, foods)
}

/** Sum grams of vegetable-like items across meals (incl. veg inside dishes). */
export function vegGramsFromMeals(meals: Meal[], foods: FoodItem[] = []): number {
  let total = 0
  for (const meal of meals) {
    for (const item of meal.items) {
      total += vegGramsFromItem(item, foods)
    }
    // Free-text mention when nothing on the plate matched (e.g. «бутер с помидором»).
    if (
      meal.items.length > 0 &&
      meal.items.every((it) => vegGramsFromItem(it, foods) <= 0) &&
      isVegetableName(meal.rawText)
    ) {
      // Rough default slice in a sandwich / wrap when veg is only in the phrase.
      total += 40
    }
  }
  return Math.round(total)
}
