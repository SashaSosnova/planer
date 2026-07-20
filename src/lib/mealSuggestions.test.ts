import { describe, expect, it } from 'vitest'
import {
  applyTasteFeedback,
  canonicalMealKey,
  filterIdeasByBudget,
  formatIdeaMacros,
  mealSuggestions,
  mixMealIdeas,
  rankMealIdeas,
  slotKcalBudget,
} from './mealSuggestions'

const empty = { likes: [] as string[], dislikes: [] as string[], canCook: [] as string[] }

describe('mealSuggestions', () => {
  it('returns breakfast ideas in the morning', () => {
    const list = mealSuggestions(new Date(2026, 6, 15, 9, 0, 0), empty)
    expect(list.length).toBeGreaterThan(0)
    expect(list[0]!.title).toMatch(/Овсянка|Яйца|Творог|Йогурт|Тост|Сырники/)
    expect(list[0]!.recipe.length).toBeGreaterThan(0)
    expect(list[0]!.kcal).toBeGreaterThan(0)
  })

  it('uses explicit slot even if time of day differs', () => {
    const list = mealSuggestions(new Date(2026, 6, 15, 9, 0, 0), empty, 3, 'dinner')
    expect(list[0]!.title).toMatch(/Омлет|Творог|Рыба|овощи|салат|Суп/i)
  })

  it('skips disliked titles', () => {
    const list = mealSuggestions(new Date(2026, 6, 15, 9, 0, 0), {
      ...empty,
      dislikes: ['Овсянка с ягодами'],
    })
    expect(list.every((s) => s.title !== 'Овсянка с ягодами')).toBe(true)
  })

  it('puts liked titles first', () => {
    const list = mealSuggestions(new Date(2026, 6, 15, 9, 0, 0), {
      ...empty,
      likes: ['Сырники'],
    })
    expect(list[0]!.title).toBe('Сырники')
  })

  it('filters local lunch ideas by kcal budget', () => {
    const list = mealSuggestions(new Date(2026, 6, 15, 13, 0, 0), empty, 10, 'lunch', 450)
    expect(list.length).toBeGreaterThan(0)
    expect(list.every((s) => s.kcal <= 450 * 1.05)).toBe(true)
  })
})

describe('slotKcalBudget', () => {
  it('does not allow lunch to take almost all remaining kcal', () => {
    const b = slotKcalBudget(1800, 800, 'lunch')
    expect(b).not.toBeNull()
    expect(b!.remaining).toBe(1000)
    expect(b!.maxKcal).toBeLessThanOrEqual(500)
    expect(b!.maxKcal).toBeGreaterThan(300)
  })

  it('allows dinner a larger share of remaining', () => {
    const lunch = slotKcalBudget(1800, 800, 'lunch')!
    const dinner = slotKcalBudget(1800, 800, 'dinner')!
    expect(dinner.maxKcal).toBeGreaterThan(lunch.maxKcal)
  })
})

describe('filterIdeasByBudget', () => {
  it('drops ideas over the ceiling', () => {
    const out = filterIdeasByBudget(
      [
        { id: '1', title: 'A', kcal: 400, protein: 1, fat: 1, carbs: 1, ingredients: '', recipe: '' },
        { id: '2', title: 'B', kcal: 800, protein: 1, fat: 1, carbs: 1, ingredients: '', recipe: '' },
      ],
      450,
    )
    expect(out.map((x) => x.title)).toEqual(['A'])
  })
})

describe('canonicalMealKey', () => {
  it('treats с / + / order as the same plate', () => {
    expect(canonicalMealKey('Бефстроганов с пюре')).toBe(canonicalMealKey('бефстроганов + пюре'))
    expect(canonicalMealKey('пюре + бефстроганов')).toBe(canonicalMealKey('Бефстроганов с пюре'))
  })
})

describe('rankMealIdeas / mixMealIdeas', () => {
  const idea = (title: string, kcal = 400) => ({
    id: title,
    title,
    kcal,
    protein: 20,
    fat: 10,
    carbs: 30,
    ingredients: title,
    recipe: 'x',
  })

  it('dedupes near-identical titles', () => {
    const list = rankMealIdeas(
      [idea('Бефстроганов с пюре'), idea('бефстроганов + пюре'), idea('Курица + гречка')],
      empty,
      3,
    )
    expect(list).toHaveLength(2)
    expect(list.map((x) => x.title)).toContain('Курица + гречка')
  })

  it('keeps at most one habitual idea when novel options exist', () => {
    const list = mixMealIdeas(
      [idea('Бефстроганов с пюре'), idea('Стрипсы + салат'), idea('Суп и хлеб')],
      [idea('Паста с курицей'), idea('Рис + индейка + овощи'), idea('Рыба + овощи')],
      empty,
      3,
      1,
    )
    expect(list).toHaveLength(3)
    const habTitles = new Set(['Бефстроганов с пюре', 'Стрипсы + салат', 'Суп и хлеб'])
    expect(list.filter((x) => habTitles.has(x.title))).toHaveLength(1)
    expect(list.filter((x) => !habTitles.has(x.title)).length).toBeGreaterThanOrEqual(2)
  })
})

describe('formatIdeaMacros', () => {
  it('formats approximate macros line', () => {
    expect(formatIdeaMacros({ kcal: 300.2, protein: 22.4, fat: 18.1, carbs: 8.9 })).toBe(
      '≈ 300 ккал · Б 22 · Ж 18 · У 9',
    )
  })
})

describe('applyTasteFeedback', () => {
  it('moves title into likes and out of dislikes', () => {
    const next = applyTasteFeedback(
      { likes: [], dislikes: ['Сырники'], canCook: [] },
      'Сырники',
      'like',
    )
    expect(next.likes).toContain('Сырники')
    expect(next.dislikes).not.toContain('Сырники')
  })

  it('records dislike', () => {
    const next = applyTasteFeedback(
      { likes: ['Сырники'], dislikes: [], canCook: [] },
      'Сырники',
      'dislike',
    )
    expect(next.dislikes).toContain('Сырники')
    expect(next.likes).not.toContain('Сырники')
  })
})
