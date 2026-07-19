import type { FoodItem } from '../types'

const STOP = new Set(['для', 'без', 'про', 'или', 'со', 'на'])

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokens(s: string): string[] {
  return normalize(s)
    .split(' ')
    .filter((t) => t.length >= 3 && !STOP.has(t) && !/^\d/.test(t))
}

function labelsOf(food: FoodItem): string[] {
  return [food.name, ...food.aliases].map(normalize).filter(Boolean)
}

/** Same product family: «творожный сыр» ↔ «творожный сыр 5%», not «форель». */
export function isRelatedFood(a: FoodItem, b: FoodItem): boolean {
  if (a.id === b.id) return true
  const labelsA = labelsOf(a)
  const labelsB = labelsOf(b)

  for (const la of labelsA) {
    for (const lb of labelsB) {
      if (la.length >= 4 && lb.length >= 4 && (la.includes(lb) || lb.includes(la))) {
        return true
      }
      const ta = tokens(la)
      const tb = tokens(lb)
      const shared = ta.filter((t) => tb.includes(t))
      if (shared.length >= 2) return true
      if (shared.length === 1) {
        const t = shared[0]
        // One strong word is enough for short names like «молоко» / «молоко 2.5%»
        if (t.length >= 5 && (ta.length <= 2 || tb.length <= 2)) return true
      }
    }
  }
  return false
}

/** Current food + siblings only. Empty if no real alternatives. */
export function foodVariants(current: FoodItem, all: FoodItem[]): FoodItem[] {
  const related = all.filter((f) => isRelatedFood(current, f))
  if (related.length < 2) return []
  return related.sort((a, b) => a.name.localeCompare(b.name, 'ru'))
}
