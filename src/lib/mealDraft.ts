import type { Meal, MealItem, MealType, ParsedMealDraft } from '../types'
import { MEAL_TYPE_ORDER } from './labels'

/** Blank draft rows are dropped on save — ignore for resolve / ≈. */
export function mealItemIsBlank(item: MealItem): boolean {
  return !item.name.trim()
}

/** foodId that still exists in the catalog (dangling ids don't count). */
export function mealItemHasLiveFoodId(
  item: MealItem,
  foods?: Iterable<{ id: string }>,
): boolean {
  if (!item.foodId) return false
  if (!foods) return true
  for (const f of foods) {
    if (f.id === item.foodId) return true
  }
  return false
}

/** Named position still waiting for catalog pick or macros. */
export function mealItemIsUnresolved(
  item: MealItem,
  foods?: Iterable<{ id: string }>,
): boolean {
  if (mealItemIsBlank(item)) return false
  if (item.source === 'unknown') return true
  if (mealItemHasLiveFoodId(item, foods)) return false
  // Dangling foodId: allow save only when macros already present.
  if (item.foodId && foods && !mealItemHasLiveFoodId(item, foods)) {
    return !(item.kcal > 0)
  }
  if (item.source === 'library') return false
  // Finished estimate (incl. 0 kcal water) is OK to save.
  if (item.source === 'estimate') return false
  return !(item.kcal > 0)
}

export function mealItemsHaveUnresolved(
  items: MealItem[],
  foods?: Iterable<{ id: string }>,
): boolean {
  return items.some((i) => mealItemIsUnresolved(i, foods))
}

export function mealItemsAreApproximate(
  eatingOut: boolean,
  items: Iterable<MealItem>,
): boolean {
  for (const i of items) {
    if (mealItemIsBlank(i)) continue
    if (i.source === 'estimate' || i.source === 'unknown') return true
  }
  return eatingOut
}

/** Breakfast → lunch → dinner → snack, then createdAt. */
export function compareMealsByTypeThenTime(a: Meal, b: Meal): number {
  const ia = MEAL_TYPE_ORDER.indexOf(a.mealType)
  const ib = MEAL_TYPE_ORDER.indexOf(b.mealType)
  const sa = ia < 0 ? MEAL_TYPE_ORDER.length : ia
  const sb = ib < 0 ? MEAL_TYPE_ORDER.length : ib
  if (sa !== sb) return sa - sb
  return a.createdAt - b.createdAt
}

const CLARIFY_NOTE_RE = /Уточните продукты? — в справочнике несколько похожих\.\s*/gi

export function stripClarifyNotes(notes: string | undefined): string | undefined {
  if (!notes) return undefined
  const cleaned = notes.replace(CLARIFY_NOTE_RE, '').trim()
  return cleaned || undefined
}

export function resolveDraftMealType(opts: {
  text: string
  userMealType: MealType
  mealTypeTouched: boolean
  parsedMealType: MealType
  extractFromText: (text: string) => { mealType: MealType | null }
}): MealType {
  const fromText = opts.extractFromText(opts.text).mealType
  if (fromText) return fromText
  if (opts.mealTypeTouched) return opts.userMealType
  return opts.parsedMealType
}

/** Soft / bulk foods: portionGrams is a serving, not «1 шт». */
const BULK_PORTION_NAME_RE =
  /творог|йогурт|каша|рис|гречк|овсян|филе|фарш|масло|молоко|сок|суп|пюре|сметан|сливк|творожн|кабачк|салат(?!\s*коул)/i

export function showPieceControls(food: {
  name: string
  portionGrams?: number | null
}): boolean {
  if (!(food.portionGrams != null && food.portionGrams > 0)) return false
  if (BULK_PORTION_NAME_RE.test(food.name)) return false
  return true
}

/** Prefer ingredient when remembering a free-text estimate. */
export function inferSavedFoodKind(name: string): 'ingredient' | 'dish' {
  if (
    /салат|суп|борщ|щи|каша|паста с|омлет|яичниц|бутерброд|тост|пицц|запеканк|плов|рагу|тефтел|котлет|пюре|латте|капучино/i.test(
      name,
    )
  ) {
    return 'dish'
  }
  return 'ingredient'
}

/** Soft cap for list previews; prefers cutting after a whole «item, » segment. */
export function truncateMealPreview(text: string, maxLen = 120): string {
  const t = text.trim()
  if (t.length <= maxLen) return t
  const budget = Math.max(1, maxLen - 1)
  const slice = t.slice(0, budget)
  const lastComma = slice.lastIndexOf(', ')
  // Keep at least ~⅓ of the budget so we don't collapse to a single short word.
  if (lastComma >= Math.min(24, Math.floor(budget * 0.35))) {
    return `${slice.slice(0, lastComma).trimEnd()}…`
  }
  return `${slice.trimEnd()}…`
}

/** After edits: drop stale clarify notes; promote parseSource when all library. */
export function applyDraftResolutionMeta(
  draft: ParsedMealDraft,
  stillNeedsClarify: boolean,
): ParsedMealDraft {
  const allLibrary = draft.items.every((i) => i.source === 'library')
  return {
    ...draft,
    notes: stillNeedsClarify ? draft.notes : stripClarifyNotes(draft.notes),
    parseSource: allLibrary ? 'library' : draft.parseSource,
    isApproximate: mealItemsAreApproximate(draft.eatingOut, draft.items),
  }
}
