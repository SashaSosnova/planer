import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WeekStats } from './dayStats'
import {
  getCachedWeekSummary,
  getWeekNutritionSummary,
  localWeekNutritionNote,
} from './weekSummaryLlm'

const store = new Map<string, string>()

const week = (overrides: Partial<WeekStats> = {}): WeekStats => ({
  weekStart: '2026-07-06',
  weekEnd: '2026-07-12',
  label: '6–12 июля',
  days: [],
  totals: { kcal: 10000, protein: 400, fat: 300, carbs: 900 },
  kcalGoal: 12600,
  mealSnippets: ['2026-07-06 lunch: курица (500 ккал)'],
  ...overrides,
})

describe('week summary cache', () => {
  beforeEach(() => {
    store.clear()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v)
      },
      removeItem: (k: string) => {
        store.delete(k)
      },
      clear: () => {
        store.clear()
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('returns frozen text and never calls LLM again', async () => {
    localStorage.setItem(
      'planer-week-summaries-v3',
      JSON.stringify({
        '2026-07-06': { text: 'Уже сохранённый итог недели.', savedAt: '2026-07-13T08:00:00.000Z' },
      }),
    )
    const spy = vi.spyOn(await import('./deepseek'), 'deepseekJson')
    const text = await getWeekNutritionSummary(week())
    expect(text).toBe('Уже сохранённый итог недели.')
    expect(getCachedWeekSummary('2026-07-06')).toBe('Уже сохранённый итог недели.')
    expect(spy).not.toHaveBeenCalled()
  })

  it('does not regenerate when week data changes after freeze', async () => {
    vi.spyOn(await import('./deepseek'), 'isDeepseekConfigured').mockReturnValue(false)
    const firstWeek = week()
    const first = await getWeekNutritionSummary(firstWeek)
    expect(first).toBe(localWeekNutritionNote(firstWeek))

    const changed = week({
      totals: { kcal: 50, protein: 0, fat: 0, carbs: 0 },
      mealSnippets: ['changed'],
    })
    const second = await getWeekNutritionSummary(changed)
    expect(second).toBe(first)
    expect(getCachedWeekSummary('2026-07-06')).toBe(first)
  })

  it('dedupes concurrent first-time generation', async () => {
    vi.spyOn(await import('./deepseek'), 'isDeepseekConfigured').mockReturnValue(false)
    const w = week()
    const [a, b] = await Promise.all([getWeekNutritionSummary(w), getWeekNutritionSummary(w)])
    expect(a).toBe(b)
    expect(a).toBe(localWeekNutritionNote(w))
  })

  it('migrates legacy v2 cache without fingerprint checks', async () => {
    localStorage.setItem(
      'planer-week-summaries-v2',
      JSON.stringify({
        '2026-07-06': { text: 'Старый кэш.', fingerprint: 'stale' },
      }),
    )
    const spy = vi.spyOn(await import('./deepseek'), 'deepseekJson')
    const text = await getWeekNutritionSummary(week())
    expect(text).toBe('Старый кэш.')
    expect(spy).not.toHaveBeenCalled()
    expect(localStorage.getItem('planer-week-summaries-v2')).toBeNull()
    expect(getCachedWeekSummary('2026-07-06')).toBe('Старый кэш.')
  })
})
