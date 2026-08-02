import { describe, expect, it } from 'vitest'
import { buildSeedCareProducts } from './seedCareProducts'
import {
  isCareDayEmpty,
  productCheckedOnDay,
  productsForDaySlot,
  weekDatesContaining,
} from './careSchedule'

describe('careSchedule', () => {
  it('builds Mon–Sun week containing Sunday', () => {
    // 2026-08-02 is Sunday
    expect(weekDatesContaining('2026-08-02')).toEqual([
      '2026-07-27',
      '2026-07-28',
      '2026-07-29',
      '2026-07-30',
      '2026-07-31',
      '2026-08-01',
      '2026-08-02',
    ])
  })

  it('schedules caramel only Mon–Fri evening; BHA only Saturday; foam every evening', () => {
    const products = buildSeedCareProducts(1)
    const monEve = productsForDaySlot(products, 'mon', 'evening').map((p) => p.id)
    const satEve = productsForDaySlot(products, 'sat', 'evening').map((p) => p.id)
    const morning = productsForDaySlot(products, 'mon', 'morning').map((p) => p.id)
    expect(monEve).toEqual([
      'caramel',
      'dermo-cleanser',
      'dual-toner',
      'thermal',
      'ha',
      'nmf',
    ])
    expect(satEve).toEqual([
      'dermo-cleanser',
      'dual-toner',
      'bha-pads',
      'thermal',
      'ha',
      'nmf',
    ])
    expect(satEve).not.toContain('caramel')
    expect(morning).toEqual([
      'water',
      'thermal',
      'dual-toner',
      'soothing',
      'nmf',
      'spf',
    ])
    expect(products.map((p) => p.id)).not.toContain('squalane')
    expect(products.map((p) => p.id)).not.toContain('cerave')
  })

  it('marks product checked per slot', () => {
    const products = buildSeedCareProducts(1)
    const nmf = products.find((p) => p.id === 'nmf')!
    const day = {
      id: '1',
      date: '2026-08-03',
      morning: ['nmf'],
      evening: [],
      createdAt: 1,
      updatedAt: 1,
    }
    const checked = productCheckedOnDay(nmf, day, 'mon')
    expect(checked.morning).toBe(true)
    expect(checked.evening).toBe(false)
    expect(checked.any).toBe(true)
  })

  it('detects empty care day', () => {
    expect(isCareDayEmpty({ morning: [], evening: [], skin: undefined, note: undefined })).toBe(
      true,
    )
    expect(
      isCareDayEmpty({
        morning: [],
        evening: [],
        skin: { tzoneOil: '+' },
        note: undefined,
      }),
    ).toBe(false)
  })
})
