import { describe, expect, it } from 'vitest'
import { formatIsoDot, parseDotDate } from './date'

describe('formatIsoDot / parseDotDate', () => {
  it('formats ISO as dd.mm.yyyy', () => {
    expect(formatIsoDot('2026-07-21')).toBe('21.07.2026')
  })

  it('parses dotted dates', () => {
    expect(parseDotDate('21.07.2026')).toBe('2026-07-21')
    expect(parseDotDate('1.7.26')).toBe('2026-07-01')
  })

  it('rejects invalid dates', () => {
    expect(parseDotDate('32.01.2026')).toBeNull()
    expect(parseDotDate('abc')).toBeNull()
  })
})
