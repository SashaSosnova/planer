import { describe, expect, it } from 'vitest'
import { isWeekComplete, isoDatesInWeek, weekStartIso } from './week'

describe('week helpers', () => {
  it('week starts on Monday', () => {
    expect(weekStartIso('2026-07-15')).toBe('2026-07-13') // Wed → Mon
    expect(weekStartIso('2026-07-12')).toBe('2026-07-06') // Sun → previous Mon
  })

  it('lists 7 ISO dates', () => {
    expect(isoDatesInWeek('2026-07-13')).toEqual([
      '2026-07-13',
      '2026-07-14',
      '2026-07-15',
      '2026-07-16',
      '2026-07-17',
      '2026-07-18',
      '2026-07-19',
    ])
  })

  it('week complete after Sunday', () => {
    expect(isWeekComplete('2026-07-06', '2026-07-12')).toBe(false) // Sunday
    expect(isWeekComplete('2026-07-06', '2026-07-13')).toBe(true)
  })
})
