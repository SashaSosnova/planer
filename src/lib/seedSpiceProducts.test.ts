import { describe, expect, it } from 'vitest'
import { buildSeedSpiceProducts, mergeSeedSpiceProducts } from './seedSpiceProducts'

describe('buildSeedSpiceProducts', () => {
  it('includes base spices and new catalog products', () => {
    const names = buildSeedSpiceProducts().map((f) => f.name)
    expect(names).toEqual(
      expect.arrayContaining([
        'Соль',
        'Орегано',
        'Лавровый лист',
        'Паприка сладкая',
        'Базилик',
        'Бульон говяжий',
        'Карри порошок мягкий',
        'Красное сухое вино',
        'Лук фиолетовый',
        'Лук-порей',
        'Майонез лёгкий',
        'Перетёртые томаты',
        'Перец чёрный молотый',
        'Перец белый молотый',
        'Прованские травы',
        'Розмарин свежий',
        'Тимьян свежий',
        'Салат листовой',
        'Шпинат',
        'Горчица дижонская',
        'Помидоры черри',
        'Зелёный лук',
      ]),
    )
  })

  it('marks kind as ingredient and sets categories', () => {
    const byName = Object.fromEntries(buildSeedSpiceProducts().map((f) => [f.name, f]))
    for (const food of Object.values(byName)) {
      expect(food.kind).toBe('ingredient')
    }
    expect(byName['Перец чёрный молотый']?.category).toBe('spices')
    expect(byName['Шпинат']?.category).toBe('vegetables')
    expect(byName['Майонез лёгкий']?.category).toBe('oils')
    expect(byName['Красное сухое вино']?.category).toBe('drinks')
    expect(byName['Бульон говяжий']?.per100g).toEqual({
      kcal: 15,
      protein: 1.2,
      fat: 0.5,
      carbs: 1.5,
    })
  })
})

describe('mergeSeedSpiceProducts', () => {
  it('adds only missing products by name', () => {
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
    expect(added.map((f) => f.name)).not.toContain('Соль')
    expect(added.map((f) => f.name)).toEqual(
      expect.arrayContaining(['Орегано', 'Шпинат', 'Перец чёрный молотый']),
    )
    expect(foods.length).toBe(1 + added.length)
  })
})
