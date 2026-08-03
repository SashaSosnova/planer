import { describe, expect, it } from 'vitest'
import {
  coerceMealType,
  extractMealTypeFromText,
  mealBodyText,
  mealPreviewText,
  nextMealType,
} from './labels'

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

  it('strips bare Завтрак on its own line', () => {
    const r = extractMealTypeFromText('Завтрак\nомлет 2 шт')
    expect(r.mealType).toBe('breakfast')
    expect(r.cleaned).toBe('омлет 2 шт')
    expect(mealBodyText('Завтрак\nомлет 2 шт')).toBe('омлет 2 шт')
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

describe('mealPreviewText', () => {
  it('prefers item names over frozen rawText', () => {
    expect(
      mealPreviewText({
        rawText: 'творог 100 и банан',
        items: [
          { name: 'Творог 5%', grams: 100, kcal: 0, protein: 0, fat: 0, carbs: 0, source: 'library' },
          { name: 'Банан', grams: 80, kcal: 0, protein: 0, fat: 0, carbs: 0, source: 'library' },
        ],
      }),
    ).toBe('Творог 5%, Банан')
  })

  it('falls back to rawText when items are empty', () => {
    expect(mealPreviewText({ rawText: 'Завтрак\nомлет', items: [] })).toBe('омлет')
  })
})
