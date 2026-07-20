import type { WeightEntry } from '../types'

/**
 * Known Telegram typos that were later corrected in chat but imported as-is.
 * Apply once so live diaries match the corrected values.
 */
const KNOWN_WEIGHT_FIXES: { date: string; from: number; to: number }[] = [
  { date: '2026-03-04', from: 55.7, to: 65.7 },
  { date: '2026-03-20', from: 59.8, to: 65.8 },
  { date: '2026-03-21', from: 59.8, to: 65.8 },
]

/** Returns weights with known typo values corrected. Idempotent. */
export function applyKnownWeightFixes(weights: WeightEntry[]): {
  weights: WeightEntry[]
  changed: WeightEntry[]
} {
  const changed: WeightEntry[] = []
  const next = weights.map((w) => {
    const fix = KNOWN_WEIGHT_FIXES.find(
      (f) => f.date === w.date && Math.abs(w.kg - f.from) < 0.05,
    )
    if (!fix) return w
    const updated = { ...w, kg: fix.to }
    changed.push(updated)
    return updated
  })
  return { weights: changed.length ? next : weights, changed }
}
