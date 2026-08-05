import { describe, expect, it } from 'vitest'
import { generateAliases } from './foodAliases'
import type { FoodItem, FoodRef } from '../types'
import {
  buildMenuRecipeText,
  exportMenuMacros,
  exportProductCatalog,
  menuDishToFoodInput,
  parseMenuDishesBundle,
} from './menuSync'

const PER100 = { kcal: 250, protein: 26, fat: 15, carbs: 0 }

function ingredient(id: string, name: string, per100g = PER100): FoodItem {
  return {
    id,
    name,
    aliases: generateAliases(name),
    per100g,
    kind: 'ingredient',
    updatedAt: 1,
  }
}

function ref(id: string, name: string): FoodRef {
  return {
    id,
    name,
    aliases: generateAliases(name),
    per100g: PER100,
    kind: 'ingredient',
  }
}

describe('parseMenuDishesBundle', () => {
  const dish = {
    id: 'bolognese',
    name: 'Болоньезе',
    ingredients: ['Говядина 500 г', 'Лук 2 шт'],
  }

  it('parses { dishes: [...] }', () => {
    expect(parseMenuDishesBundle({ dishes: [dish] })).toEqual([dish])
  })

  it('parses bare array', () => {
    expect(parseMenuDishesBundle([dish])).toEqual([dish])
  })

  it('parses record map', () => {
    expect(parseMenuDishesBundle({ bolognese: dish })).toEqual([dish])
  })

  it('throws when no valid dishes', () => {
    expect(() =>
      parseMenuDishesBundle({ dishes: [{ id: 'x', name: 'X', ingredients: [] }] }),
    ).toThrow(/нет ни одного блюда/)
  })
})

describe('buildMenuRecipeText', () => {
  it('joins name and ingredient lines', () => {
    expect(
      buildMenuRecipeText({
        id: 'x',
        name: 'Болоньезе',
        ingredients: ['Говядина 500 г', 'Лук 2 шт'],
      }),
    ).toBe('Болоньезе\nГовядина 500 г\nЛук 2 шт')
  })
})

describe('menuDishToFoodInput', () => {
  it('matches ingredients from library and sets menuId', () => {
    const foods = [ref('beef', 'Говядина'), ref('onion', 'Лук')]
    const { input, unmatched } = menuDishToFoodInput(
      {
        id: 'bolognese',
        name: 'Болоньезе',
        ingredients: ['Говядина 500 г', 'Лук 2 шт'],
        servings: '4 порции',
      },
      foods,
    )
    expect(input.menuId).toBe('bolognese')
    expect(input.kind).toBe('dish')
    expect(input.name).toBe('Болоньезе')
    expect(input.recipe?.ingredients).toHaveLength(2)
    expect(input.recipe?.ingredients.every((i) => i.source === 'library')).toBe(true)
    expect(unmatched).toEqual([])
    expect(input.recipe?.notes).toContain('4 порции')
  })

  it('reports unmatched ingredients', () => {
    const foods = [ref('beef', 'Говядина')]
    const { unmatched } = menuDishToFoodInput(
      {
        id: 'test',
        name: 'Тест',
        ingredients: ['Говядина 500 г', 'Неизвестный продукт 100 г'],
      },
      foods,
    )
    expect(unmatched).toEqual(['Неизвестный продукт'])
  })
})

describe('exportProductCatalog', () => {
  it('exports only ingredients sorted by name', () => {
    const catalog = exportProductCatalog([
      ingredient('b', 'Банан'),
      { ...ingredient('d', 'Болоньезе'), kind: 'dish', menuId: 'bolo' },
      ingredient('a', 'Авокадо'),
    ])
    expect(catalog.map((c) => c.name)).toEqual(['Авокадо', 'Банан'])
  })
})

describe('exportMenuMacros', () => {
  it('exports per100g for dishes with menuId', () => {
    const out = exportMenuMacros([
      {
        id: '1',
        name: 'Болоньезе',
        aliases: [],
        per100g: { kcal: 120, protein: 12, fat: 6, carbs: 5 },
        kind: 'dish',
        menuId: 'bolognese',
        updatedAt: 1,
      },
      ingredient('beef', 'Говядина'),
    ])
    expect(out.dishes.bolognese).toEqual({
      name: 'Болоньезе',
      kcal: 120,
      protein: 12,
      fat: 6,
      carbs: 5,
    })
  })
})
