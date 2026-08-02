import { findBestFood } from './foodMatch'
import type { FoodItem, FoodKind, MacroSet, Meal, MealItem } from '../types'

/** Bump when seed logic changes so existing clients re-run once. */
export const SEED_FOODS_FROM_MEALS_KEY = 'planer-seed-foods-from-meals-v3'

export type SeedFoodCandidate = {
  name: string
  per100g: MacroSet
  kind: FoodKind
  /** How many meal lines contributed */
  count: number
}

type Sample = MacroSet & { grams: number }

const SKIP_EXACT = new Set([
  'перекус',
  'запас',
  'капля масла',
])

const SKIP_SUBSTR = [
  'сводка бота',
  'детали в чате',
  'шагов',
  'доброе утро',
  'саша,',
  'салют',
  'понимаю тебя',
  'отлично,',
  'внеси еще',
  'я съела',
  'съела ',
  'добав',
  'внеси',
  'записал вес',
  'по калориям',
  'бывают дни',
  'типа ',
]

/** Map common meal-line variants onto one catalog name. */
export function canonicalizeFoodName(raw: string): string | null {
  let n = raw.trim().replace(/\s+/g, ' ')
  if (!n) return null

  // Drop weight notes in parentheses anywhere: «чипсы (30г)», «гуляш (140г) и …»
  n = n.replace(/\s*\(\d+([.,]\d+)?\s*г(?:р)?[^)]*\)/giu, '').trim()
  // Drop trailing «N мл/г/гр» / «N ккал»
  n = n
    .replace(/\s+\d+([.,]\d+)?\s*(мл|гр?|g|ml)\s*$/iu, '')
    .replace(/\s+\d+([.,]\d+)?\s*ккал\s*$/iu, '')
    .trim()
  // Collapse spaces after removals
  n = n.replace(/\s+/g, ' ').trim()
  if (!n) return null

  const lower = n.toLowerCase().replace(/ё/g, 'е')

  if (SKIP_EXACT.has(lower)) return null
  if (SKIP_SUBSTR.some((s) => lower.includes(s))) return null

  // Compound / chat paste — keep catalog rows single-product
  if (n.length > 60) return null
  if (/[;+]/.test(n)) return null
  if (n.includes(',')) return null
  // «1 карамелька», «2 кусочка шаурмы»
  if (/^\d/.test(n)) return null
  // leftover embedded weights («котлеты 160г сметана») — avoid \b (ASCII-only)
  if (/\d+\s*г(?:р)?(?:\s|$)/iu.test(n)) return null
  if (/\d+\s*мл(?:\s|$)/iu.test(n)) return null
  // Two products glued with «и» — allow «салат из A и B»
  if (/\s+и\s+/iu.test(n) && !/(?:^|\s)из\s+.+\s+и\s+/iu.test(n)) return null

  // Egg variants → Яйцо
  if (/^яйц/i.test(lower) && lower.length <= 24) return 'Яйцо'
  if (/^огурц/i.test(lower) && lower.length <= 18) return 'Огурец'
  if (/^(помидор|томат)/i.test(lower) && lower.length <= 20) return 'Помидор'
  if (/^кофе\s+с\s+молоком/i.test(lower) && lower.length <= 28) return 'Кофе с молоком'
  if (/^хлеб(\s|$)/i.test(lower) && lower.length <= 28) return 'Хлеб'
  if (/^батон(\s|$)/i.test(lower) && !/городск/i.test(lower) && lower.length <= 20) {
    return 'Хлеб'
  }
  if (/^чипсы/i.test(lower) && lower.length <= 36) return 'Чипсы'
  if (/^шоколад/i.test(lower) && lower.length <= 28) return 'Шоколад'
  if (/^конфет/i.test(lower) && lower.length <= 28) return 'Конфеты'
  if (/^кап+уч/i.test(lower) && lower.length <= 36) return 'Капучино'
  if (/^айс\s*лат/i.test(lower) && lower.length <= 24) return 'Айс латте'
  if (/^улитка\s+с\s+маком/i.test(lower)) return 'Улитка с маком'
  if (/пармезан/i.test(lower) && lower.length <= 24) return 'Сыр Пармезан'
  if (/^сырок|^творожный сырок/i.test(lower)) return n.charAt(0).toUpperCase() + n.slice(1)
  if (/^сыр(\s|$)/i.test(lower) && !/творож|плавл|пармез/i.test(lower) && lower.length <= 16) {
    return 'Сыр'
  }
  if (/^мандарин/i.test(lower)) return 'Мандарин'
  if (/^яблок/i.test(lower)) return 'Яблоко'
  if (/^банан/i.test(lower) && lower.length <= 20) return 'Банан'
  if (/^манго/i.test(lower) && lower.length <= 16) return 'Манго'
  if (/^дыня/i.test(lower)) return 'Дыня'
  if (/^арбуз/i.test(lower)) return 'Арбуз'
  if (/^фисташк/i.test(lower)) return 'Фисташки'
  if (/^картофель\s*фри|^картошка\s*фри/i.test(lower)) return 'Картофель фри'
  if (/^мортаделл/i.test(lower)) return 'Мортаделла'
  if (/^багет/i.test(lower) && lower.length <= 28) return 'Багет'
  if (/^медовик/i.test(lower)) return 'Медовик'
  if (/^вино\s+сухое\s+белое/i.test(lower)) return 'Вино сухое белое'

  return n.charAt(0).toUpperCase() + n.slice(1)
}

/**
 * Telegram imports often store portion kcal with grams=100 while the real
 * portion is in the name: «чипсы (30г)» / «творог … 120г».
 */
export function resolvePortionGrams(item: Pick<MealItem, 'name' | 'grams'>): number {
  const g = item.grams
  if (!(g > 0) || !Number.isFinite(g)) return 0
  if (g !== 100) return g

  const name = item.name.trim()
  const paren = name.match(/\((\d+)\s*г(?:р)?[^)]*\)\s*$/iu)
  if (paren) {
    const n = Number(paren[1])
    if (n > 0 && n !== 100) return n
  }
  const trailing = name.match(/\s(\d+)\s*г(?:р)?\s*$/iu)
  if (trailing) {
    const n = Number(trailing[1])
    if (n > 0 && n !== 100) return n
  }
  return g
}

function isUsableItem(item: MealItem): boolean {
  if (!item.name?.trim()) return false
  const grams = resolvePortionGrams(item)
  if (!(grams > 0) || !Number.isFinite(grams)) return false
  if (!(item.kcal >= 0) || !Number.isFinite(item.kcal)) return false
  const macrosZero =
    (item.protein ?? 0) === 0 && (item.fat ?? 0) === 0 && (item.carbs ?? 0) === 0
  // Bot kcal-only junk
  if (macrosZero && item.kcal > 0 && item.name.length > 40) return false
  if (macrosZero && item.kcal > 400) return false
  return true
}

function per100FromItem(item: MealItem): MacroSet | null {
  const g = resolvePortionGrams(item)
  if (!(g > 0)) return null
  const scale = 100 / g
  const per = {
    kcal: round1(item.kcal * scale),
    protein: round1(item.protein * scale),
    fat: round1(item.fat * scale),
    carbs: round1(item.carbs * scale),
  }
  if (per.kcal > 950 || per.kcal < 5) return null
  if (per.protein > 100 || per.fat > 100 || per.carbs > 120) return null
  return per
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function median(nums: number[]): number {
  if (!nums.length) return 0
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2
}

function medianMacros(samples: Sample[]): MacroSet {
  return {
    kcal: round1(median(samples.map((s) => s.kcal))),
    protein: round1(median(samples.map((s) => s.protein))),
    fat: round1(median(samples.map((s) => s.fat))),
    carbs: round1(median(samples.map((s) => s.carbs))),
  }
}

function bucketKey(name: string): string {
  return name.toLowerCase().replace(/ё/g, 'е')
}

/**
 * Build personal catalog candidates from meal history.
 * Skips compounds / bot noise; merges variants; omits foods already in the library.
 */
export function extractFoodsFromMeals(
  meals: Meal[],
  existingFoods: Pick<FoodItem, 'id' | 'name' | 'aliases' | 'kind' | 'per100g'>[],
  opts?: { minCount?: number },
): SeedFoodCandidate[] {
  // Personal catalog: even a single clear logging is useful.
  const minCount = opts?.minCount ?? 1
  const buckets = new Map<string, { name: string; samples: Sample[] }>()
  const bucketRefs: { id: string; name: string; aliases: string[]; kind: FoodKind; per100g: MacroSet }[] =
    []

  const mergeIntoBucket = (name: string, sample: Sample) => {
    // Prefer merging into an existing candidate bucket
    const hitBucket = findBestFood(name, bucketRefs, 78)
    const key = hitBucket ? bucketKey(hitBucket.name) : bucketKey(name)
    let bucket = buckets.get(key)
    if (!bucket) {
      bucket = { name, samples: [] }
      buckets.set(key, bucket)
      bucketRefs.push({
        id: key,
        name,
        aliases: [],
        kind: 'ingredient',
        per100g: sample,
      })
    }
    bucket.samples.push(sample)
  }

  for (const meal of meals) {
    for (const item of meal.items ?? []) {
      if (!isUsableItem(item)) continue
      if (item.foodId && existingFoods.some((f) => f.id === item.foodId)) continue

      const name = canonicalizeFoodName(item.name)
      if (!name) continue

      const per = per100FromItem(item)
      if (!per) continue

      const hit = findBestFood(name, existingFoods, 70)
      if (hit) continue

      mergeIntoBucket(name, { ...per, grams: resolvePortionGrams(item) })
    }
  }

  const out: SeedFoodCandidate[] = []
  for (const { name, samples } of buckets.values()) {
    if (samples.length < minCount) continue
    out.push({
      name,
      per100g: medianMacros(samples),
      kind: 'ingredient',
      count: samples.length,
    })
  }

  out.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ru'))
  return out
}

/** localStorage flag — seed once per browser profile (per key version). */
export function hasSeededFoodsFromMeals(): boolean {
  if (typeof localStorage === 'undefined') return true
  try {
    return Boolean(localStorage.getItem(SEED_FOODS_FROM_MEALS_KEY))
  } catch {
    return true
  }
}

export function markSeededFoodsFromMeals(): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(SEED_FOODS_FROM_MEALS_KEY, '1')
  } catch {
    /* ignore */
  }
}
