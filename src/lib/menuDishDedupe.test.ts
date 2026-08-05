import { describe, expect, it } from 'vitest'
import type { FoodItem } from '../types'
import { dedupeMenuDishes, findMenuDishDuplicates } from './menuDishDedupe'

function dish(
  id: string,
  name: string,
  extra: Partial<FoodItem> = {},
): FoodItem {
  return {
    id,
    name,
    aliases: [],
    per100g: { kcal: 100, protein: 10, fat: 5, carbs: 8 },
    kind: 'dish',
    updatedAt: 1,
    ...extra,
  }
}

describe('findMenuDishDuplicates', () => {
  it('groups by menuId', () => {
    const groups = findMenuDishDuplicates([
      dish('a', 'Болоньезе', { menuId: 'bolognese', updatedAt: 1 }),
      dish('b', 'Болоньезе', { menuId: 'bolognese', updatedAt: 2 }),
      dish('c', 'Рис', { menuId: 'rice' }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0]!.removeIds).toEqual(['a'])
    expect(groups[0]!.keepId).toBe('b')
  })

  it('groups same name without menuId', () => {
    const groups = findMenuDishDuplicates([
      dish('a', 'Болоньезе', { recipe: { ingredients: [], totalRawGrams: 0, totalCookedGrams: 0, totalMacros: { kcal: 0, protein: 0, fat: 0, carbs: 0 } } }),
      dish('b', 'Болоньезе'),
    ])
    expect(groups[0]!.keepId).toBe('a')
    expect(groups[0]!.removeIds).toEqual(['b'])
  })

  it('prefers dish with menuId over name-only copy', () => {
    const { removedIds, groups } = dedupeMenuDishes([
      dish('old', 'Болоньезе'),
      dish('linked', 'Болоньезе', { menuId: 'bolognese' }),
    ])
    expect(removedIds).toEqual(['old'])
    expect(groups[0]!.keepId).toBe('linked')
  })
})
