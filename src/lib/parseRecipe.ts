import type { FoodRef, RecipeDraft, RecipeIngredientLine } from '../types'
import { guessYieldFactor } from './cookingYield'
import { deepseekJson, isDeepseekConfigured } from './deepseek'
import { findBestFood } from './foodMatch'
import { guessFallbackCategory } from './nutrition'
import { computeRecipe } from './recipeCalc'

function extractGrams(line: string): { name: string; grams: number | null } {
  const m = line.trim().match(
    /^(?:[-•*]?\s*)?(.*?)\s*[-–—:]?\s*(\d+(?:[.,]\d+)?)\s*(?:грамм(?:а|ов)?|гр|г|мл|ml)\s*$/iu,
  )
  if (m) {
    return {
      name: m[1].replace(/[-–—:]\s*$/, '').trim(),
      grams: Number(m[2].replace(',', '.')),
    }
  }
  return { name: line.trim(), grams: null }
}

function resolveIngredient(name: string, grams: number, foods: FoodRef[]): RecipeIngredientLine {
  const matched = findBestFood(name, foods)
  const yieldInfo = guessYieldFactor(name)
  if (matched) {
    return {
      name: matched.name,
      gramsRaw: grams,
      foodId: matched.id,
      per100g: matched.per100g,
      source: 'library',
      yieldFactor: yieldInfo.factor,
      yieldNote: yieldInfo.note,
    }
  }
  return {
    name,
    gramsRaw: grams,
    per100g: guessFallbackCategory(name),
    source: 'estimate',
    yieldFactor: yieldInfo.factor,
    yieldNote: yieldInfo.note,
  }
}

/** Local fallback: first line = dish name, next lines = «product - 300 гр». */
export function parseRecipeLocal(text: string, foods: FoodRef[]): RecipeDraft {
  const lines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)

  if (lines.length === 0) {
    throw new Error('Введите название блюда и ингредиенты')
  }

  let name = lines[0]
  let start = 1
  const firstAsIng = extractGrams(lines[0])
  if (firstAsIng.grams != null) {
    name = 'Блюдо'
    start = 0
  }

  const ingredients: RecipeIngredientLine[] = []
  for (const line of lines.slice(start)) {
    const { name: ingName, grams } = extractGrams(line)
    if (!ingName || grams == null || grams <= 0) continue
    ingredients.push(resolveIngredient(ingName, grams, foods))
  }

  if (ingredients.length === 0) {
    throw new Error('Не нашла ингредиенты с граммами. Пример: «Куриное филе — 300 гр»')
  }

  return computeRecipe({
    name,
    ingredients,
    notes: 'Выход по типичным коэффициентам (набухание/ужарка). Можно поправить вручную.',
  })
}

async function parseRecipeWithLlm(text: string, foods: FoodRef[]): Promise<RecipeDraft> {
  const catalog = foods.map((f) => ({
    id: f.id,
    name: f.name,
    aliases: f.aliases,
    per100g: f.per100g,
  }))

  const prompt = `Разбери рецепт / состав блюда на русском. Нужен расчёт КБЖУ готового блюда.

Верни ТОЛЬКО JSON:
{
  "name": "короткое название блюда",
  "cookedGramsEstimate": число или null,
  "ingredients": [
    {
      "name": "ингредиент",
      "gramsRaw": число,
      "foodId": "id из каталога или null",
      "yieldFactor": число (готовый вес / сырой; спагетти сухие ~2.3, курица ~0.75, кабачок ~0.55, сливки ~0.85, масло ~1),
      "yieldNote": "кратко",
      "per100g": { "kcal": n, "protein": n, "fat": n, "carbs": n }
    }
  ],
  "notes": "про выход"
}

Правила:
- gramsRaw — вес ДО готовки.
- Если ингредиент есть в каталоге — foodId и per100g из каталога (не выдумывай).
- Если нет — оцени per100g типичные средние.
- yieldFactor обязателен для каждого.
- cookedGramsEstimate — суммарный вес готового блюда, если можешь оценить; иначе null.

Каталог:
${JSON.stringify(catalog)}

Текст:
${text}`

  const parsed = await deepseekJson<{
    name?: string
    cookedGramsEstimate?: number | null
    notes?: string
    ingredients?: Array<{
      name: string
      gramsRaw: number
      foodId?: string | null
      yieldFactor?: number
      yieldNote?: string
      per100g?: { kcal: number; protein: number; fat: number; carbs: number }
    }>
  }>(prompt)

  const ingredients: RecipeIngredientLine[] = (parsed.ingredients ?? []).map((ing) => {
    const lib = ing.foodId ? foods.find((f) => f.id === ing.foodId) : findBestFood(ing.name, foods)
    const yieldInfo = guessYieldFactor(ing.name)
    if (lib) {
      return {
        name: lib.name,
        gramsRaw: Number(ing.gramsRaw) || 0,
        foodId: lib.id,
        per100g: lib.per100g,
        source: 'library' as const,
        yieldFactor: Number(ing.yieldFactor) > 0 ? Number(ing.yieldFactor) : yieldInfo.factor,
        yieldNote: ing.yieldNote ?? yieldInfo.note,
      }
    }
    return {
      name: String(ing.name),
      gramsRaw: Number(ing.gramsRaw) || 0,
      per100g: ing.per100g ?? guessFallbackCategory(ing.name),
      source: 'estimate' as const,
      yieldFactor: Number(ing.yieldFactor) > 0 ? Number(ing.yieldFactor) : yieldInfo.factor,
      yieldNote: ing.yieldNote ?? yieldInfo.note,
    }
  })

  if (ingredients.length === 0) throw new Error('DeepSeek не вернул ингредиенты')

  return computeRecipe({
    name: parsed.name || 'Блюдо',
    ingredients,
    cookedGramsOverride: parsed.cookedGramsEstimate ?? null,
    notes: parsed.notes,
  })
}

export async function parseRecipe(text: string, foods: FoodRef[]): Promise<RecipeDraft> {
  const trimmed = text.trim()
  if (!trimmed) throw new Error('Введите рецепт')

  if (isDeepseekConfigured()) {
    try {
      return await parseRecipeWithLlm(trimmed, foods)
    } catch {
      // local fallback
    }
  }

  return parseRecipeLocal(trimmed, foods)
}
