import { describe, expect, it } from 'vitest'
import { sanitizeAppData } from '../lib/sanitize'

describe('sanitizeAppData', () => {
  it('normalizes corrupt meals and drops invalid foods', () => {
    const data = sanitizeAppData({
      foods: [
        {
          id: 'f1',
          name: 'Хлеб',
          aliases: [],
          per100g: { kcal: -10, protein: 9, fat: 3, carbs: 49 },
          updatedAt: 1,
        },
        { id: 'bad', name: '', aliases: [], per100g: { kcal: 1, protein: 0, fat: 0, carbs: 0 }, updatedAt: 1 },
      ],
      meals: [
        {
          id: 'm1',
          date: '2026-07-15',
          mealType: 'lunch',
          rawText: 'хлеб',
          items: [
            { name: 'Хлеб', grams: 20, kcal: 'bad' as unknown as number, protein: 2, fat: 1, carbs: 10, source: 'estimate' },
            { name: 'gone', grams: -5, kcal: 10, protein: 0, fat: 0, carbs: 0, source: 'estimate' },
          ],
          totals: { kcal: 9999, protein: 0, fat: 0, carbs: 0 },
          isApproximate: false,
          eatingOut: false,
          createdAt: 1,
        },
      ],
      weights: [{ id: 'w1', date: '2026-07-15', kg: -5, createdAt: 1 }],
      measurements: [],
      steps: [{ id: 's1', date: '2026-07-15', count: -100, createdAt: 1 }],
    })

    expect(data.foods).toHaveLength(1)
    expect(data.foods[0]!.per100g.kcal).toBe(0)
    expect(data.meals).toHaveLength(1)
    expect(data.meals[0]!.items).toHaveLength(1)
    expect(data.meals[0]!.items[0]!.kcal).toBe(0)
    expect(data.meals[0]!.totals.kcal).toBe(0)
    expect(data.weights).toHaveLength(0)
    expect(data.steps[0]!.count).toBe(0)
    expect(data.medDays).toEqual([])
  })

  it('moves legacy place into brand', () => {
    const data = sanitizeAppData({
      foods: [
        {
          id: 'f1',
          name: 'Латте',
          aliases: [],
          per100g: { kcal: 45, protein: 2, fat: 2, carbs: 5 },
          place: 'Mechtai',
          updatedAt: 1,
        },
        {
          id: 'f2',
          name: 'Йогурт',
          aliases: [],
          per100g: { kcal: 80, protein: 4, fat: 3, carbs: 10 },
          place: 'Пятёрочка',
          brand: 'Простоквашино',
          updatedAt: 1,
        },
      ],
    } as never)
    expect(data.foods[0]!.brand).toBe('Mechtai')
    expect((data.foods[0] as { place?: string }).place).toBeUndefined()
    expect(data.foods[1]!.brand).toBe('Простоквашино')
    expect((data.foods[1] as { place?: string }).place).toBeUndefined()
  })

  it('keeps med day doses and drops empty entries', () => {
    const data = sanitizeAppData({
      medDays: [
        {
          id: 'md1',
          date: '2026-07-30',
          ironAt: '2026-07-30T09:00:00.000Z',
          mgBreakfastAt: 'bad',
          createdAt: 1,
          updatedAt: 2,
        },
        { id: 'md2', date: '2026-07-29', createdAt: 1, updatedAt: 1 },
      ],
    })
    expect(data.medDays).toHaveLength(1)
    expect(data.medDays[0]!.ironAt).toBe('2026-07-30T09:00:00.000Z')
    expect(data.medDays[0]!.mgBreakfastAt).toBeUndefined()
  })
})
