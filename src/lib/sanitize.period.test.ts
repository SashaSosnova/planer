import { describe, expect, it } from 'vitest'
import { dedupeMeasurements, dedupePeriodStarts } from './sanitize'

describe('dedupePeriodStarts', () => {
  it('collapses same-id doubles from sync race', () => {
    const entry = { id: 'a', date: '2026-03-01', createdAt: 1 }
    const { kept, droppedIds } = dedupePeriodStarts([entry, entry])
    expect(kept).toEqual([entry])
    expect(droppedIds).toEqual([])
  })

  it('keeps newest when two ids share a date', () => {
    const { kept, droppedIds } = dedupePeriodStarts([
      { id: 'old', date: '2026-03-01', createdAt: 1 },
      { id: 'new', date: '2026-03-01', createdAt: 2 },
    ])
    expect(kept).toEqual([{ id: 'new', date: '2026-03-01', createdAt: 2 }])
    expect(droppedIds).toEqual(['old'])
  })
})

describe('dedupeMeasurements', () => {
  it('keeps newest when two ids share a date', () => {
    const { kept, droppedIds } = dedupeMeasurements([
      { id: 'old', date: '2026-03-01', waist: 70, createdAt: 1 },
      { id: 'new', date: '2026-03-01', waist: 68, createdAt: 2 },
    ])
    expect(kept).toEqual([{ id: 'new', date: '2026-03-01', waist: 68, createdAt: 2 }])
    expect(droppedIds).toEqual(['old'])
  })
})
