import type { FoodRef } from '../types'

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
    .filter((t) => t.length >= 2 && !/^\d/.test(t))
}

/**
 * Score how well a query matches a food.
 * Short words like «паста» must NOT match a long dish «паста с кабачком и курицей».
 */
export function scoreFoodMatch(query: string, food: FoodRef): number {
  const q = normalize(query)
  if (!q) return 0
  const labels = [food.name, ...food.aliases].map(normalize)
  let best = 0

  for (const n of labels) {
    if (!n) continue
    if (q === n) {
      best = Math.max(best, 100)
      continue
    }

    const qTok = tokens(q)
    const nTok = tokens(n)

    // Query covers (almost) all words of the food name
    if (nTok.length >= 2) {
      const covered = nTok.filter((t) => qTok.includes(t) || q.includes(t)).length
      const ratio = covered / nTok.length
      if (ratio >= 0.8 && covered >= 2) {
        best = Math.max(best, 88 + Math.min(covered, 8))
        continue
      }
      // Dish names: short substring of one word is weak
      if (food.kind === 'dish' && qTok.length === 1 && nTok.length >= 3) {
        best = Math.max(best, 15)
        continue
      }
    }

    // Food name is contained in query (typed full-ish name)
    if (q.includes(n) && n.length >= 6) {
      best = Math.max(best, 92)
      continue
    }

    // Query contained in food — only if query is long enough or food is short
    if (n.includes(q)) {
      if (qTok.length >= 3 || q.length >= 12) best = Math.max(best, 85)
      else if (nTok.length <= 2 && q.length >= 4) best = Math.max(best, 75)
      else best = Math.max(best, 25)
      continue
    }

    const overlap = nTok.filter((t) => t.length > 2 && qTok.includes(t)).length
    if (overlap >= 2) best = Math.max(best, 50 + overlap * 10)
    else if (overlap === 1 && nTok.length <= 2) best = Math.max(best, 45)
  }

  // Prefer dishes when score is high and names are long
  if (food.kind === 'dish' && best >= 80) best += 5

  return best
}

export function findBestFood(
  name: string,
  foods: FoodRef[],
  minScore = 55,
): FoodRef | null {
  let best: FoodRef | null = null
  let bestScore = 0
  let bestLen = 0

  for (const food of foods) {
    const score = scoreFoodMatch(name, food)
    const len = food.name.length
    if (score > bestScore || (score === bestScore && score >= minScore && len > bestLen)) {
      bestScore = score
      best = food
      bestLen = len
    }
  }

  return bestScore >= minScore ? best : null
}
