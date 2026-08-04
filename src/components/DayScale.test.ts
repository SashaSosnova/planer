import { describe, expect, it } from 'vitest'
import { scaleZone } from './DayScale'

describe('scaleZone', () => {
  it('treats protein/veg as toward-goal', () => {
    expect(scaleZone(20, 70, 'toward')).toBe('low')
    expect(scaleZone(70, 70, 'toward')).toBe('ok')
    expect(scaleZone(90, 70, 'toward')).toBe('ok')
  })

  it('treats sweets as a budget cap', () => {
    expect(scaleZone(100, 140, 'budget')).toBe('ok')
    expect(scaleZone(150, 140, 'budget')).toBe('warn')
    expect(scaleZone(180, 140, 'budget')).toBe('over')
  })
})
