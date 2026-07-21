import type { FoodRef, MealType, ParsedMealDraft } from '../types'
import { deepseekJson, isDeepseekConfigured } from './deepseek'
import { coerceMealType, defaultMealTypeForNow } from './labels'
import { buildParseMealPrompt } from './parseMealPrompt'
import { guessFallbackCategory, scalePer100g, sumMacros } from './nutrition'
import { nonNeg, sanitizeMealItems } from './sanitize'

type LlmItem = {
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

type LlmResult = {
  mealType?: MealType
  eatingOut?: boolean
  items?: LlmItem[]
  notes?: string
}

export function isLlmConfigured(): boolean {
  return isDeepseekConfigured()
}

export async function parseMealWithLlm(
  text: string,
  foods: FoodRef[],
  mealType: MealType | undefined,
  eatingOut: boolean,
): Promise<ParsedMealDraft> {
  const prompt = buildParseMealPrompt({ text, mealType, eatingOut, foods })
  const parsed = await deepseekJson<LlmResult>(prompt)
  const foodMap = new Map(foods.map((f) => [f.id, f]))

  let usedZeroFallback = false
  const mapped = (parsed.items ?? []).map((item) => {
    const grams = Number(item.grams) > 0 ? Number(item.grams) : 300
    const name = String(item.name || 'Блюдо')
    const food = item.foodId ? foodMap.get(item.foodId) : undefined
    const useLibrary =
      Boolean(food) && !eatingOut && item.needsEstimate !== true && item.source !== 'estimate'

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

    // Flash sometimes returns 0/0/0/0 when unsure — replace with local estimate
    const looksLikeDrink = /вода|чай(?!\s*с)|американо|эспрессо|чёрн\w*\s*кофе/i.test(name)
    if (!looksLikeDrink && kcal <= 0 && protein <= 0 && fat <= 0 && carbs <= 0) {
      const fallback = scalePer100g(guessFallbackCategory(name), grams)
      kcal = fallback.kcal
      protein = fallback.protein
      fat = fallback.fat
      carbs = fallback.carbs
      usedZeroFallback = true
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

  const out = Boolean(parsed.eatingOut ?? eatingOut)
  return {
    mealType: coerceMealType(parsed.mealType ?? mealType, defaultMealTypeForNow()),
    items,
    totals: sumMacros(items),
    isApproximate: out || items.some((i) => i.source === 'estimate'),
    eatingOut: out,
    parseSource: 'deepseek',
    notes: usedZeroFallback
      ? 'КБЖУ модель вернула нулями — подставлена типичная оценка.'
      : undefined,
  }
}
