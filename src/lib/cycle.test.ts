import { describe, expect, it } from 'vitest'
import { averageCycleLength, cyclePhaseTip, getCycleInfo } from './cycle'

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

describe('cyclePhaseTip', () => {
  it('gives supportive tips with water/calorie context', () => {
    expect(cyclePhaseTip('luteal')).toMatch(/воды|калори/i)
    expect(cyclePhaseTip('menstrual')).toMatch(/воды|энерг/i)
    expect(cyclePhaseTip('follicular')).toMatch(/энерг|план|движен/i)
    expect(cyclePhaseTip('ovulation')).toMatch(/энерг|аппетит/i)
    expect(cyclePhaseTip('unknown')).toBeNull()
  })
})

describe('averageCycleLength', () => {
  it('averages gaps between starts', () => {
    expect(
      averageCycleLength([
        { id: '1', date: '2026-01-01', createdAt: 1 },
        { id: '2', date: '2026-01-29', createdAt: 2 },
        { id: '3', date: '2026-02-26', createdAt: 3 },
      ]),
    ).toBe(28)
  })
})

describe('getCycleInfo with multiple starts', () => {
  it('uses the applicable start for the date', () => {
    const starts = [
      { id: '1', date: '2026-01-01', createdAt: 1 },
      { id: '2', date: '2026-02-01', createdAt: 2 },
    ]
    const info = getCycleInfo(starts, '2026-02-05', 28, 5)
    expect(info.dayInCycle).toBe(5)
    expect(info.lastPeriodStart).toBe('2026-02-01')
  })
})
