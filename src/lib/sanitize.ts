import { coerceMealType } from './labels'
import { round1, sumMacros } from './nutrition'
import type {
  AppData,
  DayCheckIn,
  FoodItem,
  MacroSet,
  Meal,
  MealItem,
  MeasurementEntry,
  MoodLevel,
  PeriodStart,
  StepsEntry,
  WeightEntry,
} from '../types'

/** Finite number ≥ 0, otherwise fallback. */
export function nonNeg(n: unknown, fallback = 0): number {
  const v = typeof n === 'number' ? n : Number(n)
  if (!Number.isFinite(v) || v < 0) return fallback
  return v
}

export function sanitizeMacros(input: Partial<MacroSet> | null | undefined): MacroSet {
  return {
    kcal: round1(nonNeg(input?.kcal)),
    protein: round1(nonNeg(input?.protein)),
    fat: round1(nonNeg(input?.fat)),
    carbs: round1(nonNeg(input?.carbs)),
  }
}

export function sanitizeMealItem(raw: unknown): MealItem | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Record<string, unknown>
  const name = String(item.name ?? '').trim()
  if (!name) return null
  const grams = nonNeg(item.grams, 0)
  if (!(grams > 0)) return null
  const source = item.source === 'library' ? 'library' : 'estimate'
  return {
    name,
    grams: round1(grams),
    foodId: typeof item.foodId === 'string' && item.foodId ? item.foodId : undefined,
    ...sanitizeMacros({
      kcal: item.kcal as number,
      protein: item.protein as number,
      fat: item.fat as number,
      carbs: item.carbs as number,
    }),
    source,
  }
}

export function sanitizeMealItems(raw: unknown): MealItem[] {
  if (!Array.isArray(raw)) return []
  return raw.map(sanitizeMealItem).filter((i): i is MealItem => i != null)
}

/** Recompute totals from sanitized items (ignores stored totals). */
export function totalsFromItems(items: MealItem[]): MacroSet {
  return sumMacros(items)
}

export function assertNonNegMacros(m: MacroSet, label = 'КБЖУ'): void {
  if (
    !(m.kcal >= 0) ||
    !(m.protein >= 0) ||
    !(m.fat >= 0) ||
    !(m.carbs >= 0) ||
    !Number.isFinite(m.kcal) ||
    !Number.isFinite(m.protein) ||
    !Number.isFinite(m.fat) ||
    !Number.isFinite(m.carbs)
  ) {
    throw new Error(`${label}: значения не могут быть отрицательными`)
  }
}

export function sanitizeFood(raw: unknown): FoodItem | null {
  if (!raw || typeof raw !== 'object') return null
  const f = raw as Record<string, unknown>
  const name = String(f.name ?? '').trim()
  const id = String(f.id ?? '')
  if (!name || !id) return null
  return {
    id,
    name,
    aliases: Array.isArray(f.aliases) ? (f.aliases as string[]).map(String) : [],
    per100g: sanitizeMacros(f.per100g as FoodItem['per100g']),
    kind: f.kind === 'dish' ? 'dish' : 'ingredient',
    recipe: f.recipe as FoodItem['recipe'],
    updatedAt: Number(f.updatedAt) || Date.now(),
  }
}

export function sanitizeMeal(raw: unknown): Meal | null {
  if (!raw || typeof raw !== 'object') return null
  const m = raw as Record<string, unknown>
  const id = String(m.id ?? '')
  const date = String(m.date ?? '')
  if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const items = sanitizeMealItems(m.items)
  return {
    id,
    date,
    mealType: coerceMealType(m.mealType),
    rawText: String(m.rawText ?? ''),
    items,
    totals: items.length ? totalsFromItems(items) : sanitizeMacros(m.totals as Meal['totals']),
    isApproximate: Boolean(m.isApproximate),
    eatingOut: Boolean(m.eatingOut),
    createdAt: Number(m.createdAt) || Date.now(),
  }
}

export function sanitizeWeight(raw: unknown): WeightEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const w = raw as Record<string, unknown>
  const id = String(w.id ?? '')
  const date = String(w.date ?? '')
  const kg = nonNeg(w.kg)
  if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !(kg >= 30 && kg <= 400)) return null
  return { id, date, kg: round1(kg), createdAt: Number(w.createdAt) || Date.now() }
}

export function sanitizeSteps(raw: unknown): StepsEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const s = raw as Record<string, unknown>
  const id = String(s.id ?? '')
  const date = String(s.date ?? '')
  if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  return {
    id,
    date,
    count: Math.round(nonNeg(s.count)),
    createdAt: Number(s.createdAt) || Date.now(),
  }
}

export function sanitizeMeasurement(raw: unknown): MeasurementEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const m = raw as Record<string, unknown>
  const id = String(m.id ?? '')
  const date = String(m.date ?? '')
  if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const opt = (v: unknown) => (v != null && Number.isFinite(Number(v)) ? nonNeg(v) : undefined)
  const entry: MeasurementEntry = {
    id,
    date,
    chest: opt(m.chest),
    waist: opt(m.waist),
    belly: opt(m.belly),
    hips: opt(m.hips),
    thigh: opt(m.thigh),
    bicep: opt(m.bicep ?? m.arm),
    createdAt: Number(m.createdAt) || Date.now(),
  }
  const hasAny =
    entry.chest != null ||
    entry.waist != null ||
    entry.belly != null ||
    entry.hips != null ||
    entry.thigh != null ||
    entry.bicep != null
  return hasAny ? entry : null
}

export function sanitizeCheckIn(raw: unknown): DayCheckIn | null {
  if (!raw || typeof raw !== 'object') return null
  const c = raw as Record<string, unknown>
  const id = String(c.id ?? '')
  const date = String(c.date ?? '')
  if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  let mood: MoodLevel | undefined
  const moodN = Number(c.mood)
  if (moodN === 1 || moodN === 2 || moodN === 3 || moodN === 4 || moodN === 5) {
    mood = moodN
  }
  let sleepHours: number | undefined
  if (c.sleepHours != null) {
    const h = Number(c.sleepHours)
    if (Number.isFinite(h) && h >= 0 && h <= 16) sleepHours = Math.round(h * 2) / 2
  }
  if (mood == null && sleepHours == null) return null
  return {
    id,
    date,
    ...(mood != null ? { mood } : {}),
    ...(sleepHours != null ? { sleepHours } : {}),
    createdAt: Number(c.createdAt) || Date.now(),
  }
}

export function sanitizePeriodStart(raw: unknown): PeriodStart | null {
  if (!raw || typeof raw !== 'object') return null
  const p = raw as Record<string, unknown>
  const id = String(p.id ?? '')
  const date = String(p.date ?? '')
  if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  return { id, date, createdAt: Number(p.createdAt) || Date.now() }
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

/** Normalize legacy / corrupt payloads before they hit UI stats. */
export function sanitizeAppData(parsed: Partial<AppData> | null | undefined): AppData {
  if (!parsed || typeof parsed !== 'object') {
    return {
      foods: [],
      meals: [],
      weights: [],
      measurements: [],
      steps: [],
      checkIns: [],
      periodStarts: [],
    }
  }
  return {
    foods: asArray(parsed.foods).map(sanitizeFood).filter((f): f is FoodItem => f != null),
    meals: asArray(parsed.meals).map(sanitizeMeal).filter((m): m is Meal => m != null),
    weights: asArray(parsed.weights).map(sanitizeWeight).filter((w): w is WeightEntry => w != null),
    measurements: asArray(parsed.measurements)
      .map(sanitizeMeasurement)
      .filter((m): m is MeasurementEntry => m != null),
    steps: asArray(parsed.steps).map(sanitizeSteps).filter((s): s is StepsEntry => s != null),
    checkIns: asArray(parsed.checkIns)
      .map(sanitizeCheckIn)
      .filter((c): c is DayCheckIn => c != null),
    periodStarts: asArray(parsed.periodStarts)
      .map(sanitizePeriodStart)
      .filter((p): p is PeriodStart => p != null),
  }
}
