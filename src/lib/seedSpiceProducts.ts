import type { FoodCategoryId } from './foodCategory'
import { generateAliases } from './foodAliases'
import type { FoodItem, MacroSet } from '../types'

/** Bump when the default catalog set changes. */
export const SEED_SPICE_PRODUCTS_KEY = 'planer-seed-spice-products-v1'
export const SPICE_PRODUCTS_SEED_VERSION = 2

type CatalogSeed = {
  id: string
  name: string
  category: FoodCategoryId
  per100g: MacroSet
}

/** Per 100 g — базовые продукты для рецептов (специи, овощи, соусы…). */
const CATALOG: CatalogSeed[] = [
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
  {
    id: 'seed-food-beef-broth',
    name: 'Бульон говяжий',
    category: 'ready',
    per100g: { kcal: 15, protein: 1.2, fat: 0.5, carbs: 1.5 },
  },
  {
    id: 'seed-spice-curry-mild',
    name: 'Карри порошок мягкий',
    category: 'spices',
    per100g: { kcal: 325, protein: 14.3, fat: 14, carbs: 58 },
  },
  {
    id: 'seed-food-red-wine-dry',
    name: 'Красное сухое вино',
    category: 'drinks',
    per100g: { kcal: 85, protein: 0.1, fat: 0, carbs: 2.6 },
  },
  {
    id: 'seed-food-red-onion',
    name: 'Лук фиолетовый',
    category: 'vegetables',
    per100g: { kcal: 40, protein: 1.1, fat: 0.1, carbs: 9.3 },
  },
  {
    id: 'seed-food-leek',
    name: 'Лук-порей',
    category: 'vegetables',
    per100g: { kcal: 61, protein: 1.5, fat: 0.3, carbs: 14.2 },
  },
  {
    id: 'seed-food-mayo-light',
    name: 'Майонез лёгкий',
    category: 'oils',
    per100g: { kcal: 260, protein: 0.8, fat: 26, carbs: 5 },
  },
  {
    id: 'seed-food-crushed-tomatoes',
    name: 'Перетёртые томаты',
    category: 'vegetables',
    per100g: { kcal: 32, protein: 1.6, fat: 0.3, carbs: 5.1 },
  },
  {
    id: 'seed-spice-black-pepper',
    name: 'Перец чёрный молотый',
    category: 'spices',
    per100g: { kcal: 251, protein: 10.4, fat: 3.3, carbs: 64 },
  },
  {
    id: 'seed-spice-white-pepper',
    name: 'Перец белый молотый',
    category: 'spices',
    per100g: { kcal: 296, protein: 10.4, fat: 2.1, carbs: 68.6 },
  },
  {
    id: 'seed-spice-herbes-de-provence',
    name: 'Прованские травы',
    category: 'spices',
    per100g: { kcal: 259, protein: 9, fat: 7.5, carbs: 50 },
  },
  {
    id: 'seed-spice-rosemary-fresh',
    name: 'Розмарин свежий',
    category: 'spices',
    per100g: { kcal: 131, protein: 3.3, fat: 5.9, carbs: 20.7 },
  },
  {
    id: 'seed-spice-thyme-fresh',
    name: 'Тимьян свежий',
    category: 'spices',
    per100g: { kcal: 101, protein: 5.6, fat: 1.7, carbs: 24.5 },
  },
  {
    id: 'seed-food-leaf-lettuce',
    name: 'Салат листовой',
    category: 'vegetables',
    per100g: { kcal: 15, protein: 1.4, fat: 0.2, carbs: 2.9 },
  },
  {
    id: 'seed-food-spinach',
    name: 'Шпинат',
    category: 'vegetables',
    per100g: { kcal: 23, protein: 2.9, fat: 0.4, carbs: 3.6 },
  },
  {
    id: 'seed-food-dijon-mustard',
    name: 'Горчица дижонская',
    category: 'oils',
    per100g: { kcal: 143, protein: 8.4, fat: 10, carbs: 5.3 },
  },
  {
    id: 'seed-food-cherry-tomatoes',
    name: 'Помидоры черри',
    category: 'vegetables',
    per100g: { kcal: 18, protein: 0.9, fat: 0.2, carbs: 3.9 },
  },
  {
    id: 'seed-food-green-onion',
    name: 'Зелёный лук',
    category: 'vegetables',
    per100g: { kcal: 32, protein: 1.8, fat: 0.2, carbs: 7.3 },
  },
]

export function buildSeedSpiceProducts(now = Date.now()): FoodItem[] {
  return CATALOG.map((s) => ({
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

/** Add missing seed products; never overwrite existing products by name. */
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
