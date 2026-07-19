import { describe, expect, it } from 'vitest'
import { localDayRange, mapAggregatedToDailySteps } from './healthSteps'
import { toIsoDate } from './date'

describe('mapAggregatedToDailySteps', () => {
  it('maps buckets to local dates and rounds counts', () => {
    const noon = new Date(2026, 6, 18, 12, 0, 0)
    const days = mapAggregatedToDailySteps([
      { startDate: noon.toISOString(), value: 6123.4 },
      { startDate: new Date(2026, 6, 19, 0, 0, 0).toISOString(), value: 0 },
    ])
    expect(days).toEqual([{ date: toIsoDate(noon), count: 6123 }])
  })

  it('skips non-positive values', () => {
    expect(
      mapAggregatedToDailySteps([
        { startDate: new Date(2026, 6, 19).toISOString(), value: 0 },
        { startDate: new Date(2026, 6, 19).toISOString(), value: -5 },
      ]),
    ).toEqual([])
  })
})

describe('localDayRange', () => {
  it('returns exclusive end at start of tomorrow', () => {
    const { start, end } = localDayRange(7)
    expect(end.getTime()).toBeGreaterThan(start.getTime())
    expect(end.getHours()).toBe(0)
    expect(end.getMinutes()).toBe(0)
    const spanDays = (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)
    expect(spanDays).toBe(8)
  })
})
