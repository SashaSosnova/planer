import { describe, expect, it } from 'vitest'
import {
  CARE_DAY_FLAGS,
  CARE_EVENING_BY_DAY,
  CARE_MORNING_STEPS,
  CARE_PRODUCT_GROUPS,
  CARE_RULES,
  careWeekdayFromDate,
  eveningForWeekday,
} from './careRoutine'

describe('careRoutine', () => {
  it('maps JS Sunday to sun', () => {
    expect(careWeekdayFromDate(new Date(2026, 7, 2))).toBe('sun')
    expect(careWeekdayFromDate(new Date(2026, 7, 3))).toBe('mon')
  })

  it('has morning steps and evening for every weekday', () => {
    expect(CARE_MORNING_STEPS.length).toBeGreaterThanOrEqual(6)
    expect(CARE_RULES.length).toBeGreaterThanOrEqual(4)
    for (const day of Object.keys(CARE_EVENING_BY_DAY) as Array<keyof typeof CARE_EVENING_BY_DAY>) {
      expect(eveningForWeekday(day).steps.length).toBeGreaterThan(0)
    }
  })

  it('never combines Caramel and BHA; BHA only Saturday; mask only Sunday', () => {
    for (const [day, flags] of Object.entries(CARE_DAY_FLAGS)) {
      expect(flags.caramel && flags.bha, day).toBe(false)
    }
    expect(CARE_DAY_FLAGS.sat).toEqual({ caramel: false, bha: true, mask: false })
    expect(CARE_DAY_FLAGS.sun).toEqual({ caramel: false, bha: false, mask: true })
    expect(CARE_DAY_FLAGS.mon.caramel).toBe(true)
    expect(CARE_DAY_FLAGS.mon.bha).toBe(false)
  })

  it('Monday evening has no BHA step', () => {
    const ids = eveningForWeekday('mon').steps.map((s) => s.id)
    expect(ids).not.toContain('e-bha')
    expect(ids).toContain('e-caramel')
  })

  it('BHA product is Saturday-only', () => {
    const bha = CARE_PRODUCT_GROUPS.flatMap((g) => g.products).find((p) => p.id === 'bha-pads')
    expect(bha?.when.toLowerCase()).toContain('суббот')
  })
})
