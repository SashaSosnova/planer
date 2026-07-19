import { describe, expect, it } from 'vitest'
import { coerceMealType, extractMealTypeFromText, nextMealType } from './labels'

describe('extractMealTypeFromText', () => {
  it('strips leading meal label', () => {
    const r = extractMealTypeFromText('обед: паста 200 г')
    expect(r.mealType).toBe('lunch')
    expect(r.cleaned).toBe('паста 200 г')
  })

  it('strips «съел на обед» without leaving junk words', () => {
    const r = extractMealTypeFromText('съел на обед: гречка 100 г')
    expect(r.mealType).toBe('lunch')
    expect(r.cleaned).toBe('гречка 100 г')
    expect(r.cleaned).not.toMatch(/съел/)
  })

  it('detects breakfast', () => {
    const r = extractMealTypeFromText('на завтрак тост 30 г')
    expect(r.mealType).toBe('breakfast')
    expect(r.cleaned.toLowerCase()).toContain('тост')
  })
})

describe('nextMealType', () => {
  it('fills empty slots in order', () => {
    expect(nextMealType([])).toBe('breakfast')
    expect(nextMealType(['breakfast'])).toBe('lunch')
    expect(nextMealType(['breakfast', 'lunch', 'dinner'])).toBe('snack')
  })
})

describe('coerceMealType', () => {
  it('accepts known types and falls back otherwise', () => {
    expect(coerceMealType('lunch')).toBe('lunch')
    expect(coerceMealType('brunch', 'dinner')).toBe('dinner')
    expect(coerceMealType(null)).toBe('snack')
  })
})
