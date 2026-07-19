import { describe, expect, it } from 'vitest'
import { zoneFor } from './CalorieRing'

describe('zoneFor', () => {
  it('is ok at or below goal', () => {
    expect(zoneFor(1500, 1800, 2000)).toBe('ok')
    expect(zoneFor(1800, 1800, 2000)).toBe('ok')
  })

  it('is warn between goal and maintain', () => {
    expect(zoneFor(1900, 1800, 2000)).toBe('warn')
    expect(zoneFor(2000, 1800, 2000)).toBe('warn')
  })

  it('is over above maintain', () => {
    expect(zoneFor(2001, 1800, 2000)).toBe('over')
  })

  it('goes red past goal when maintain equals goal', () => {
    expect(zoneFor(1801, 1800, 1800)).toBe('over')
  })
})
