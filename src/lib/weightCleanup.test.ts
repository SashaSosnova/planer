import { describe, expect, it } from 'vitest'
import { applyKnownWeightFixes } from './weightCleanup'

describe('applyKnownWeightFixes', () => {
  it('corrects known typo weigh-ins', () => {
    const { weights, changed } = applyKnownWeightFixes([
      { id: 'a', date: '2026-03-19', kg: 66, createdAt: 1 },
      { id: 'b', date: '2026-03-20', kg: 59.8, createdAt: 2 },
      { id: 'c', date: '2026-03-21', kg: 59.8, createdAt: 3 },
      { id: 'd', date: '2026-03-04', kg: 55.7, createdAt: 4 },
    ])
    expect(changed).toHaveLength(3)
    expect(weights.find((w) => w.date === '2026-03-20')?.kg).toBe(65.8)
    expect(weights.find((w) => w.date === '2026-03-21')?.kg).toBe(65.8)
    expect(weights.find((w) => w.date === '2026-03-04')?.kg).toBe(65.7)
  })

  it('is idempotent on already-fixed values', () => {
    const { changed } = applyKnownWeightFixes([
      { id: 'b', date: '2026-03-20', kg: 65.8, createdAt: 2 },
    ])
    expect(changed).toHaveLength(0)
  })
})
