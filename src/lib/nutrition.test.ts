import { describe, expect, it } from 'vitest'
import {
  emptyMacros,
  guessFallbackCategory,
  restaurantPortionGrams,
  round1,
  scalePer100g,
  sumMacros,
} from './nutrition'

describe('scalePer100g', () => {
  it('scales half portion', () => {
    expect(scalePer100g({ kcal: 100, protein: 10, fat: 5, carbs: 8 }, 50)).toEqual({
      kcal: 50,
      protein: 5,
      fat: 2.5,
      carbs: 4,
    })
  })

  it('scales 200 g', () => {
    expect(scalePer100g({ kcal: 140, protein: 20, fat: 6, carbs: 0 }, 200)).toEqual({
      kcal: 280,
      protein: 40,
      fat: 12,
      carbs: 0,
    })
  })
})

describe('sumMacros / round1', () => {
  it('sums items with one-decimal rounding', () => {
    expect(
      sumMacros([
        { kcal: 10.14, protein: 1.14, fat: 0.14, carbs: 2.14 },
        { kcal: 10.14, protein: 1.14, fat: 0.14, carbs: 2.14 },
      ]),
    ).toEqual({ kcal: 20.2, protein: 2.2, fat: 0.2, carbs: 4.2 })
  })

  it('returns zeros for empty list', () => {
    expect(sumMacros([])).toEqual(emptyMacros())
  })

  it('round1 rounds half up via Math.round', () => {
    expect(round1(1.15)).toBe(1.2)
    expect(round1(1.14)).toBe(1.1)
  })
})

describe('guessFallbackCategory', () => {
  it('detects coffee and latte separately', () => {
    expect(guessFallbackCategory('американо').kcal).toBe(2)
    expect(guessFallbackCategory('латте').kcal).toBe(45)
  })

  it('detects pasta dry vs cooked-ish pasta dishes', () => {
    expect(guessFallbackCategory('спагетти сухие').kcal).toBe(350)
    expect(guessFallbackCategory('паста карбонара').kcal).toBe(150)
  })
})

describe('restaurantPortionGrams', () => {
  it('returns typical servings', () => {
    expect(restaurantPortionGrams('суп')).toBe(300)
    expect(restaurantPortionGrams('стейк')).toBe(180)
    expect(restaurantPortionGrams('кофе')).toBe(250)
  })
})
