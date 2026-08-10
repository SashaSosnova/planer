import { describe, expect, it } from 'vitest'
import {
  assertNonNegMacros,
  sanitizeMacros,
  sanitizeMeal,
  sanitizeMealItems,
  totalsFromItems,
} from './sanitize'

describe('sanitizeMacros', () => {
  it('clamps negatives and non-finite to 0', () => {
    expect(sanitizeMacros({ kcal: -10, protein: Number.NaN, fat: 3, carbs: 4 })).toEqual({
      kcal: 0,
      protein: 0,
      fat: 3,
      carbs: 4,
    })
  })
})

describe('sanitizeMeal', () => {
  it('preserves planned flag', () => {
    const meal = sanitizeMeal({
      id: 'm1',
      date: '2026-07-15',
      mealType: 'lunch',
      rawText: 'суп',
      items: [
        {
          name: 'суп',
          grams: 300,
          kcal: 120,
          protein: 5,
          fat: 3,
          carbs: 15,
          source: 'estimate',
        },
      ],
      totals: { kcal: 120, protein: 5, fat: 3, carbs: 15 },
      isApproximate: false,
      eatingOut: false,
      planned: true,
      createdAt: 1,
    })
    expect(meal?.planned).toBe(true)
  })

  it('defaults planned to false when missing', () => {
    const meal = sanitizeMeal({
      id: 'm1',
      date: '2026-07-15',
      mealType: 'lunch',
      rawText: 'суп',
      items: [
        {
          name: 'суп',
          grams: 300,
          kcal: 120,
          protein: 5,
          fat: 3,
          carbs: 15,
          source: 'estimate',
        },
      ],
      isApproximate: false,
      eatingOut: false,
      createdAt: 1,
    })
    expect(meal?.planned).toBe(false)
  })
})

describe('sanitizeMealItems', () => {
  it('drops invalid items and keeps valid ones', () => {
    const items = sanitizeMealItems([
      { name: 'ok', grams: 100, kcal: 50, protein: 1, fat: 1, carbs: 1, source: 'estimate' },
      { name: 'bad', grams: -5, kcal: 10, protein: 0, fat: 0, carbs: 0, source: 'estimate' },
      { name: '', grams: 50, kcal: 10, protein: 0, fat: 0, carbs: 0, source: 'estimate' },
      { kcal: 'bad', grams: 50, name: 'corrupt', protein: 1, fat: 1, carbs: 1, source: 'estimate' },
    ])
    expect(items).toHaveLength(2)
    expect(items[0]!.name).toBe('ok')
    expect(items[1]!.name).toBe('corrupt')
    expect(items[1]!.kcal).toBe(0)
  })

  it('recomputes totals from sanitized items', () => {
    const items = sanitizeMealItems([
      { name: 'a', grams: 50, kcal: 10, protein: 1, fat: 1, carbs: 1, source: 'estimate' },
      { name: 'b', grams: 50, kcal: 20, protein: 2, fat: 2, carbs: 2, source: 'estimate' },
    ])
    expect(totalsFromItems(items)).toEqual({ kcal: 30, protein: 3, fat: 3, carbs: 3 })
  })
})

describe('assertNonNegMacros', () => {
  it('throws on negative values', () => {
    expect(() => assertNonNegMacros({ kcal: -1, protein: 0, fat: 0, carbs: 0 })).toThrow()
  })
})
