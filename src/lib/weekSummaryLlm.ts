import { deepseekJson, isDeepseekConfigured } from './deepseek'
import type { WeekStats } from './dayStats'

/** Permanent per-week reports (written once when the week first closes). */
const CACHE_KEY = 'planer-week-summaries-v3'
const LEGACY_CACHE_KEY = 'planer-week-summaries-v2'

type Cached = {
  text: string
  /** ISO timestamp when the report was frozen. */
  savedAt?: string
}

const inflight = new Map<string, Promise<string>>()

function loadCache(): Record<string, Cached> {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (raw) return JSON.parse(raw) as Record<string, Cached>
  } catch {
    // fall through to legacy
  }
  return migrateLegacyCache()
}

function migrateLegacyCache(): Record<string, Cached> {
  try {
    const raw = localStorage.getItem(LEGACY_CACHE_KEY)
    if (!raw) return {}
    const legacy = JSON.parse(raw) as Record<string, { text?: string }>
    const next: Record<string, Cached> = {}
    for (const [weekStart, entry] of Object.entries(legacy)) {
      const text = entry?.text?.trim()
      if (text) next[weekStart] = { text, savedAt: new Date().toISOString() }
    }
    if (Object.keys(next).length) {
      saveCache(next)
      localStorage.removeItem(LEGACY_CACHE_KEY)
    }
    return next
  } catch {
    return {}
  }
}

function saveCache(map: Record<string, Cached>): void {
  localStorage.setItem(CACHE_KEY, JSON.stringify(map))
}

/** Sync read of a frozen week report (never invalidated by later edits). */
export function getCachedWeekSummary(weekStart: string): string | null {
  const text = loadCache()[weekStart]?.text?.trim()
  return text || null
}

export function localWeekNutritionNote(week: WeekStats): string {
  const daysWithFood = week.days.filter((d) => d.meals.length > 0).length || 1
  const avg = Math.round(week.totals.kcal / daysWithFood)
  const p = Math.round(week.totals.protein / daysWithFood)
  const f = Math.round(week.totals.fat / daysWithFood)
  const c = Math.round(week.totals.carbs / daysWithFood)
  const outDays = week.days.filter((d) => d.meals.some((m) => m.eatingOut)).length
  const parts = [`В среднем ${avg} ккал/день (Б ${p} · Ж ${f} · У ${c}).`]
  if (outDays > 0) parts.push(`Вне дома: ${outDays} дн.`)
  if (week.weightDelta != null) {
    const sign = week.weightDelta > 0 ? '+' : ''
    parts.push(`Вес ${sign}${week.weightDelta} кг.`)
  }
  return parts.join(' ')
}

function freezeWeekSummary(weekStart: string, text: string): void {
  const cache = loadCache()
  if (cache[weekStart]?.text?.trim()) return
  cache[weekStart] = { text, savedAt: new Date().toISOString() }
  saveCache(cache)
}

/**
 * One-shot summary for a completed week.
 * First call generates (LLM if available) and freezes the text forever;
 * later opens only read the saved report — no re-analysis.
 */
export async function getWeekNutritionSummary(week: WeekStats): Promise<string> {
  const cached = getCachedWeekSummary(week.weekStart)
  if (cached) return cached

  const pending = inflight.get(week.weekStart)
  if (pending) return pending

  const task = (async () => {
    let text = localWeekNutritionNote(week)

    if (isDeepseekConfigured() && week.mealSnippets.length > 0) {
      try {
        const parsed = await deepseekJson<{ summary: string }>(`Краткая сводка питания за неделю для трекера похудения.
Это итоговый отчёт за закрытую неделю — пиши коротко и по делу.

Неделя: ${week.label}
Итого ккал: ${Math.round(week.totals.kcal)} из цели ${week.kcalGoal}
Белки/жиры/углеводы: ${Math.round(week.totals.protein)} / ${Math.round(week.totals.fat)} / ${Math.round(week.totals.carbs)}
Изменение веса: ${week.weightDelta != null ? `${week.weightDelta} кг` : 'нет данных'}
Средние шаги: ${week.avgSteps ?? 'нет данных'}

Приёмы пищи:
${week.mealSnippets.slice(0, 40).join('\n')}

Верни JSON: { "summary": "2–3 коротких предложения на русском: что ели чаще, баланс БЖУ, привычки вне дома, без нравоучений" }`)
        const summary = String(parsed.summary ?? '').trim()
        if (summary) text = summary
      } catch {
        // keep local note
      }
    }

    freezeWeekSummary(week.weekStart, text)
    return getCachedWeekSummary(week.weekStart) ?? text
  })().finally(() => {
    inflight.delete(week.weekStart)
  })

  inflight.set(week.weekStart, task)
  return task
}
