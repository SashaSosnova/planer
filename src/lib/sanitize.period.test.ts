import { describe, expect, it } from 'vitest'
import { dedupeMeasurements, dedupePeriodStarts, mergePeriodStarts } from './sanitize'

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

describe('mergePeriodStarts', () => {
  it('keeps a local-only date when the cloud snapshot is stale or empty', () => {
    const local = { id: 'new', date: '2026-08-10', createdAt: 2 }
    const cloud = { id: 'old', date: '2026-07-12', createdAt: 1 }
    const { kept, toUpload, toDelete } = mergePeriodStarts([local, cloud], [cloud])
    expect(kept.map((s) => s.date)).toEqual(['2026-07-12', '2026-08-10'])
    expect(toUpload).toEqual([local])
    expect(toDelete).toEqual([])
  })

  it('does not wipe local starts when cloud is empty', () => {
    const local = { id: 'new', date: '2026-08-10', createdAt: 2 }
    const { kept, toUpload, toDelete } = mergePeriodStarts([local], [])
    expect(kept).toEqual([local])
    expect(toUpload).toEqual([local])
    expect(toDelete).toEqual([])
  })

  it('does not resurrect a date removed this session', () => {
    const cloud = { id: 'gone', date: '2026-08-10', createdAt: 1 }
    const { kept, toUpload, toDelete } = mergePeriodStarts([], [cloud], new Set(['2026-08-10']))
    expect(kept).toEqual([])
    expect(toUpload).toEqual([])
    expect(toDelete).toEqual(['gone'])
  })

  it('drops the older id when local and cloud share a date', () => {
    const local = { id: 'new', date: '2026-08-10', createdAt: 2 }
    const cloud = { id: 'old', date: '2026-08-10', createdAt: 1 }
    const { kept, toUpload, toDelete } = mergePeriodStarts([local], [cloud])
    expect(kept).toEqual([local])
    expect(toUpload).toEqual([local])
    expect(toDelete).toEqual(['old'])
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
