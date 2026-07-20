import { deepseekJson, isDeepseekConfigured } from './deepseek'
import type { WeekStats } from './dayStats'

const CACHE_KEY = 'planer-week-summaries-v2'

type Cached = {
  text: string
  fingerprint: string
}

function loadCache(): Record<string, Cached> {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as Record<string, Cached>
  } catch {
    return {}
  }
}

function saveCache(map: Record<string, Cached>): void {
  localStorage.setItem(CACHE_KEY, JSON.stringify(map))
}

/** Invalidate cache when meals / weight / steps for the week change. */
export function weekSummaryFingerprint(week: WeekStats): string {
  return [
    Math.round(week.totals.kcal),
    Math.round(week.totals.protein),
    Math.round(week.totals.fat),
    Math.round(week.totals.carbs),
    week.weightDelta ?? 'x',
    week.avgSteps ?? 'x',
    week.mealSnippets.length,
    week.mealSnippets.slice(0, 24).join('|'),
  ].join('::')
}

/** Sync read — only if fingerprint still matches. */
export function getCachedWeekSummary(
  weekStart: string,
  fingerprint?: string,
): string | null {
  const hit = loadCache()[weekStart]
  const text = hit?.text?.trim()
  if (!text) return null
  if (fingerprint != null && hit.fingerprint !== fingerprint) return null
  return text
}

export function localWeekNutritionNote(week: WeekStats): string {
  const daysWithFood = week.days.filter((d) => d.meals.length > 0).length || 1
  const avg = Math.round(week.totals.kcal / daysWithFood)
  const p = Math.round(week.totals.protein / daysWithFood)
  const f = Math.round(week.totals.fat / daysWithFood)
  const c = Math.round(week.totals.carbs / daysWithFood)
  const outDays = week.days.filter((d) => d.meals.some((m) => m.eatingOut)).length
  const parts = [
    `В среднем ${avg} ккал/день (Б ${p} · Ж ${f} · У ${c}).`,
  ]
  if (outDays > 0) parts.push(`Вне дома: ${outDays} дн.`)
  if (week.weightDelta != null) {
    const sign = week.weightDelta > 0 ? '+' : ''
    parts.push(`Вес ${sign}${week.weightDelta} кг.`)
  }
  return parts.join(' ')
}

/**
 * Summary for a completed week. Cached while the week fingerprint is unchanged;
 * regenerates when meals / weight / steps for that week change.
 */
export async function getWeekNutritionSummary(week: WeekStats): Promise<string> {
  const fingerprint = weekSummaryFingerprint(week)
  const cached = getCachedWeekSummary(week.weekStart, fingerprint)
  if (cached) return cached

  let text = localWeekNutritionNote(week)

  if (isDeepseekConfigured() && week.mealSnippets.length > 0) {
    try {
      const parsed = await deepseekJson<{ summary: string }>(`Краткая сводка питания за неделю для трекера похудения.

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

  const cache = loadCache()
  cache[week.weekStart] = { text, fingerprint }
  saveCache(cache)
  return text
}
