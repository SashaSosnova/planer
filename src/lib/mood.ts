import type { MoodLevel } from '../types'

export const MOOD_OPTIONS: { value: MoodLevel; label: string }[] = [
  { value: 1, label: 'Тяжело' },
  { value: 2, label: 'Так себе' },
  { value: 3, label: 'Норм' },
  { value: 4, label: 'Хорошо' },
  { value: 5, label: 'Супер' },
]

export function moodLabel(level: MoodLevel | undefined): string {
  if (level == null) return '—'
  return MOOD_OPTIONS.find((o) => o.value === level)?.label ?? '—'
}
