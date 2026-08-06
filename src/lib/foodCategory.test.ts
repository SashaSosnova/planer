import { describe, expect, it } from 'vitest'
import {
  groupByDishCategory,
  groupByFoodCategory,
  inferDishCategory,
  inferFoodCategory,
  resolveDishCategory,
  resolveFoodCategory,
} from './foodCategory'

describe('inferFoodCategory', () => {
  it('maps common aisle items', () => {
    expect(inferFoodCategory('Соль')).toBe('spices')
    expect(inferFoodCategory('Перец чёрный молотый')).toBe('spices')
    expect(inferFoodCategory('Паприка молотая')).toBe('spices')
    expect(inferFoodCategory('Творог 5%')).toBe('dairy')
    expect(inferFoodCategory('Масло сливочное')).toBe('dairy')
    expect(inferFoodCategory('Гречка')).toBe('grocery')
    expect(inferFoodCategory('Яблоко')).toBe('fruit')
    expect(inferFoodCategory('Перец болгарский')).toBe('vegetables')
    expect(inferFoodCategory('Масло подсолнечное')).toBe('oils')
    expect(inferFoodCategory('Куриная грудка')).toBe('meat')
    expect(inferFoodCategory('Форель')).toBe('fish')
    expect(inferFoodCategory('Яйцо куриное')).toBe('eggs')
  })

  it('falls back to other', () => {
    expect(inferFoodCategory('Нечто неизведанное')).toBe('other')
  })
})

describe('resolveFoodCategory', () => {
  it('prefers saved category over inference', () => {
    expect(
      resolveFoodCategory({ name: 'Соль', category: 'grocery' }),
    ).toBe('grocery')
    expect(resolveFoodCategory({ name: 'Соль' })).toBe('spices')
  })
})

describe('inferDishCategory', () => {
  it('uses dish name structure first', () => {
    expect(inferDishCategory('Куриный суп')).toBe('soups')
    expect(inferDishCategory('Салат цезарь')).toBe('salads')
    expect(inferDishCategory('Сырники')).toBe('breakfast')
    expect(inferDishCategory('Шоколадный брауни')).toBe('desserts')
  })

  it('detects protein from ingredients', () => {
    expect(
      inferDishCategory('Ужин', [{ name: 'Куриная грудка' }, { name: 'Рис' }]),
    ).toBe('poultry_dish')
    expect(
      inferDishCategory('Ужин', [{ name: 'Форель' }, { name: 'Лимон' }]),
    ).toBe('fish_dish')
    expect(
      inferDishCategory('Ужин', [{ name: 'Говядина' }, { name: 'Лук' }]),
    ).toBe('meat_dish')
    expect(
      inferDishCategory('Гарнир', [{ name: 'Гречка' }, { name: 'Масло' }]),
    ).toBe('grains')
    expect(inferDishCategory('Овощной гарнир')).toBe('veg_side')
    expect(inferDishCategory('Гречка с маслом')).toBe('grains')
  })
})

describe('resolveDishCategory', () => {
  it('prefers saved category', () => {
    expect(
      resolveDishCategory({
        name: 'Куриный суп',
        category: 'poultry_dish',
        recipe: { ingredients: [], totalRawGrams: 0, totalCookedGrams: 0, totalMacros: { kcal: 0, protein: 0, fat: 0, carbs: 0 } },
      }),
    ).toBe('poultry_dish')
  })
})

describe('group helpers', () => {
  it('groups foods in aisle order and skips empty', () => {
    const groups = groupByFoodCategory([
      { name: 'Гречка' },
      { name: 'Творог' },
      { name: 'Соль' },
    ])
    expect(groups.map((g) => g.id)).toEqual(['dairy', 'grocery', 'spices'])
    expect(groups[0]!.items[0]!.name).toBe('Творог')
  })

  it('groups dishes', () => {
    const groups = groupByDishCategory([
      { name: 'Гречка с маслом', recipe: { ingredients: [{ name: 'Гречка', gramsRaw: 80, per100g: { kcal: 300, protein: 10, fat: 2, carbs: 60 }, source: 'library', yieldFactor: 2.5 }], totalRawGrams: 80, totalCookedGrams: 200, totalMacros: { kcal: 240, protein: 8, fat: 2, carbs: 48 } } },
      { name: 'Куриный суп' },
      { name: 'Салат цезарь' },
    ])
    expect(groups.map((g) => g.id)).toEqual(['grains', 'soups', 'salads'])
  })

  it('re-infers legacy sides category', () => {
    expect(
      resolveDishCategory({
        name: 'Гречка с маслом',
        category: 'sides',
        recipe: {
          ingredients: [{ name: 'Гречка', gramsRaw: 80, per100g: { kcal: 300, protein: 10, fat: 2, carbs: 60 }, source: 'library', yieldFactor: 2.5 }],
          totalRawGrams: 80,
          totalCookedGrams: 200,
          totalMacros: { kcal: 240, protein: 8, fat: 2, carbs: 48 },
        },
      }),
    ).toBe('grains')
  })
})
