import { describe, expect, it } from 'vitest'
import { careSkinVerdict, formatCareSkinBrief } from './careSkin'

describe('careSkin', () => {
  it('formats brief deltas', () => {
    expect(
      formatCareSkinBrief({
        tzoneOil: '+',
        cheekDry: '0',
        redness: '-',
        tzoneTexture: '0',
      }),
    ).toBe('жир:+ · щёки:0 · красн:− · рельеф:0')
  })

  it('gives verdict only when all four filled', () => {
    expect(careSkinVerdict({ tzoneOil: '+' })).toBeNull()
    expect(
      careSkinVerdict({
        tzoneOil: '+',
        cheekDry: '+',
        redness: '+',
        tzoneTexture: '+',
      }),
    ).toMatch(/идеальный/)
    expect(
      careSkinVerdict({
        tzoneOil: '-',
        cheekDry: '-',
        redness: '-',
        tzoneTexture: '0',
      }),
    ).toMatch(/база/)
  })
})
