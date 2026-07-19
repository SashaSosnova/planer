import { describe, expect, it } from 'vitest'
import { getCycleInfo } from './cycle'

describe('getCycleInfo', () => {
  it('marks menstrual phase on day 1–5', () => {
    const info = getCycleInfo(
      [{ id: '1', date: '2026-07-01', createdAt: 1 }],
      '2026-07-03',
      28,
      5,
    )
    expect(info.phase).toBe('menstrual')
    expect(info.dayInCycle).toBe(3)
    expect(info.weightNote).toBeTruthy()
  })

  it('marks luteal phase late in cycle', () => {
    const info = getCycleInfo(
      [{ id: '1', date: '2026-07-01', createdAt: 1 }],
      '2026-07-22',
      28,
      5,
    )
    expect(info.phase).toBe('luteal')
    expect(info.weightNote).toMatch(/лютеиновой/i)
  })

  it('returns unknown without period starts', () => {
    expect(getCycleInfo([], '2026-07-19').phase).toBe('unknown')
  })
})
