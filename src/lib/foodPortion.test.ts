import { describe, expect, it } from 'vitest'
import {
  defaultFoodGrams,
  parsePortionGrams,
  per100FromPortionMacros,
  portionMacrosFromPer100,
} from './foodPortion'

describe('foodPortion', () => {
  it('defaults to 100 g without portion', () => {
    expect(defaultFoodGrams({})).toBe(100)
    expect(defaultFoodGrams({ portionGrams: 280 })).toBe(280)
  })

  it('converts portion macros ↔ per100g', () => {
    const portion = { kcal: 300, protein: 30, fat: 15, carbs: 30 }
    const per100 = per100FromPortionMacros(portion, 200)
    expect(per100).toEqual({ kcal: 150, protein: 15, fat: 7.5, carbs: 15 })
    expect(portionMacrosFromPer100(per100, 200)).toEqual(portion)
  })

  it('parses portion grams', () => {
    expect(parsePortionGrams('280')).toBe(280)
    expect(parsePortionGrams('')).toBeNull()
    expect(parsePortionGrams('-1')).toBeNull()
  })
})
