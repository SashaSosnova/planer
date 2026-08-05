import { inferDishCategory } from './foodCategory'
import { findExistingMenuDish } from './menuDishDedupe'
import { parseRecipeFromIngredientLines } from './parseRecipe'
import { recipeToFoodItem } from './recipeCalc'
import type { FoodItem, FoodRef, MacroSet } from '../types'

/** Default URL for menu repo export (dishes.json on GitHub Pages). */
export const MENU_DISHES_URL = 'https://sashasosnova.github.io/menu/dishes.json'

/** Not synced to planer — leftovers are reheating notes, not recipes for KBZHU. */
export const MENU_SYNC_SKIP_IDS = new Set([
  'leftovers_cutlets',
  'leftovers_roast',
  'leftovers_baked_chicken',
  'leftovers_wings',
  'leftovers_fish',
  'leftovers_thighs',
  'salad_carrot_korean',
])

export function filterMenuDishesForSync(dishes: MenuDishExport[]): MenuDishExport[] {
  return dishes.filter((d) => !MENU_SYNC_SKIP_IDS.has(d.id))
}

export type MenuDishExport = {
  id: string
  name: string
  ingredients: string[]
  steps?: string
  servings?: string
  storage?: string
  weeks?: number[]
}

export type ProductCatalogEntry = {
  name: string
  aliases: string[]
  category?: string
  brand?: string
}

export type MenuImportLineResult = {
  menuId: string
  name: string
  status: 'created' | 'updated' | 'error'
  matched: number
  total: number
  unmatched: string[]
  error?: string
}

export type MenuImportResult = {
  results: MenuImportLineResult[]
  created: number
  updated: number
  errors: number
  removedDupes?: number
}

export type MenuMacrosExport = {
  version: 1
  exportedAt: string
  dishes: Record<
    string,
    MacroSet & {
      name: string
    }
  >
}

function parseMenuDish(raw: unknown): MenuDishExport | null {
  if (!raw || typeof raw !== 'object') return null
  const d = raw as Record<string, unknown>
  const id = String(d.id ?? '').trim()
  const name = String(d.name ?? '').trim()
  if (!id || !name) return null
  if (!Array.isArray(d.ingredients)) return null
  const ingredients = d.ingredients
    .map(String)
    .map((s) => s.trim())
    .filter(Boolean)
  if (ingredients.length === 0) return null
  return {
    id,
    name,
    ingredients,
    ...(d.steps != null && String(d.steps).trim() ? { steps: String(d.steps).trim() } : {}),
    ...(d.servings != null && String(d.servings).trim()
      ? { servings: String(d.servings).trim() }
      : {}),
    ...(d.storage != null && String(d.storage).trim()
      ? { storage: String(d.storage).trim() }
      : {}),
    ...(Array.isArray(d.weeks)
      ? { weeks: d.weeks.map(Number).filter((n) => Number.isFinite(n)) }
      : {}),
  }
}

/** Parse menu export: `{ dishes: [...] }`, a bare array, or `{ bolognese: {...} }`. */
export function parseMenuDishesBundle(raw: unknown): MenuDishExport[] {
  if (Array.isArray(raw)) {
    const dishes = filterMenuDishesForSync(
      raw.map(parseMenuDish).filter((d): d is MenuDishExport => d != null),
    )
    if (dishes.length === 0) throw new Error('В JSON нет ни одного блюда с ингредиентами')
    return dishes
  }
  if (!raw || typeof raw !== 'object') {
    throw new Error('Ожидается JSON: { dishes: [...] } или массив блюд')
  }
  const obj = raw as Record<string, unknown>
  if (Array.isArray(obj.dishes)) {
    const dishes = filterMenuDishesForSync(
      obj.dishes.map(parseMenuDish).filter((d): d is MenuDishExport => d != null),
    )
    if (dishes.length === 0) throw new Error('В dishes[] нет ни одного блюда с ингредиентами')
    return dishes
  }
  const values = Object.values(obj)
  if (
    values.length > 0 &&
    values.every((v) => {
      if (!v || typeof v !== 'object') return false
      return 'ingredients' in (v as object) || 'name' in (v as object)
    })
  ) {
    const dishes = filterMenuDishesForSync(
      values.map(parseMenuDish).filter((d): d is MenuDishExport => d != null),
    )
    if (dishes.length === 0) throw new Error('Не удалось разобрать блюда из JSON')
    return dishes
  }
  throw new Error('Ожидается JSON: { dishes: [...] } или массив блюд')
}

export function buildMenuRecipeText(dish: MenuDishExport): string {
  return [dish.name, ...dish.ingredients].join('\n')
}

export function buildMenuRecipeNotes(dish: MenuDishExport): string | undefined {
  const parts = [
    dish.servings ? `Порции: ${dish.servings}` : '',
    dish.storage ? `Хранение: ${dish.storage}` : '',
    dish.steps?.trim() ?? '',
  ].filter(Boolean)
  return parts.length ? parts.join('\n\n') : undefined
}

export function foodsToIngredientRefs(foods: FoodItem[]): FoodRef[] {
  return foods
    .filter((f) => f.kind !== 'dish')
    .map((f) => ({
      id: f.id,
      name: f.name,
      aliases: f.aliases,
      per100g: f.per100g,
      kind: f.kind ?? 'ingredient',
      portionGrams: f.portionGrams,
    }))
}

export function exportProductCatalog(foods: FoodItem[]): ProductCatalogEntry[] {
  return foods
    .filter((f) => f.kind !== 'dish')
    .map((f) => ({
      name: f.name,
      aliases: f.aliases.filter((a) => a !== f.name),
      ...(f.category ? { category: f.category } : {}),
      ...(f.brand ? { brand: f.brand } : {}),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
}

export function exportMenuMacros(foods: FoodItem[]): MenuMacrosExport {
  const dishes: MenuMacrosExport['dishes'] = {}
  for (const food of foods) {
    if (food.kind !== 'dish' || !food.menuId) continue
    dishes[food.menuId] = {
      name: food.name,
      ...food.per100g,
    }
  }
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    dishes,
  }
}

export function menuDishToFoodInput(
  dish: MenuDishExport,
  foods: FoodRef[],
  existingId?: string,
): {
  input: Omit<FoodItem, 'id' | 'updatedAt'> & { id?: string; menuId: string }
  unmatched: string[]
} {
  const sourceText = buildMenuRecipeText(dish)
  const draft = parseRecipeFromIngredientLines(dish.name, dish.ingredients, foods)
  draft.name = dish.name
  const extraNotes = buildMenuRecipeNotes(dish)
  if (extraNotes) {
    draft.notes = draft.notes ? `${draft.notes}\n\n${extraNotes}` : extraNotes
  }

  const unmatched = draft.ingredients.filter((i) => i.source === 'estimate').map((i) => i.name)
  const input = recipeToFoodItem(
    draft,
    existingId,
    sourceText,
    undefined,
    inferDishCategory(dish.name, draft.ingredients),
  )

  return {
    input: { ...input, menuId: dish.id },
    unmatched,
  }
}

export function buildMenuImportPlan(
  dishes: MenuDishExport[],
  foods: FoodItem[],
): Array<{
  dish: MenuDishExport
  existingId?: string
  input: Omit<FoodItem, 'id' | 'updatedAt'> & { id?: string; menuId: string }
  unmatched: string[]
}> {
  const refs = foodsToIngredientRefs(foods)
  return dishes.map((dish) => {
    const existing = findExistingMenuDish(foods, dish.id, dish.name)
    const { input, unmatched } = menuDishToFoodInput(dish, refs, existing?.id)
    return { dish, existingId: existing?.id, input, unmatched }
  })
}

export function summarizeMenuImport(
  results: MenuImportLineResult[],
): Pick<MenuImportResult, 'created' | 'updated' | 'errors'> {
  let created = 0
  let updated = 0
  let errors = 0
  for (const r of results) {
    if (r.status === 'created') created++
    else if (r.status === 'updated') updated++
    else errors++
  }
  return { created, updated, errors }
}
