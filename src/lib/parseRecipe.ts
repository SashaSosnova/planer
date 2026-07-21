import type { FoodRef, MacroSet, RecipeDraft, RecipeIngredientLine } from '../types'
import { guessYieldFactor } from './cookingYield'
import { deepseekJson, isDeepseekConfigured } from './deepseek'
import { findBestFood, scoreFoodMatch } from './foodMatch'
import { guessFallbackCategory } from './nutrition'
import { computeRecipe } from './recipeCalc'
import { nonNeg, sanitizeMacros } from './sanitize'

const LIBRARY_MIN = 70

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

/** Ingredient lines with grams from the user's recipe text (skips dish title). */
export function extractRecipeIngredientHints(
  text: string,
): Array<{ name: string; grams: number }> {
  const lines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines.length === 0) return []

  let start = 1
  if (extractGrams(lines[0]!).grams != null) start = 0

  const out: Array<{ name: string; grams: number }> = []
  for (const line of lines.slice(start)) {
    const { name, grams } = extractGrams(line)
    if (!name || grams == null || grams <= 0) continue
    out.push({ name, grams })
  }
  return out
}

/**
 * Link an ingredient to the catalog only when the name actually matches.
 * Rejects LLM foodId mistakes («макароны» → «Паста с кабачком и курицей»).
 */
export function resolveRecipeIngredient(
  name: string,
  gramsRaw: number,
  foods: FoodRef[],
  claimedFoodId?: string | null,
  yieldFactor?: number,
  yieldNote?: string,
  per100gEstimate?: Partial<MacroSet> | null,
): RecipeIngredientLine {
  const yieldInfo = guessYieldFactor(name)
  const factor = Number(yieldFactor) > 0 ? Number(yieldFactor) : yieldInfo.factor
  const note = yieldNote ?? yieldInfo.note
  const query = name.trim()

  if (claimedFoodId) {
    const claimed = foods.find((f) => f.id === claimedFoodId)
    if (claimed && scoreFoodMatch(query, claimed) >= LIBRARY_MIN) {
      return {
        name: claimed.name,
        gramsRaw,
        foodId: claimed.id,
        per100g: sanitizeMacros(claimed.per100g),
        source: 'library',
        yieldFactor: factor,
        yieldNote: note,
      }
    }
  }

  const matched = findBestFood(query, foods, LIBRARY_MIN)
  if (matched) {
    return {
      name: matched.name,
      gramsRaw,
      foodId: matched.id,
      per100g: sanitizeMacros(matched.per100g),
      source: 'library',
      yieldFactor: factor,
      yieldNote: note,
    }
  }

  return {
    name: query || 'Ингредиент',
    gramsRaw,
    per100g: sanitizeMacros(per100gEstimate ?? guessFallbackCategory(query)),
    source: 'estimate',
    yieldFactor: factor,
    yieldNote: note,
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

  let name = lines[0]!
  let start = 1
  const firstAsIng = extractGrams(lines[0]!)
  if (firstAsIng.grams != null) {
    name = 'Блюдо'
    start = 0
  }

  const ingredients: RecipeIngredientLine[] = []
  for (const line of lines.slice(start)) {
    const { name: ingName, grams } = extractGrams(line)
    if (!ingName || grams == null || grams <= 0) continue
    ingredients.push(resolveRecipeIngredient(ingName, grams, foods))
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
    kind: f.kind,
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
- foodId ставь ТОЛЬКО при точном совпадении с каталогом (тот же продукт).
  «Макароны сухие» / «паста» ≠ готовое блюдо вроде «Паста с кабачком и курицей».
  Если сомневаешься — foodId: null и оцени per100g.
- Не подменяй ингредиент названием другого блюда из каталога.
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

  const hints = extractRecipeIngredientHints(text)
  const ingredients: RecipeIngredientLine[] = []

  for (let i = 0; i < (parsed.ingredients ?? []).length; i++) {
    const ing = parsed.ingredients![i]!
    const gramsRaw = nonNeg(ing.gramsRaw)
    const llmName = String(ing.name ?? '').trim()
    const hint = hints[i]
    // Prefer the user's wording for catalog checks — model often renames wrongly.
    const nameForMatch = hint?.name || llmName
    const grams = hint?.grams && hint.grams > 0 ? hint.grams : gramsRaw
    if (!nameForMatch || !(grams > 0)) continue

    ingredients.push(
      resolveRecipeIngredient(
        nameForMatch,
        grams,
        foods,
        ing.foodId,
        ing.yieldFactor,
        ing.yieldNote,
        ing.per100g,
      ),
    )
  }

  if (ingredients.length === 0) throw new Error('DeepSeek не вернул ингредиенты')

  const cookedOverride = nonNeg(parsed.cookedGramsEstimate, 0)
  return computeRecipe({
    name: String(parsed.name || 'Блюдо').trim() || 'Блюдо',
    ingredients,
    cookedGramsOverride: cookedOverride > 0 ? cookedOverride : null,
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
