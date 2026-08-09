import { describe, expect, it } from 'vitest'
import {
  compareMealsByTypeThenTime,
  formatMealClock,
  groupDayMealsForList,
  inferSavedFoodKind,
  mealItemIsUnresolved,
  mealItemsAreApproximate,
  mealItemsHaveUnresolved,
  resolveDraftMealType,
  showPieceControls,
  stripClarifyNotes,
  truncateMealPreview,
} from './mealDraft'
import type { Meal, MealItem } from '../types'

function item(partial: Partial<MealItem> = {}): MealItem {
  return {
    name: 'Тест',
    grams: 100,
    kcal: 0,
    protein: 0,
    fat: 0,
    carbs: 0,
    source: 'unknown',
    ...partial,
  }
}

describe('mealItem unresolved / approximate', () => {
  it('treats unknown as unresolved', () => {
    expect(mealItemIsUnresolved(item())).toBe(true)
    expect(mealItemsHaveUnresolved([item({ source: 'library', foodId: 'x', kcal: 10 })])).toBe(
      false,
    )
    expect(mealItemIsUnresolved(item({ source: 'estimate', kcal: 0, name: 'Вода' }))).toBe(
      false,
    )
  })

  it('marks approximate for unknown and estimate', () => {
    expect(mealItemsAreApproximate(false, [item({ source: 'unknown' })])).toBe(true)
    expect(mealItemsAreApproximate(false, [item({ source: 'estimate', kcal: 50 })])).toBe(true)
    expect(
      mealItemsAreApproximate(false, [item({ source: 'library', foodId: 'a', kcal: 50 })]),
    ).toBe(false)
    expect(
      mealItemsAreApproximate(true, [item({ source: 'library', foodId: 'a', kcal: 50 })]),
    ).toBe(true)
  })

  it('ignores blank draft rows for unresolved and approximate', () => {
    const blank = item({ name: '', source: 'unknown', kcal: 0 })
    const library = item({
      name: 'Яблоко',
      source: 'library',
      foodId: 'a',
      kcal: 52,
    })
    expect(mealItemIsUnresolved(blank)).toBe(false)
    expect(mealItemsHaveUnresolved([library, blank])).toBe(false)
    expect(mealItemsAreApproximate(false, [library, blank])).toBe(false)
  })

  it('treats dangling foodId as unresolved only without macros', () => {
    const foods = [{ id: 'live' }]
    const danglingZero = item({
      name: 'Gone',
      foodId: 'dead',
      source: 'library',
      kcal: 0,
    })
    const danglingWithMacros = item({
      name: 'Gone',
      foodId: 'dead',
      source: 'library',
      kcal: 80,
    })
    expect(mealItemIsUnresolved(danglingZero, foods)).toBe(true)
    expect(mealItemIsUnresolved(danglingWithMacros, foods)).toBe(false)
    expect(mealItemIsUnresolved(item({ foodId: 'live', source: 'library', kcal: 0 }), foods)).toBe(
      false,
    )
  })
})

describe('compareMealsByTypeThenTime', () => {
  it('orders breakfast before lunch even if created later', () => {
    const lunch: Meal = {
      id: 'l',
      date: '2026-01-01',
      mealType: 'lunch',
      rawText: '',
      items: [],
      totals: { kcal: 1, protein: 0, fat: 0, carbs: 0 },
      isApproximate: false,
      eatingOut: false,
      createdAt: 1,
    }
    const breakfast: Meal = { ...lunch, id: 'b', mealType: 'breakfast', createdAt: 99 }
    expect([lunch, breakfast].sort(compareMealsByTypeThenTime).map((m) => m.id)).toEqual([
      'b',
      'l',
    ])
  })
})

describe('groupDayMealsForList', () => {
  function meal(partial: Partial<Meal> & Pick<Meal, 'id' | 'mealType'>): Meal {
    return {
      date: '2026-01-01',
      rawText: '',
      items: [],
      totals: { kcal: 100, protein: 10, fat: 5, carbs: 8 },
      isApproximate: false,
      eatingOut: false,
      createdAt: 1,
      ...partial,
    }
  }

  it('merges snacks into one group with summed macros', () => {
    const breakfast = meal({ id: 'b', mealType: 'breakfast', totals: { kcal: 400, protein: 30, fat: 10, carbs: 40 } })
    const s1 = meal({
      id: 's1',
      mealType: 'snack',
      createdAt: 10,
      totals: { kcal: 50, protein: 1, fat: 0, carbs: 12 },
    })
    const s2 = meal({
      id: 's2',
      mealType: 'snack',
      createdAt: 20,
      isApproximate: true,
      totals: { kcal: 150, protein: 2, fat: 8, carbs: 18 },
    })
    const groups = groupDayMealsForList([breakfast, s1, s2])
    expect(groups).toHaveLength(2)
    expect(groups[0]).toMatchObject({ kind: 'single', meal: { id: 'b' } })
    expect(groups[1]).toMatchObject({
      kind: 'snacks',
      isApproximate: true,
      totals: { kcal: 200, protein: 3, fat: 8, carbs: 30 },
    })
    if (groups[1]?.kind === 'snacks') {
      expect(groups[1].meals.map((m) => m.id)).toEqual(['s1', 's2'])
    }
  })

  it('keeps a single snack as a snacks group', () => {
    const groups = groupDayMealsForList([meal({ id: 's', mealType: 'snack' })])
    expect(groups).toEqual([
      expect.objectContaining({ kind: 'snacks', meals: [expect.objectContaining({ id: 's' })] }),
    ])
  })
})

describe('formatMealClock', () => {
  it('formats local HH:MM', () => {
    const ts = new Date(2026, 7, 9, 15, 7).getTime()
    expect(formatMealClock(ts)).toMatch(/15:07/)
  })

  it('returns empty for invalid', () => {
    expect(formatMealClock(0)).toBe('')
    expect(formatMealClock(Number.NaN)).toBe('')
  })
})

describe('showPieceControls', () => {
  it('hides pieces for soft cottage serving size', () => {
    expect(
      showPieceControls({ name: 'Творог мягкий 0,1%', portionGrams: 120 }),
    ).toBe(false)
  })

  it('keeps pieces for egg / candy', () => {
    expect(showPieceControls({ name: 'Яйцо куриное', portionGrams: 55 })).toBe(true)
    expect(showPieceControls({ name: 'Карамель мягкая', portionGrams: 6 })).toBe(true)
  })
})

describe('inferSavedFoodKind / resolveDraftMealType / notes', () => {
  it('infers ingredient by default and dish for named dishes', () => {
    expect(inferSavedFoodKind('Творог')).toBe('ingredient')
    expect(inferSavedFoodKind('Омлет с сыром')).toBe('dish')
  })

  it('keeps user meal type when touched and text has no marker', () => {
    expect(
      resolveDraftMealType({
        text: 'яблоко 100 г',
        userMealType: 'snack',
        mealTypeTouched: true,
        parsedMealType: 'breakfast',
        extractFromText: () => ({ mealType: null }),
      }),
    ).toBe('snack')
  })

  it('strips clarify notes', () => {
    expect(
      stripClarifyNotes('Уточните продукт — в справочнике несколько похожих. Всё ок.'),
    ).toBe('Всё ок.')
  })

  it('truncates long previews', () => {
    const long = 'a'.repeat(80)
    expect(truncateMealPreview(long, 72).endsWith('…')).toBe(true)
    expect(truncateMealPreview(long, 72).length).toBe(72)
  })

  it('cuts on item boundaries instead of mid-name', () => {
    const preview =
      'Багет чесночный, Яйцо куриное, Намазка из семги и сыра, Кофе, Молоко 2,5%'
    // Old 72-char hard cut produced «Молоко 2,…»
    expect(truncateMealPreview(preview, 72)).toBe(
      'Багет чесночный, Яйцо куриное, Намазка из семги и сыра, Кофе…',
    )
    expect(truncateMealPreview(preview)).toBe(preview)
  })
})
