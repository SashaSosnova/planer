import type { FoodRef, MacroSet, RecipeDraft, RecipeIngredientLine } from '../types'
import { guessYieldFactor } from './cookingYield'
import { deepseekJson, isDeepseekConfigured } from './deepseek'
import { findBestFood, scoreFoodMatch } from './foodMatch'
import { guessFallbackCategory } from './nutrition'
import { computeRecipe } from './recipeCalc'
import { nonNeg, sanitizeMacros } from './sanitize'

const LIBRARY_MIN = 70

export type RecipeIngredientHint = {
  name: string
  grams: number | null
}

/**
 * Parse «Говядина 600 г соломкой», «Сметана 200 г», «Лук 2 шт».
 * Grams may be mid-line; kitchen measures get rough estimates.
 */
export function extractIngredientLine(raw: string): RecipeIngredientHint {
  let s = raw.trim().replace(/^[-•*]\s*/, '')
  if (!s) return { name: '', grams: null }

  // Weight mid-line or at end: г / гр / мл / кг
  // Avoid \\b — it is ASCII-only and breaks Cyrillic units («г», «гр»).
  const weight = s.match(
    /(\d+(?:[.,]\d+)?)\s*(кг|kg|грамм(?:а|ов)?|гр|г|мл|ml)(?=\s|$|[^\p{L}])/iu,
  )
  if (weight && weight.index != null) {
    let grams = Number(weight[1]!.replace(',', '.'))
    const unit = weight[2]!.toLowerCase()
    if (unit === 'кг' || unit === 'kg') grams *= 1000
    const name = s
      .slice(0, weight.index)
      .replace(/[-–—:]\s*$/u, '')
      .trim()
    if (name && grams > 0) return { name, grams }
  }

  // «Лук 2 шт», «томатная паста 1 ч.л.»
  const measure = s.match(
    /^(.*?)\s+(\d+(?:[.,]\d+)?)\s*(шт\.?|ч\.?\s*л\.?|ст\.?\s*л\.?)(?=\s|$|[^\p{L}(])/iu,
  )
  if (measure) {
    const name = measure[1]!.replace(/[-–—:]\s*$/u, '').trim()
    const n = Number(measure[2]!.replace(',', '.'))
    const unit = measure[3]!.toLowerCase().replace(/\s+/g, '')
    if (name && n > 0) {
      let grams: number | null = null
      if (unit.startsWith('шт')) grams = Math.round(n * 75) // лук / средний овощ
      else if (unit.startsWith('ч')) grams = Math.round(n * 5)
      else if (unit.startsWith('ст')) grams = Math.round(n * 15)
      return { name, grams }
    }
  }

  return { name: s, grams: null }
}

function normalizeIngName(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
    .trim()
}

/** «Соль, сладкая паприка» → separate seasoning hints. */
export function expandRecipeHints(hints: RecipeIngredientHint[]): RecipeIngredientHint[] {
  const out: RecipeIngredientHint[] = []
  for (const h of hints) {
    if (h.grams != null || !h.name.includes(',')) {
      out.push(h)
      continue
    }
    const parts = h.name
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
    const looksLikeList =
      parts.length >= 2 &&
      parts.every((p) => p.length >= 2 && p.length <= 48 && !/\d/.test(p))
    if (!looksLikeList) {
      out.push(h)
      continue
    }
    for (const p of parts) out.push({ name: p, grams: null })
  }
  return out
}

export function isIngredientDuplicate(a: string, b: string): boolean {
  const na = normalizeIngName(a)
  const nb = normalizeIngName(b)
  if (!na || !nb) return false
  if (na === nb) return true

  const [shorter, longer] = na.length <= nb.length ? [na, nb] : [nb, na]
  if (!longer.includes(shorter) || shorter.length < 4) return false
  // «соль, сладкая паприка» vs «сладкая паприка»
  if (longer.includes(',')) return true
  const shortTok = shorter.split(' ').filter(Boolean)
  const longTok = longer.split(' ').filter(Boolean)
  // Multi-word phrase fully inside another line — not single «паста» ⊂ «томатная паста»
  return shortTok.length >= 2 && shortTok.every((t) => longTok.includes(t))
}

/** Drop LLM duplicates like «Соль, сладкая паприка» + «Сладкая паприка». */
export function dedupeRecipeIngredients(items: RecipeIngredientLine[]): RecipeIngredientLine[] {
  const out: RecipeIngredientLine[] = []
  for (const item of items) {
    if (!item.name.trim()) continue
    const idx = out.findIndex((x) => isIngredientDuplicate(x.name, item.name))
    if (idx < 0) {
      out.push(item)
      continue
    }
    const prev = out[idx]!
    const preferCleanName = (a: string, b: string) => {
      if (a.includes(',') !== b.includes(',')) return a.includes(',') ? b : a
      return a.length <= b.length ? a : b
    }
    const keepLibrary = prev.foodId ? prev : item.foodId ? item : prev
    out[idx] = {
      ...keepLibrary,
      name: preferCleanName(prev.name, item.name),
      gramsRaw: Math.max(item.gramsRaw, prev.gramsRaw),
      foodId: prev.foodId ?? item.foodId,
      source: prev.foodId || item.foodId ? 'library' : keepLibrary.source,
      per100g: prev.foodId ? prev.per100g : item.foodId ? item.per100g : keepLibrary.per100g,
    }
  }
  return out
}

/** Ingredient lines from recipe text (skips dish title). */
export function extractRecipeIngredientHints(text: string): RecipeIngredientHint[] {
  const lines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines.length === 0) return []

  let start = 1
  const first = extractIngredientLine(lines[0]!)
  if (first.grams != null) start = 0

  const out: RecipeIngredientHint[] = []
  for (const line of lines.slice(start)) {
    const parsed = extractIngredientLine(line)
    if (!parsed.name) continue
    out.push(parsed)
  }
  return expandRecipeHints(out)
}

/** Match LLM row to a user line by name — never by array index. */
export function pickIngredientHint(
  hints: RecipeIngredientHint[],
  llmName: string,
  used: Set<number>,
): RecipeIngredientHint | undefined {
  const q = llmName.trim()
  if (!q || hints.length === 0) return undefined

  let bestIdx = -1
  let bestScore = 0
  for (let i = 0; i < hints.length; i++) {
    if (used.has(i)) continue
    const hint = hints[i]!
    const asFood: FoodRef = {
      id: String(i),
      name: hint.name,
      aliases: [],
      per100g: { kcal: 0, protein: 0, fat: 0, carbs: 0 },
    }
    const asLlm: FoodRef = {
      id: 'llm',
      name: q,
      aliases: [],
      per100g: { kcal: 0, protein: 0, fat: 0, carbs: 0 },
    }
    const score = Math.max(scoreFoodMatch(q, asFood), scoreFoodMatch(hint.name, asLlm))
    if (score > bestScore) {
      bestScore = score
      bestIdx = i
    }
  }

  if (bestIdx < 0 || bestScore < 45) return undefined
  used.add(bestIdx)
  return hints[bestIdx]
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
  // Only plain products — never match a finished dish as an ingredient.
  const library = foods.filter((f) => f.kind !== 'dish')

  if (claimedFoodId) {
    const claimed = library.find((f) => f.id === claimedFoodId)
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

  const matched = findBestFood(query, library, LIBRARY_MIN)
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
  const firstAsIng = extractIngredientLine(lines[0]!)
  if (firstAsIng.grams != null) {
    name = 'Блюдо'
    start = 0
  }

  const ingredients: RecipeIngredientLine[] = []
  for (const line of lines.slice(start)) {
    const { name: ingName, grams } = extractIngredientLine(line)
    if (!ingName || grams == null || grams <= 0) continue
    ingredients.push(resolveRecipeIngredient(ingName, grams, foods))
  }

  const unique = dedupeRecipeIngredients(ingredients)
  if (unique.length === 0) {
    throw new Error('Не нашла ингредиенты с граммами. Пример: «Куриное филе — 300 гр»')
  }

  return computeRecipe({
    name,
    ingredients: unique,
    notes: 'Выход по типичным коэффициентам (набухание/ужарка). Можно поправить вручную.',
  })
}

function ingredientCatalog(foods: FoodRef[]): FoodRef[] {
  return foods.filter((f) => f.kind !== 'dish')
}

async function parseRecipeWithLlm(text: string, foods: FoodRef[]): Promise<RecipeDraft> {
  const catalog = ingredientCatalog(foods).map((f) => ({
    id: f.id,
    name: f.name,
    aliases: f.aliases,
    per100g: f.per100g,
    kind: f.kind ?? 'ingredient',
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
- Каталог — только простые продукты. foodId ставь ТОЛЬКО при точном совпадении.
  «Макароны сухие» / «паста» ≠ готовое блюдо вроде «Паста с кабачком и курицей».
  «Сметана» ≠ «салат со сметаной». «Говядина» ≠ любое блюдо с говядиной.
  Если сомневаешься — foodId: null и оцени per100g.
- Не подменяй ингредиент названием другого блюда из каталога.
- Сохраняй смысл названий пользователя («Говядина», не «салат»).
- «Соль, сладкая паприка» — РАЗДЕЛИ на отдельные позиции; не дублируй одну приправу дважды.
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
  const usedHints = new Set<number>()
  const ingredients: RecipeIngredientLine[] = []

  for (const ing of parsed.ingredients ?? []) {
    const gramsRaw = nonNeg(ing.gramsRaw)
    const llmName = String(ing.name ?? '').trim()
    if (!llmName) continue

    const hint = pickIngredientHint(hints, llmName, usedHints)
    // Prefer the user's wording for catalog checks — model often renames wrongly.
    const nameForMatch = hint?.name || llmName
    const grams =
      hint?.grams && hint.grams > 0 ? hint.grams : gramsRaw > 0 ? gramsRaw : 0
    if (!(grams > 0)) continue

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

  const unique = dedupeRecipeIngredients(ingredients)
  if (unique.length === 0) throw new Error('DeepSeek не вернул ингредиенты')

  const cookedOverride = nonNeg(parsed.cookedGramsEstimate, 0)
  return computeRecipe({
    name: String(parsed.name || 'Блюдо').trim() || 'Блюдо',
    ingredients: unique,
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
