import { describe, expect, it } from 'vitest'
import { buildSeedSpiceProducts, mergeSeedSpiceProducts } from './seedSpiceProducts'

describe('buildSeedSpiceProducts', () => {
  it('includes spices used in menu recipes', () => {
    const names = buildSeedSpiceProducts().map((f) => f.name)
    expect(names).toEqual(
      expect.arrayContaining(['Соль', 'Орегано', 'Лавровый лист', 'Паприка сладкая', 'Базилик']),
    )
  })

  it('marks category as spices', () => {
    for (const food of buildSeedSpiceProducts()) {
      expect(food.category).toBe('spices')
      expect(food.kind).toBe('ingredient')
    }
  })
})

describe('mergeSeedSpiceProducts', () => {
  it('adds only missing spices by name', () => {
    const { foods, added } = mergeSeedSpiceProducts([
      {
        id: 'x',
        name: 'Соль',
        aliases: [],
        per100g: { kcal: 0, protein: 0, fat: 0, carbs: 0 },
        kind: 'ingredient',
        updatedAt: 1,
      },
    ])
    expect(added.map((f) => f.name)).toEqual([
      'Орегано',
      'Лавровый лист',
      'Паприка сладкая',
      'Базилик',
    ])
    expect(foods).toHaveLength(5)
  })
})
