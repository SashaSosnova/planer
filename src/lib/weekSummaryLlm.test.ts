import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WeekStats } from './dayStats'
import {
  getCachedWeekSummary,
  getWeekNutritionSummary,
  localWeekNutritionNote,
  weekSummaryFingerprint,
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

  it('returns cached text while fingerprint matches', async () => {
    const w = week()
    const fp = weekSummaryFingerprint(w)
    localStorage.setItem(
      'planer-week-summaries-v2',
      JSON.stringify({
        '2026-07-06': { text: 'Уже сохранённый итог недели.', fingerprint: fp },
      }),
    )
    const spy = vi.spyOn(await import('./deepseek'), 'deepseekJson')
    const text = await getWeekNutritionSummary(w)
    expect(text).toBe('Уже сохранённый итог недели.')
    expect(getCachedWeekSummary('2026-07-06', fp)).toBe('Уже сохранённый итог недели.')
    expect(spy).not.toHaveBeenCalled()
  })

  it('regenerates when week data changes', async () => {
    vi.spyOn(await import('./deepseek'), 'isDeepseekConfigured').mockReturnValue(false)
    const firstWeek = week()
    const first = await getWeekNutritionSummary(firstWeek)
    expect(first).toBe(localWeekNutritionNote(firstWeek))

    const changed = week({
      totals: { kcal: 50, protein: 0, fat: 0, carbs: 0 },
      mealSnippets: ['changed'],
    })
    const second = await getWeekNutritionSummary(changed)
    expect(second).toBe(localWeekNutritionNote(changed))
    expect(second).not.toBe(first)
  })
})
