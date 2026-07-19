import type { FoodRef, MealType, ParsedMealDraft } from '../types'
import { deepseekJson, isDeepseekConfigured } from './deepseek'
import { defaultMealTypeForNow } from './labels'
import { buildParseMealPrompt } from './parseMealPrompt'
import { guessFallbackCategory, scalePer100g, sumMacros } from './nutrition'

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

  let usedZeroFallback = false
  const items = (parsed.items ?? []).map((item) => {
    const grams = Number(item.grams) > 0 ? Number(item.grams) : 300
    const name = String(item.name || 'Блюдо')
    let kcal = Number(item.kcal) || 0
    let protein = Number(item.protein) || 0
    let fat = Number(item.fat) || 0
    let carbs = Number(item.carbs) || 0

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

  if (items.length === 0) {
    throw new Error('DeepSeek не вернул позиции')
  }

  const out = Boolean(parsed.eatingOut ?? eatingOut)
  const baseNote = parsed.notes
    ? `DeepSeek flash: ${parsed.notes}`
    : 'Оценка через DeepSeek flash (без поиска в интернете).'
  return {
    mealType: parsed.mealType ?? mealType ?? defaultMealTypeForNow(),
    items,
    totals: sumMacros(items),
    isApproximate: true,
    eatingOut: out,
    parseSource: 'deepseek',
    notes: usedZeroFallback
      ? `${baseNote} КБЖУ модель вернула нулями — подставлена типичная оценка.`
      : baseNote,
  }
}
