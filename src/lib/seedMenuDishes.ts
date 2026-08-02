import menuDishesSeed from '../data/menuDishes.seed.json' with { type: 'json' }
import type { FoodItem, MacroSet, RecipeSnapshot } from '../types'
import { sanitizeMacros } from './sanitize'

/** Bump when seed content/shape changes so clients re-upsert menu dishes. */
export const SEED_MENU_DISHES_KEY = 'planer-seed-menu-dishes-v3'

export type MenuDishSeedRow = {
  menuId: string
  name: string
  per100g: MacroSet
  ingredients?: string[]
  notes?: string
}

export type MenuDishCandidate = Omit<FoodItem, 'id' | 'updatedAt'> & { id: string }

const rows = menuDishesSeed as MenuDishSeedRow[]

/** Editor text: dish title + original ingredient lines (no synthetic «100 гр»). */
export function menuDishSourceText(name: string, ingredients: string[]): string {
  const lines = [name.trim(), ...ingredients.map((l) => l.trim()).filter(Boolean)]
  return lines.filter(Boolean).join('\n')
}

function recipeFromSeed(
  name: string,
  per100g: MacroSet,
  ingredients: string[],
  notes?: string,
): RecipeSnapshot {
  const sourceText = menuDishSourceText(name, ingredients)
  // Catalog КБЖУ comes from menu macros; keep a single cooked stub for totals.
  return {
    ingredients: [
      {
        name,
        gramsRaw: 100,
        per100g,
        source: 'estimate',
        yieldFactor: 1,
      },
    ],
    totalRawGrams: 100,
    totalCookedGrams: 100,
    totalMacros: per100g,
    sourceText,
    ...(notes ? { notes } : {}),
  }
}

/** Stable id so re-import / cloud sync does not create duplicates. */
export function menuDishFoodId(menuId: string): string {
  return `menu-${menuId}`
}

/**
 * All weekly-menu dishes as FoodItems (for upsert by stable menu-* id).
 */
export function buildMenuDishSeedFoods(): MenuDishCandidate[] {
  const out: MenuDishCandidate[] = []
  const seenNames = new Set<string>()

  for (const row of rows) {
    const name = row.name.trim()
    if (!name || !row.menuId) continue
    const nameKey = name.toLowerCase().replace(/ё/g, 'е')
    if (seenNames.has(nameKey)) continue
    seenNames.add(nameKey)

    const per100g = sanitizeMacros(row.per100g)
    if (!(per100g.kcal > 0)) continue

    const ingredients = (row.ingredients ?? []).map((l) => l.trim()).filter(Boolean)
    out.push({
      id: menuDishFoodId(row.menuId),
      name,
      aliases: [],
      per100g,
      kind: 'dish',
      recipe: recipeFromSeed(name, per100g, ingredients, row.notes?.trim() || undefined),
    })
  }

  out.sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  return out
}

/**
 * Build dish FoodItems from the weekly-menu catalog seed.
 * Skips ids/names already present (first-time insert only).
 */
export function extractMenuDishCandidates(
  existingFoods: Pick<FoodItem, 'id' | 'name' | 'kind'>[],
): MenuDishCandidate[] {
  const existingIds = new Set(existingFoods.map((f) => f.id))
  const existingNames = new Set(
    existingFoods.map((f) => f.name.trim().toLowerCase().replace(/ё/g, 'е')),
  )
  return buildMenuDishSeedFoods().filter((c) => {
    if (existingIds.has(c.id)) return false
    const nameKey = c.name.trim().toLowerCase().replace(/ё/g, 'е')
    return !existingNames.has(nameKey)
  })
}

export function hasSeededMenuDishes(): boolean {
  if (typeof localStorage === 'undefined') return true
  try {
    return Boolean(localStorage.getItem(SEED_MENU_DISHES_KEY))
  } catch {
    return true
  }
}

export function markSeededMenuDishes(): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(SEED_MENU_DISHES_KEY, '1')
  } catch {
    /* ignore */
  }
}

export function menuDishSeedCount(): number {
  return rows.length
}
