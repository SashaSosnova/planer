import type { FoodRef } from '../types'

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const UNIT_TOKENS = new Set([
  'гр',
  'г',
  'грамм',
  'грамма',
  'граммов',
  'мл',
  'ml',
  'g',
  'кг',
  'kg',
])

function tokens(s: string): string[] {
  return normalize(s)
    .split(' ')
    .filter((t) => t.length >= 2 && !/^\d/.test(t) && !UNIT_TOKENS.has(t))
}

/** Russian case variants: овсянка/овсянки, творог/творога — not творог/творожный. */
function sameLexeme(a: string, b: string): boolean {
  if (a === b) return true
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a]
  if (shorter.length < 4) return false

  if (longer.startsWith(shorter)) {
    const suffix = longer.slice(shorter.length)
    return suffix.length <= 3 && /^[аеиоуыэюяьй]*$/u.test(suffix)
  }

  let i = 0
  while (i < shorter.length && a[i] === b[i]) i++
  if (i < 4) return false
  const endA = a.slice(i)
  const endB = b.slice(i)
  return (
    endA.length <= 3 &&
    endB.length <= 3 &&
    /^[аеиоуыэюяьй]*$/u.test(endA) &&
    /^[аеиоуыэюяьй]*$/u.test(endB)
  )
}

function tokenOverlap(qTok: string[], nTok: string[]): number {
  return nTok.filter(
    (t) => t.length > 2 && qTok.some((qt) => qt === t || sameLexeme(qt, t)),
  ).length
}

/**
 * Score how well a query matches a food.
 * Short words like «паста» must NOT match a long dish «паста с кабачком и курицей».
 */
export function scoreFoodMatch(query: string, food: FoodRef): number {
  const q = normalize(query)
  if (!q) return 0
  const foodName = normalize(food.name)
  const labels = [food.name, ...food.aliases].map(normalize)
  let best = 0
  let bestLabel = ''

  for (const n of labels) {
    if (!n) continue
    let score = 0

    if (q === n) {
      // Exact canonical name beats a short alias hit on a long dish title
      score = n === foodName ? 100 : 94
    } else {
      const qTok = tokens(q)
      const nTok = tokens(n)

      // Query covers (almost) all words of the food name
      if (nTok.length >= 2) {
        const covered = nTok.filter(
          (t) => qTok.some((qt) => qt === t || sameLexeme(qt, t)) || q.includes(t),
        ).length
        const ratio = covered / nTok.length
        if (ratio >= 0.8 && covered >= 2) {
          score = 88 + Math.min(covered, 8)
        } else if (food.kind === 'dish' && qTok.length === 1 && nTok.length >= 3) {
          score = 15
        }
      }

      if (!score) {
        // Food name/alias contained in query — but not a multi-word phrase partial («кофе с молоком» ⊃ молоко)
        if (q.includes(n) && n.length >= 6) {
          if (qTok.length >= 2 && nTok.length <= 1) {
            score = 40
          } else {
            score = 92
          }
        } else if (n.includes(q)) {
          if (qTok.length >= 3 || q.length >= 12) score = 85
          else if (nTok.length <= 2 && q.length >= 4) score = 75
          else score = 25
        } else {
          // Case inflection: «овсянки» ↔ «овсянка»
          if (qTok.length === 1 && nTok.length === 1 && sameLexeme(qTok[0]!, nTok[0]!)) {
            score = 90
          } else {
            const overlap = tokenOverlap(qTok, nTok)
            if (overlap >= 2) score = 50 + overlap * 10
            else if (overlap === 1 && nTok.length <= 2) score = 45
          }
        }
      }
    }

    if (score > best) {
      best = score
      bestLabel = n
    }
  }

  // Dish bonus only when the query looks like the full dish, not a short alias
  if (food.kind === 'dish' && best >= 80 && bestLabel.length >= foodName.length * 0.5) {
    best += 5
  }

  return best
}

export function findBestFood(
  name: string,
  foods: FoodRef[],
  minScore = 55,
): FoodRef | null {
  let best: FoodRef | null = null
  let bestScore = 0
  let bestLen = Infinity

  for (const food of foods) {
    const score = scoreFoodMatch(name, food)
    const len = food.name.length
    // On ties prefer the shorter label («творог» over «творожный сыр» with alias творог)
    if (score > bestScore || (score === bestScore && score >= minScore && len < bestLen)) {
      bestScore = score
      best = food
      bestLen = len
    }
  }

  return bestScore >= minScore ? best : null
}
