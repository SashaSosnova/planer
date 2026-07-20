import { describe, expect, it } from 'vitest'
import { dayPromptForDate, DAY_PROMPTS } from './dayPrompts'

describe('dayPromptForDate', () => {
  it('returns the same prompt for the same date', () => {
    expect(dayPromptForDate('2026-07-20').question).toBe(
      dayPromptForDate('2026-07-20').question,
    )
  })

  it('rotates across different days', () => {
    const seen = new Set(
      ['2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23'].map(
        (d) => dayPromptForDate(d).question,
      ),
    )
    expect(seen.size).toBeGreaterThan(1)
  })

  it('always returns a known prompt', () => {
    const p = dayPromptForDate('2026-01-01')
    expect(DAY_PROMPTS.some((x) => x.question === p.question)).toBe(true)
  })
})
