import { generateAliases } from './foodAliases'
import type { FoodItem, MacroSet } from '../types'

/** Bump when the default spice set changes. */
export const SEED_SPICE_PRODUCTS_KEY = 'planer-seed-spice-products-v1'
export const SPICE_PRODUCTS_SEED_VERSION = 1

export const SEED_SPICE_IDS = [
  'seed-spice-salt',
  'seed-spice-oregano',
  'seed-spice-bay-leaf',
  'seed-spice-paprika-sweet',
  'seed-spice-basil',
] as const

type SpiceSeed = {
  id: (typeof SEED_SPICE_IDS)[number]
  name: string
  category: 'spices'
  per100g: MacroSet
}

/** Per 100 g — типичные сухие специи (USDA / этикетки). */
const SPICE_CATALOG: SpiceSeed[] = [
  {
    id: 'seed-spice-salt',
    name: 'Соль',
    category: 'spices',
    per100g: { kcal: 0, protein: 0, fat: 0, carbs: 0 },
  },
  {
    id: 'seed-spice-oregano',
    name: 'Орегано',
    category: 'spices',
    per100g: { kcal: 265, protein: 9, fat: 4.3, carbs: 68.9 },
  },
  {
    id: 'seed-spice-bay-leaf',
    name: 'Лавровый лист',
    category: 'spices',
    per100g: { kcal: 313, protein: 7.6, fat: 8.4, carbs: 74.9 },
  },
  {
    id: 'seed-spice-paprika-sweet',
    name: 'Паприка сладкая',
    category: 'spices',
    per100g: { kcal: 282, protein: 14.1, fat: 12.9, carbs: 53.7 },
  },
  {
    id: 'seed-spice-basil',
    name: 'Базилик',
    category: 'spices',
    per100g: { kcal: 233, protein: 23, fat: 4.1, carbs: 47.8 },
  },
]

export function buildSeedSpiceProducts(now = Date.now()): FoodItem[] {
  return SPICE_CATALOG.map((s) => ({
    id: s.id,
    name: s.name,
    aliases: generateAliases(s.name),
    per100g: s.per100g,
    kind: 'ingredient' as const,
    category: s.category,
    updatedAt: now,
  }))
}

function normName(s: string): string {
  return s.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim()
}

/** Add missing seed spices; never overwrite existing products by name. */
export function mergeSeedSpiceProducts(foods: FoodItem[], now = Date.now()): {
  foods: FoodItem[]
  added: FoodItem[]
} {
  const names = new Set(foods.map((f) => normName(f.name)))
  const added = buildSeedSpiceProducts(now).filter((s) => !names.has(normName(s.name)))
  if (added.length === 0) return { foods, added: [] }
  return { foods: [...foods, ...added], added }
}

export function hasSeededSpiceProducts(): boolean {
  try {
    return localStorage.getItem(SEED_SPICE_PRODUCTS_KEY) === String(SPICE_PRODUCTS_SEED_VERSION)
  } catch {
    return false
  }
}

export function markSeededSpiceProducts(): void {
  try {
    localStorage.setItem(SEED_SPICE_PRODUCTS_KEY, String(SPICE_PRODUCTS_SEED_VERSION))
  } catch {
    /* ignore */
  }
}
