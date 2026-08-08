import type { FoodRef, MealItem, MealType, ParsedMealDraft } from '../types'
import { deepseekJson } from './deepseek'
import { resolveCatalogMatch } from './foodMatch'
import { coerceMealType, defaultMealTypeForNow } from './labels'
import { defaultFoodGrams, defaultGramsForFoodName } from './foodPortion'
import { capitalizeFoodName } from './foodName'
import { unmatchedMealItem } from './mealUnknown'
import { guessFallbackCategory, scalePer100g, sumMacros } from './nutrition'
import {
  buildMealEstimatePrompt,
  buildMealSplitPrompt,
  type MacroEstimateLine,
  type MealSplitLine,
  type MealSplitResult,
} from './parseMealSplit'
import { nonNeg, sanitizeMealItems } from './sanitize'

export type { MealSplitLine, MealSplitResult }

function toLibraryItem(food: FoodRef, grams: number): MealItem {
  return {
    name: food.name,
    grams,
    foodId: food.id,
    ...scalePer100g(food.per100g, grams),
    source: 'library',
  }
}

function toEstimateItem(
  name: string,
  grams: number,
  macros: { kcal: number; protein: number; fat: number; carbs: number },
): MealItem {
  return {
    name: capitalizeFoodName(name),
    grams,
    kcal: nonNeg(macros.kcal),
    protein: nonNeg(macros.protein),
    fat: nonNeg(macros.fat),
    carbs: nonNeg(macros.carbs),
    source: 'estimate',
  }
}

function resolveGrams(line: MealSplitLine, food: FoodRef | null, eatingOut: boolean): number {
  if (line.grams != null && line.grams > 0) return line.grams
  if (food) return defaultFoodGrams(food)
  return defaultGramsForFoodName(line.name) ?? (eatingOut ? 300 : 100)
}

/**
 * Match split lines to catalog. Returns library items + unknowns still needing macros.
 * Ambiguous catalog hits stay as unmatched (no LLM invent) so the UI can ask which product.
 */
export function applyCatalogToSplit(
  lines: MealSplitLine[],
  foods: FoodRef[],
  eatingOut: boolean,
): {
  items: Array<MealItem | null>
  unknown: Array<{ index: number; name: string; grams: number }>
  needsPick: number
} {
  const items: Array<MealItem | null> = []
  const unknown: Array<{ index: number; name: string; grams: number }> = []
  let needsPick = 0

  lines.forEach((line, index) => {
    const name = capitalizeFoodName(line.name.trim() || 'Блюдо')
    const resolved = !eatingOut ? resolveCatalogMatch(name, foods, { minScore: 70 }) : { kind: 'none' as const }
    const food = resolved.kind === 'match' ? resolved.food : null
    const grams = resolveGrams({ ...line, name }, food, eatingOut)

    if (resolved.kind === 'match') {
      items.push(toLibraryItem(resolved.food, grams))
      return
    }

    if (resolved.kind === 'ambiguous') {
      needsPick += 1
      items.push(unmatchedMealItem(name, grams))
      return
    }

    items.push(null)
    unknown.push({ index, name, grams })
  })

  return { items, unknown, needsPick }
}

export async function splitMealTextWithLlm(
  text: string,
  mealType: MealType | undefined,
  eatingOut: boolean,
): Promise<MealSplitResult> {
  const parsed = await deepseekJson<MealSplitResult>(
    buildMealSplitPrompt({ text, mealType, eatingOut }),
  )
  const items = (parsed.items ?? [])
    .map((raw) => {
      const name = String(raw?.name ?? '').trim()
      if (!name) return null
      const g = Number(raw?.grams)
      const grams = Number.isFinite(g) && g > 0 ? g : null
      return { name, grams } satisfies MealSplitLine
    })
    .filter((x): x is MealSplitLine => x != null)

  if (items.length === 0) {
    throw new Error('DeepSeek не вернул позиции')
  }

  return {
    mealType: parsed.mealType,
    eatingOut: parsed.eatingOut,
    items,
    notes: parsed.notes,
  }
}

export async function estimateUnknownMacrosWithLlm(
  unknown: Array<{ name: string; grams: number }>,
): Promise<MacroEstimateLine[]> {
  if (unknown.length === 0) return []
  const parsed = await deepseekJson<{ items?: MacroEstimateLine[] }>(
    buildMealEstimatePrompt(unknown),
  )
  const rows = parsed.items ?? []
  return unknown.map((u, i) => {
    const row = rows[i]
    if (!row) {
      return { name: u.name, grams: u.grams, kcal: 0, protein: 0, fat: 0, carbs: 0 }
    }
    return {
      name: String(row.name || u.name),
      grams: Number(row.grams) > 0 ? Number(row.grams) : u.grams,
      kcal: nonNeg(row.kcal),
      protein: nonNeg(row.protein),
      fat: nonNeg(row.fat),
      carbs: nonNeg(row.carbs),
    }
  })
}

/**
 * Force-estimate one product (skip catalog match / disambiguation).
 * Used when the user rejects ambiguous catalog options or asks to evaluate КБЖУ.
 */
export async function estimateMealItemMacros(
  name: string,
  grams: number,
): Promise<MealItem> {
  const label = capitalizeFoodName(name.trim() || 'Блюдо')
  const g = grams > 0 ? grams : 100

  try {
    const [row] = await estimateUnknownMacrosWithLlm([{ name: label, grams: g }])
    if (row && (row.kcal > 0 || row.protein > 0 || row.fat > 0 || row.carbs > 0)) {
      return toEstimateItem(row.name || label, g, {
        kcal: row.kcal,
        protein: row.protein,
        fat: row.fat,
        carbs: row.carbs,
      })
    }
  } catch {
    // local heuristic below
  }

  return {
    name: label,
    grams: g,
    ...scalePer100g(guessFallbackCategory(label), g),
    source: 'estimate',
  }
}

/** Full LLM pipeline: split → catalog → estimate gaps. */
export async function parseMealCatalogFirst(
  text: string,
  foods: FoodRef[],
  mealType: MealType | undefined,
  eatingOut: boolean,
): Promise<ParsedMealDraft> {
  const split = await splitMealTextWithLlm(text, mealType, eatingOut)
  const out = Boolean(split.eatingOut ?? eatingOut)
  const { items: slots, unknown, needsPick } = applyCatalogToSplit(split.items, foods, out)

  let usedEstimateLlm = false
  let usedUnmatched = false
  if (unknown.length > 0) {
    let estimates: MacroEstimateLine[] | null = null
    try {
      estimates = await estimateUnknownMacrosWithLlm(unknown)
      usedEstimateLlm = true
    } catch {
      estimates = null
    }

    unknown.forEach((u, i) => {
      if (!estimates) {
        usedUnmatched = true
        slots[u.index] = unmatchedMealItem(u.name, u.grams)
        return
      }
      const est = estimates[i]!
      const looksLikeDrink = /вода|чай(?!\s*с)|американо|эспрессо/i.test(u.name)
      const empty =
        est.kcal <= 0 && est.protein <= 0 && est.fat <= 0 && est.carbs <= 0
      if (empty && !looksLikeDrink) {
        usedUnmatched = true
        slots[u.index] = unmatchedMealItem(u.name, u.grams)
      } else {
        slots[u.index] = toEstimateItem(est.name || u.name, u.grams, est)
      }
    })
  }

  const items = sanitizeMealItems(slots.filter((x): x is MealItem => x != null))
  if (items.length === 0) {
    throw new Error('Не удалось разобрать продукты')
  }

  const allLibrary = items.every((i) => i.source === 'library')
  const noteParts: string[] = []
  if (typeof split.notes === 'string' && split.notes.trim()) {
    noteParts.push(split.notes.trim())
  }
  if (needsPick > 0) {
    noteParts.push(
      needsPick === 1
        ? 'Уточните продукт — в справочнике несколько похожих.'
        : 'Уточните продукты — в справочнике несколько похожих.',
    )
  }
  if (allLibrary) {
    noteParts.push(
      items.length > 1
        ? 'Все позиции найдены в справочнике.'
        : 'Совпало с продуктом из справочника.',
    )
  } else if (usedUnmatched) {
    noteParts.push('Есть позиции не из справочника — КБЖУ не подставлялись автоматически.')
  } else if (usedEstimateLlm) {
    noteParts.push('Часть позиций оценена по КБЖУ (нет в справочнике).')
  }

  return {
    mealType: coerceMealType(split.mealType ?? mealType, defaultMealTypeForNow()),
    items,
    totals: sumMacros(items),
    isApproximate:
      out || items.some((i) => i.source === 'estimate' || i.source === 'unknown'),
    eatingOut: out,
    parseSource: allLibrary ? 'library' : 'deepseek',
    notes: noteParts.length > 0 ? noteParts.join(' ') : undefined,
  }
}
