import type { Meal, MealItem, WeightEntry } from '../types'

export type TelegramImportBundle = {
  meals?: unknown[]
  weights?: unknown[]
  /** When true, wipe local meals on dates present in the bundle before insert. */
  replaceByDate?: boolean
}

function asNum(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

function cleanItem(raw: unknown): MealItem | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const name = String(o.name ?? '').trim()
  const grams = asNum(o.grams)
  const kcal = asNum(o.kcal)
  const protein = asNum(o.protein) ?? 0
  const fat = asNum(o.fat) ?? 0
  const carbs = asNum(o.carbs) ?? 0
  if (!name || grams == null || !(grams > 0) || kcal == null || !(kcal >= 0)) return null
  return {
    name,
    grams,
    kcal,
    protein: Math.max(0, protein),
    fat: Math.max(0, fat),
    carbs: Math.max(0, carbs),
    source: o.source === 'library' ? 'library' : 'estimate',
  }
}

function cleanMeal(raw: unknown): Meal | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const date = String(o.date ?? '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const mealType = o.mealType
  if (
    mealType !== 'breakfast' &&
    mealType !== 'lunch' &&
    mealType !== 'dinner' &&
    mealType !== 'snack'
  ) {
    return null
  }
  const items = Array.isArray(o.items)
    ? o.items.map(cleanItem).filter((x): x is MealItem => x != null)
    : []
  if (items.length === 0) return null
  const totals = {
    kcal: items.reduce((s, i) => s + i.kcal, 0),
    protein: items.reduce((s, i) => s + i.protein, 0),
    fat: items.reduce((s, i) => s + i.fat, 0),
    carbs: items.reduce((s, i) => s + i.carbs, 0),
  }
  return {
    id: typeof o.id === 'string' && o.id ? o.id : crypto.randomUUID(),
    date,
    mealType,
    rawText: String(o.rawText ?? items.map((i) => i.name).join(', ')),
    items,
    totals,
    isApproximate: Boolean(o.isApproximate ?? true),
    eatingOut: Boolean(o.eatingOut),
    createdAt: asNum(o.createdAt) ?? Date.now(),
  }
}

function cleanWeight(raw: unknown): WeightEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const date = String(o.date ?? '')
  const kg = asNum(o.kg)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || kg == null || kg < 30 || kg > 400) return null
  return {
    id: typeof o.id === 'string' && o.id ? o.id : crypto.randomUUID(),
    date,
    kg: Math.round(kg * 10) / 10,
    createdAt: asNum(o.createdAt) ?? Date.now(),
  }
}

export function parseTelegramImportBundle(raw: unknown): {
  meals: Meal[]
  weights: WeightEntry[]
  replaceByDate: boolean
} {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Некорректный файл импорта')
  }
  const b = raw as TelegramImportBundle
  const meals = (Array.isArray(b.meals) ? b.meals : [])
    .map(cleanMeal)
    .filter((m): m is Meal => m != null)
  const weights = (Array.isArray(b.weights) ? b.weights : [])
    .map(cleanWeight)
    .filter((w): w is WeightEntry => w != null)
  if (meals.length === 0 && weights.length === 0) {
    throw new Error('В файле нет приёмов и веса')
  }
  return { meals, weights, replaceByDate: Boolean(b.replaceByDate) }
}
