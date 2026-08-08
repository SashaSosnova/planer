import { describe, expect, it } from 'vitest'
import { buildMealEstimatePrompt, buildMealSplitPrompt } from './parseMealSplit'

describe('meal split / estimate prompts', () => {
  it('split prompt asks for null grams when weight omitted', () => {
    const p = buildMealSplitPrompt({
      text: 'яйцо куриное\nсыр 5 г',
      mealType: 'breakfast',
      eatingOut: false,
    })
    expect(p).toMatch(/grams = null/i)
    expect(p).toContain('яйцо куриное')
    expect(p).not.toMatch(/kcal/i)
  })

  it('estimate prompt asks for portion macros', () => {
    const p = buildMealEstimatePrompt([{ name: 'хумус', grams: 50 }])
    expect(p).toContain('хумус')
    expect(p).toMatch(/не на 100 г/i)
  })
})
