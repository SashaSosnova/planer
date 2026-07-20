import { describe, expect, it } from 'vitest'
import {
  buildMealIdeasPrompt,
  frequentFoodsForSlot,
  frequentMealPatterns,
  habitualPatternsAsIdeas,
  isPlausibleIdeaForSlot,
  parseMealIdeasResponse,
  recentFoodTitles,
} from './mealSuggestionsLlm'
import type { AppData, Meal } from '../types'

const emptyPrefs = { likes: [] as string[], dislikes: [] as string[], canCook: [] as string[] }

function meal(partial: Partial<Meal> & Pick<Meal, 'id' | 'date'>): Meal {
  return {
    mealType: 'lunch',
    rawText: '',
    items: [{ name: 'Курица', grams: 150, kcal: 200, protein: 30, fat: 8, carbs: 0, source: 'estimate' }],
    totals: { kcal: 200, protein: 30, fat: 8, carbs: 0 },
    isApproximate: false,
    eatingOut: false,
    createdAt: 1,
    ...partial,
  }
}

describe('isPlausibleIdeaForSlot', () => {
  it('rejects pasta for breakfast', () => {
    expect(
      isPlausibleIdeaForSlot(
        { title: 'Паста с кабачком', ingredients: 'паста, кабачок' },
        'breakfast',
        ['Сырники'],
        ['Творог', 'Яйца'],
      ),
    ).toBe(false)
  })

  it('allows syrniki-style breakfast', () => {
    expect(
      isPlausibleIdeaForSlot(
        { title: 'Сырники со сметаной', ingredients: 'творог, яйцо' },
        'breakfast',
        [],
        ['Творог'],
      ),
    ).toBe(true)
  })

  it('allows pasta for lunch', () => {
    expect(
      isPlausibleIdeaForSlot(
        { title: 'Паста с кабачком', ingredients: 'паста, кабачок' },
        'lunch',
        [],
        [],
      ),
    ).toBe(true)
  })
})

describe('buildMealIdeasPrompt', () => {
  it('locks breakfast to breakfast-style food', () => {
    const prompt = buildMealIdeasPrompt({
      slot: 'breakfast',
      prefs: emptyPrefs,
      todayLines: [],
      recentInSlot: ['Сырники', 'Яйца'],
      habitualFoods: ['Творог', 'Яйца'],
      habitualMeals: [
        {
          title: 'Сырники',
          ingredients: 'Творог',
          kcal: 380,
          protein: 22,
          fat: 14,
          carbs: 40,
          count: 3,
          fromSlots: ['breakfast'],
        },
      ],
      library: [],
      remainingKcal: 1600,
      maxKcal: 450,
      targetKcal: 380,
      limit: 3,
    })
    expect(prompt).toContain('ЖЁСТКО про завтрак')
    expect(prompt).toContain('пасту')
    expect(prompt).toContain('Сырники')
    expect(prompt).toContain('недавно на завтрак')
  })
})

describe('parseMealIdeasResponse', () => {
  it('drops breakfast pasta from LLM even if returned', () => {
    const list = parseMealIdeasResponse(
      {
        ideas: [
          {
            title: 'Паста с кабачком',
            ingredients: 'паста, кабачок',
            recipe: 'отвари',
            kcal: 400,
            protein: 14,
            fat: 12,
            carbs: 55,
          },
          {
            title: 'Сырники',
            ingredients: 'творог',
            recipe: 'жарь',
            kcal: 380,
            protein: 22,
            fat: 14,
            carbs: 40,
          },
        ],
      },
      'breakfast',
      emptyPrefs,
      3,
      500,
      [],
      ['Сырники'],
      ['Творог', 'Яйца'],
    )
    expect(list.every((x) => !/паст/i.test(x.title))).toBe(true)
    expect(list.some((x) => /Сырники|Яйц|Творог|Овсян|Блин|Омлет/i.test(x.title))).toBe(true)
  })
})

describe('frequentMealPatterns', () => {
  it('groups repeating combos for dinner from lunch history', () => {
    const strips = [
      { name: 'Стрипсы куриные', grams: 150, kcal: 320, protein: 30, fat: 16, carbs: 12, source: 'estimate' as const },
      { name: 'Салат', grams: 120, kcal: 60, protein: 2, fat: 3, carbs: 6, source: 'estimate' as const },
    ]
    const data = {
      meals: [
        meal({
          id: '1',
          date: '2026-07-10',
          mealType: 'lunch',
          items: strips,
          totals: { kcal: 380, protein: 32, fat: 19, carbs: 18 },
        }),
        meal({
          id: '2',
          date: '2026-07-12',
          mealType: 'lunch',
          items: strips,
          totals: { kcal: 400, protein: 34, fat: 20, carbs: 18 },
        }),
      ],
      foods: [],
      weights: [],
      measurements: [],
      steps: [],
      dayNotes: [],
      periodStarts: [],
    } as AppData

    const patterns = frequentMealPatterns(data, '2026-07-20', 'dinner')
    expect(patterns[0]!.title).toMatch(/Стрипсы/i)
    const ideas = habitualPatternsAsIdeas(patterns, 'dinner', 450)
    expect(ideas.some((x) => /Стрипсы/i.test(x.title))).toBe(true)
  })

  it('ignores one-off meals and merges с/+ titles', () => {
    const data = {
      meals: [
        meal({
          id: '1',
          date: '2026-07-10',
          mealType: 'lunch',
          items: [
            {
              name: 'Бефстроганов с пюре',
              grams: 300,
              kcal: 500,
              protein: 30,
              fat: 20,
              carbs: 40,
              source: 'estimate',
            },
          ],
          totals: { kcal: 500, protein: 30, fat: 20, carbs: 40 },
        }),
        meal({
          id: '2',
          date: '2026-07-12',
          mealType: 'dinner',
          items: [
            {
              name: 'Бефстроганов',
              grams: 200,
              kcal: 350,
              protein: 28,
              fat: 18,
              carbs: 10,
              source: 'estimate',
            },
            {
              name: 'Пюре',
              grams: 150,
              kcal: 150,
              protein: 3,
              fat: 5,
              carbs: 25,
              source: 'estimate',
            },
          ],
          totals: { kcal: 500, protein: 31, fat: 23, carbs: 35 },
        }),
        meal({
          id: '3',
          date: '2026-07-13',
          mealType: 'lunch',
          items: [
            {
              name: 'Бефстроганов',
              grams: 200,
              kcal: 350,
              protein: 28,
              fat: 18,
              carbs: 10,
              source: 'estimate',
            },
            {
              name: 'Пюре',
              grams: 150,
              kcal: 150,
              protein: 3,
              fat: 5,
              carbs: 25,
              source: 'estimate',
            },
          ],
          totals: { kcal: 500, protein: 31, fat: 23, carbs: 35 },
        }),
      ],
      foods: [],
      weights: [],
      measurements: [],
      steps: [],
      dayNotes: [],
      periodStarts: [],
    } as AppData

    // One-off single-line "с пюре" alone would not qualify; the two-item combo appears twice
    const patterns = frequentMealPatterns(data, '2026-07-20', 'lunch')
    const beef = patterns.filter((p) => /бефстроганов/i.test(p.title))
    expect(beef).toHaveLength(1)
    expect(beef[0]!.count).toBe(2)
  })
})

describe('frequentFoodsForSlot', () => {
  it('keeps snack foods out of breakfast frequency', () => {
    const data = {
      meals: [
        meal({
          id: '1',
          date: '2026-07-18',
          mealType: 'breakfast',
          items: [
            { name: 'Сырники', grams: 180, kcal: 360, protein: 22, fat: 14, carbs: 38, source: 'estimate' },
          ],
        }),
        meal({
          id: '2',
          date: '2026-07-19',
          mealType: 'lunch',
          items: [
            { name: 'Паста', grams: 200, kcal: 400, protein: 14, fat: 10, carbs: 60, source: 'estimate' },
          ],
        }),
      ],
      foods: [],
      weights: [],
      measurements: [],
      steps: [],
      dayNotes: [],
      periodStarts: [],
    } as AppData
    expect(frequentFoodsForSlot(data, '2026-07-20', 'breakfast')).toEqual(['Сырники'])
    expect(recentFoodTitles(data, '2026-07-20', 10, 'breakfast')).toEqual(['Сырники'])
  })
})
