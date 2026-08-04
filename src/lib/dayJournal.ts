import type { DayMood, DayNote } from '../types'

export const DAY_JOURNAL_LINE_MAX = 120
/** Max items in gratitude / highlights lists. */
export const DAY_JOURNAL_LIST_MAX = 12
/** Snapshot stored in `DayNote.text` for preview / legacy consumers. */
export const DAY_JOURNAL_TEXT_MAX = 800

export type DayJournalDraft = {
  mood?: DayMood
  grateful: string[]
  greatDay: string
  affirmation: string
  highlights: string[]
  kindness: string
  betterTomorrow: string
}

export const MOOD_OPTIONS: { id: DayMood; label: string }[] = [
  { id: 'hard', label: 'тяжело' },
  { id: 'meh', label: 'так себе' },
  { id: 'ok', label: 'нормально' },
  { id: 'good', label: 'хорошо' },
  { id: 'easy', label: 'легко' },
]

export function moodLabel(mood: DayMood | undefined): string | null {
  if (!mood) return null
  return MOOD_OPTIONS.find((m) => m.id === mood)?.label ?? null
}

export function cleanJournalLine(raw: string | undefined | null): string {
  return String(raw ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, DAY_JOURNAL_LINE_MAX)
}

export function cleanJournalLines(
  raw: unknown,
  max = DAY_JOURNAL_LIST_MAX,
): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const item of raw) {
    const line = cleanJournalLine(typeof item === 'string' ? item : String(item ?? ''))
    if (!line) continue
    out.push(line)
    if (out.length >= max) break
  }
  return out
}

/** Draft list → textarea (one item per line). */
export function listToText(lines: string[]): string {
  return lines.join('\n')
}

/** Textarea → draft list (keeps blank lines while typing). */
export function textToList(text: string, max = DAY_JOURNAL_LIST_MAX): string[] {
  const raw = text.replace(/\r\n/g, '\n').split('\n')
  if (raw.length > max) return raw.slice(0, max)
  return raw
}

export function emptyJournalDraft(): DayJournalDraft {
  return {
    grateful: [],
    greatDay: '',
    affirmation: '',
    highlights: [],
    kindness: '',
    betterTomorrow: '',
  }
}

/** Lift legacy twitter-style note into structured fields. */
export function migrateLegacyNote(note: DayNote): DayJournalDraft {
  const draft = emptyJournalDraft()
  draft.mood = note.mood
  draft.grateful = cleanJournalLines(note.grateful)
  draft.greatDay = cleanJournalLine(note.greatDay)
  draft.affirmation = cleanJournalLine(note.affirmation)
  draft.highlights = cleanJournalLines(note.highlights)
  draft.kindness = cleanJournalLine(note.kindness)
  draft.betterTomorrow = cleanJournalLine(note.betterTomorrow)

  const hasStructured =
    draft.grateful.length > 0 ||
    Boolean(draft.greatDay) ||
    Boolean(draft.affirmation) ||
    draft.highlights.length > 0 ||
    Boolean(draft.kindness) ||
    Boolean(draft.betterTomorrow) ||
    Boolean(draft.mood)

  if (!hasStructured && note.text.trim()) {
    const line = cleanJournalLine(note.text)
    if (line) draft.highlights = [line]
  }
  return draft
}

export function draftFromNote(note: DayNote | null | undefined): DayJournalDraft {
  if (!note) return emptyJournalDraft()
  return migrateLegacyNote(note)
}

export function isJournalDraftEmpty(draft: DayJournalDraft): boolean {
  return (
    !draft.mood &&
    !draft.grateful.some((s) => s.trim()) &&
    !draft.greatDay.trim() &&
    !draft.affirmation.trim() &&
    !draft.highlights.some((s) => s.trim()) &&
    !draft.kindness.trim() &&
    !draft.betterTomorrow.trim()
  )
}

export function buildDayNoteText(draft: DayJournalDraft): string {
  const parts: string[] = []
  const mood = moodLabel(draft.mood)
  if (mood) parts.push(`День: ${mood}`)

  const grateful = draft.grateful.map(cleanJournalLine).filter(Boolean)
  if (grateful.length) parts.push(`Благодарю: ${grateful.join('; ')}`)

  const great = cleanJournalLine(draft.greatDay)
  if (great) parts.push(`Сделает день: ${great}`)

  const aff = cleanJournalLine(draft.affirmation)
  if (aff) parts.push(`Установка: ${aff}`)

  const hi = draft.highlights.map(cleanJournalLine).filter(Boolean)
  if (hi.length) parts.push(`События: ${hi.join('; ')}`)

  const kind = cleanJournalLine(draft.kindness)
  if (kind) parts.push(`Для других: ${kind}`)

  const better = cleanJournalLine(draft.betterTomorrow)
  if (better) parts.push(`Завтра лучше: ${better}`)

  return parts.join('\n').slice(0, DAY_JOURNAL_TEXT_MAX)
}

export function draftToNoteFields(draft: DayJournalDraft): {
  mood?: DayMood
  grateful?: string[]
  greatDay?: string
  affirmation?: string
  highlights?: string[]
  kindness?: string
  betterTomorrow?: string
  text: string
} {
  const grateful = draft.grateful.map(cleanJournalLine).filter(Boolean)
  const highlights = draft.highlights.map(cleanJournalLine).filter(Boolean)
  const greatDay = cleanJournalLine(draft.greatDay)
  const affirmation = cleanJournalLine(draft.affirmation)
  const kindness = cleanJournalLine(draft.kindness)
  const betterTomorrow = cleanJournalLine(draft.betterTomorrow)
  return {
    ...(draft.mood ? { mood: draft.mood } : {}),
    ...(grateful.length ? { grateful } : {}),
    ...(greatDay ? { greatDay } : {}),
    ...(affirmation ? { affirmation } : {}),
    ...(highlights.length ? { highlights } : {}),
    ...(kindness ? { kindness } : {}),
    ...(betterTomorrow ? { betterTomorrow } : {}),
    text: buildDayNoteText(draft),
  }
}

export function journalPreview(note: DayNote): string {
  const draft = migrateLegacyNote(note)
  const hi = draft.highlights.map(cleanJournalLine).filter(Boolean)
  if (hi[0]) return hi[0]
  const g = draft.grateful.map(cleanJournalLine).filter(Boolean)
  if (g[0]) return g[0]
  if (draft.greatDay.trim()) return cleanJournalLine(draft.greatDay)
  const mood = moodLabel(draft.mood)
  if (mood) return mood
  return note.text.trim().split('\n')[0] || 'запись'
}

export function isDayMood(v: unknown): v is DayMood {
  return v === 'hard' || v === 'meh' || v === 'ok' || v === 'good' || v === 'easy'
}
