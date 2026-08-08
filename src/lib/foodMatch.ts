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

/** Tokens on A not covered by B (lexeme-aware). */
function leftoverTokens(aTok: string[], bTok: string[]): string[] {
  return aTok.filter((t) => !bTok.some((bt) => bt === t || sameLexeme(bt, t)))
}

/**
 * «куриное филе гриль» vs «куриное филе бедра сырое» — shared stem, but each
 * side has exclusive tokens → different products. Cap fuzzy overlap.
 */
function hasConflictingExtraTokens(qTok: string[], nTok: string[]): boolean {
  if (qTok.length < 2 || nTok.length < 2) return false
  return leftoverTokens(qTok, nTok).length > 0 && leftoverTokens(nTok, qTok).length > 0
}

/** Query appears as a real word in the food label, not a stem inside a longer word. */
function queryMatchesAsToken(q: string, qTok: string[], nTok: string[]): boolean {
  if (nTok.some((t) => t === q || sameLexeme(t, q))) return true
  if (qTok.length !== 1) {
    return qTok.every((qt) => nTok.some((t) => t === qt || sameLexeme(t, qt)))
  }
  return false
}

/**
 * Related but different words sharing a stem: «творог» vs «творожный»,
 * «сыр» vs «сырники», «рис» vs «рисовая».
 */
function isPrefixFalseFriend(query: string, foodName: string): boolean {
  const q = normalize(query)
  if (q.length < 3) return false
  return tokens(foodName).some((t) => {
    if (t === q || sameLexeme(t, q)) return false
    if (t.startsWith(q) && t.length >= q.length + 2) return true
    let i = 0
    while (i < q.length && i < t.length && q[i] === t[i]) i++
    // Shared stem but different word: «курица»/«куриный», «творог»/«творожный»
    return i >= Math.min(4, q.length) && t.length > q.length
  })
}

/** Alias is only one word of a compound label («паста» on «Паста с …»). */
function isPartialCompoundAlias(query: string, foodName: string): boolean {
  const qTok = tokens(query)
  const nameTok = tokens(foodName)
  if (qTok.length !== 1 || nameTok.length < 2) return false
  const q = qTok[0]!
  return nameTok.some((t) => t === q || sameLexeme(t, q))
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
      // Exact canonical name beats a short alias hit on a long dish title.
      if (n === foodName) {
        score = 100
      } else if (isPrefixFalseFriend(q, foodName)) {
        // «творог» / «сыр» poisoned onto a related longer product
        score = 0
      } else if (isPartialCompoundAlias(q, foodName)) {
        const foodHead = tokens(foodName)[0]
        const qHead = tokens(q)[0]
        // Alias is the head lexeme of a short ingredient variant:
        // «творог» on «Творог мягкий 5%» — candidate for disambiguation.
        if (
          food.kind !== 'dish' &&
          tokens(foodName).length <= 3 &&
          foodHead &&
          qHead &&
          (foodHead === qHead || sameLexeme(foodHead, qHead))
        ) {
          score = 72
        } else {
          // «паста» alias on «Паста с кабачком…», «кофе» on «Кофе с молоком»
          score = food.kind === 'dish' ? 30 : 45
        }
      } else {
        score = 94
      }
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
        const foodTok = tokens(foodName)
        // Alias/stem is only a fragment of a longer dish/product name.
        const aliasIsFragment =
          n !== foodName && foodTok.length >= 2 && (nTok.length <= 1 || n.length + 4 < foodName.length)

        // Food name/alias contained in query — but not a multi-word phrase partial («кофе с молоком» ⊃ молоко)
        if (q.includes(n) && n.length >= 6) {
          if (aliasIsFragment) {
            // «говядин» ⊂ «говядина» must not score as «Тушеная картошка с говядиной»
            score = food.kind === 'dish' || foodTok.length >= 3 ? 25 : 40
          } else if (qTok.length >= 2 && nTok.length <= 1) {
            score = 40
          } else {
            score = 92
          }
        } else if (n.includes(q) && queryMatchesAsToken(q, qTok, nTok)) {
          // Whole-token containment — but one word of a compound is weak
          // («кофе» ⊂ «кофе с молоком»).
          if (qTok.length === 1 && (nTok.length >= 2 || foodTok.length >= 2)) {
            const qHead = qTok[0]!
            const foodHead = foodTok[0]
            // Head-token variants: «творог» ⊂ «Творог мягкий 5%» — strong enough
            // for disambiguation, not for silent auto-pick when several exist.
            const isHeadStem =
              foodHead != null && (foodHead === qHead || sameLexeme(foodHead, qHead))
            if (isHeadStem && food.kind !== 'dish' && foodTok.length <= 3) {
              score = 72
            } else {
              score = food.kind === 'dish' || foodTok.length >= 3 ? 30 : 45
            }
          } else if (qTok.length >= 3 || q.length >= 12) score = 85
          else if (nTok.length <= 2 && q.length >= 4) score = 75
          else score = 25
        } else {
          // Case inflection: «овсянки» ↔ «овсянка»
          if (qTok.length === 1 && nTok.length === 1 && sameLexeme(qTok[0]!, nTok[0]!)) {
            if (aliasIsFragment || foodTok.length >= 3) {
              score = food.kind === 'dish' ? 30 : 40
            } else {
              score = 90
            }
          } else if (
            // «творога» → «Творог мягкий 5%» (genitive ≠ substring of nominative label)
            qTok.length === 1 &&
            food.kind !== 'dish' &&
            foodTok.length >= 2 &&
            foodTok.length <= 3 &&
            foodTok[0] != null &&
            sameLexeme(foodTok[0], qTok[0]!)
          ) {
            score = 72
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

  // Conflicting compound leftovers — re-check against the food's canonical tokens
  // (aliases can be single words and would otherwise dodge the cap).
  const qTok = tokens(q)
  const foodTok = tokens(foodName)
  if (hasConflictingExtraTokens(qTok, foodTok) && best > 0 && best < 94) {
    best = Math.min(best, 48)
  }

  // Dish bonus only when the query looks like the full dish, not a short alias
  if (food.kind === 'dish' && best >= 80 && bestLabel.length >= foodName.length * 0.5) {
    best += 5
  }

  return best
}

export type FoodMatchCandidate = {
  food: FoodRef
  score: number
}

/** Ranked catalog hits for a query (highest score first; shorter name on ties). */
export function findFoodCandidates(
  name: string,
  foods: FoodRef[],
  minScore = 55,
  limit = 8,
): FoodMatchCandidate[] {
  const scored: FoodMatchCandidate[] = []
  for (const food of foods) {
    const score = scoreFoodMatch(name, food)
    if (score >= minScore) scored.push({ food, score })
  }
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return a.food.name.length - b.food.name.length
  })
  return scored.slice(0, Math.max(1, limit))
}

export function findBestFood(
  name: string,
  foods: FoodRef[],
  minScore = 55,
): FoodRef | null {
  const resolved = resolveCatalogMatch(name, foods, { minScore })
  return resolved.kind === 'match' ? resolved.food : null
}

export type CatalogResolve =
  | { kind: 'match'; food: FoodRef; score: number }
  | { kind: 'ambiguous'; candidates: FoodMatchCandidate[]; query: string }
  | { kind: 'none' }

const DEFAULT_AMBIGUOUS_GAP = 8
/** Floor for showing a pick list (head-stem variants score ~72). */
const DEFAULT_CANDIDATE_FLOOR = 55
/**
 * Soft related hits — shown as «Похожие», never auto-picked.
 * Covers secondary-token matches like «сыр» → «Творожный сыр» (~45).
 */
export const RELATED_CANDIDATE_FLOOR = 40
/** Scores at/above this can auto-match; related stays strictly below. */
const RELATED_MAX_SCORE = 70

/**
 * Weaker catalog cousins for the pick UI (exclude primary / auto-match hits).
 */
export function findRelatedFoodCandidates(
  name: string,
  foods: FoodRef[],
  excludeIds?: Iterable<string>,
  limit = 6,
): FoodMatchCandidate[] {
  const exclude = new Set(excludeIds ?? [])
  return findFoodCandidates(name, foods, RELATED_CANDIDATE_FLOOR, 16)
    .filter((c) => !exclude.has(c.food.id) && c.score < RELATED_MAX_SCORE)
    .slice(0, Math.max(1, limit))
}

/**
 * Resolve a free-text food name against the catalog.
 * - exact / clear winner → match
 * - several close variants («творог» → 0,1% / 5%) → ambiguous (caller shows pick UI)
 * - nothing usable → none
 */
export function resolveCatalogMatch(
  name: string,
  foods: FoodRef[],
  opts?: {
    minScore?: number
    ambiguousGap?: number
    candidateFloor?: number
  },
): CatalogResolve {
  const minScore = opts?.minScore ?? 70
  const gap = opts?.ambiguousGap ?? DEFAULT_AMBIGUOUS_GAP
  const floor = opts?.candidateFloor ?? DEFAULT_CANDIDATE_FLOOR
  const query = name.trim()
  if (!query || foods.length === 0) return { kind: 'none' }

  const candidates = findFoodCandidates(query, foods, floor, 12)
  if (candidates.length === 0) return { kind: 'none' }

  const best = candidates[0]!
  // Near-exact label: auto-pick even if cousins are close.
  if (best.score >= 94) {
    return { kind: 'match', food: best.food, score: best.score }
  }

  const close = candidates.filter((c) => c.score >= best.score - gap)
  if (close.length >= 2 && best.score >= floor) {
    return { kind: 'ambiguous', candidates: close, query }
  }

  if (best.score >= minScore) {
    return { kind: 'match', food: best.food, score: best.score }
  }

  return { kind: 'none' }
}
