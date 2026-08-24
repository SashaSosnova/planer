import { deepseekJson, isDeepseekConfigured } from './deepseek'
import type { WeekStats } from './dayStats'
import { buildWeekReview, weekReviewFacts } from './weekReview'

/**
 * Permanent per-week reports (written once when the week first closes).
 * Bump version to drop bad frozen copy (grocery lists, “carbs dominate”, shame).
 */
const CACHE_KEY = 'planer-week-summaries-v5'

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
    // ignore
  }
  return {}
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
  return buildWeekReview(week).text
}

function isUsableWeekSummary(text: string): boolean {
  const t = text.trim()
  if (t.length < 40 || t.length > 900) return false
  if (!/Хорошо:|Нормально:|Можно подкрутить:/.test(t)) return false
  if (/углевод\w*\s+преобладают/i.test(t)) return false
  if (/баланс БЖУ|белков \d/i.test(t)) return false
  return true
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

    if (isDeepseekConfigured()) {
      try {
        const parsed = await deepseekJson<{ summary: string }>(`Итог недели для трекера похудения. Спокойный коучинг, без стыда.

Неделя: ${week.label}

Пиши ТОЛЬКО в формате (пропусти секцию, если нечего сказать):
Хорошо: … Нормально: … Можно подкрутить: …

Правила:
- Не перечисляй меню и напитки. Кофе, чай, молоко — не тема.
- Не пиши недельные суммы БЖУ и не делай вывод «углеводы преобладают». Углеводы при калориях около цели — норма.
- Сладкое в бюджете (~300 ккал/день) — часть рациона, не промах и не «съела сладкое — ошиблась».
- ~5000 шагов — обычная городская неделя, не мало.
- Подкрутки — что добавить (овощи, белок, прогулка), не голод и не запреты.
- Опирайся на черновик: можно чуть живее перефразировать, смысл не меняй. 2–4 коротких предложения суммарно.

Факты:
${weekReviewFacts(week)}

Верни JSON: { "summary": "текст в формате Хорошо/Нормально/Можно подкрутить" }`)
        const summary = String(parsed.summary ?? '').trim()
        if (isUsableWeekSummary(summary)) text = summary
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
