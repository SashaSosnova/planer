export type DayPrompt = {
  /** Shown above the answer field on Today */
  question: string
}

/**
 * Friend-style questions about the day — easy to answer, help recall the day later.
 */
export const DAY_PROMPTS: DayPrompt[] = [
  { question: 'Ну что, как прошёл день?' },
  { question: 'Что сегодня было классного?' },
  { question: 'Как провела утро?' },
  { question: 'Что делала после работы?' },
  { question: 'Чем сегодня занималась большую часть дня?' },
  { question: 'Что сегодня получилось?' },
  { question: 'Что сегодня было самым тяжёлым?' },
  { question: 'Тебя сегодня что-то бесило?' },
  { question: 'Сильно устала сегодня?' },
  { question: 'Ты сегодня дома была или куда-то выходила?' },
  { question: 'Как прошёл вечер?' },
  { question: 'Что сегодня сделала в первую очередь утром?' },
  { question: 'Был сегодня хоть один спокойный момент?' },
  { question: 'Что сегодня отложила на потом?' },
  { question: 'Если коротко — день был лёгкий или тяжёлый?' },
]

/** Stable prompt for a calendar day (same day → same question). */
export function dayPromptForDate(isoDate: string): DayPrompt {
  const [y, m, d] = isoDate.split('-').map(Number)
  if (!y || !m || !d) return DAY_PROMPTS[0]!
  const utc = Date.UTC(y, m - 1, d)
  const start = Date.UTC(y, 0, 0)
  const dayOfYear = Math.round((utc - start) / 86_400_000)
  const idx = ((dayOfYear % DAY_PROMPTS.length) + DAY_PROMPTS.length) % DAY_PROMPTS.length
  return DAY_PROMPTS[idx]!
}
