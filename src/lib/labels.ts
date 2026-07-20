import type { MealType } from '../types'

export const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: 'Завтрак',
  lunch: 'Обед',
  dinner: 'Ужин',
  snack: 'Перекус',
}

export const MEAL_TYPE_ORDER: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack']

export function defaultMealTypeForNow(): MealType {
  const h = new Date().getHours()
  if (h < 11) return 'breakfast'
  if (h < 16) return 'lunch'
  if (h < 21) return 'dinner'
  return 'snack'
}

export function coerceMealType(value: unknown, fallback: MealType = 'snack'): MealType {
  if (value === 'breakfast' || value === 'lunch' || value === 'dinner' || value === 'snack') {
    return value
  }
  return fallback
}

/** Next empty slot for the day: breakfast → lunch → dinner → snack. */
export function nextMealType(existing: Iterable<MealType>): MealType {
  const have = new Set(existing)
  for (const t of MEAL_TYPE_ORDER) {
    if (!have.has(t)) return t
  }
  return defaultMealTypeForNow()
}

type MealMarker = { type: MealType; re: RegExp }

/** Verb + «на обед» etc. — strip the whole phrase so leftovers aren't parsed as food. */
const ATE_PREFIX = '(?:съел(?:а|и)?|ел(?:а|и)?|кушал(?:а|и)?)\\s+'

/** Phrases that name the meal in free text. Longer / more specific first. */
const MEAL_MARKERS: MealMarker[] = [
  { type: 'breakfast', re: new RegExp(`${ATE_PREFIX}(?:на\\s+)?завтрак\\s*[:.-]?\\s*`, 'i') },
  { type: 'lunch', re: new RegExp(`${ATE_PREFIX}(?:на\\s+)?обед\\s*[:.-]?\\s*`, 'i') },
  { type: 'dinner', re: new RegExp(`${ATE_PREFIX}(?:на\\s+)?ужин\\s*[:.-]?\\s*`, 'i') },
  {
    type: 'snack',
    re: new RegExp(`${ATE_PREFIX}(?:на\\s+)?(?:перекус|полдник|снек)\\s*[:.-]?\\s*`, 'i'),
  },
  { type: 'breakfast', re: /(?:^|[\n,;])\s*(?:на\s+)?завтрак\s*[:.-]?\s*/i },
  { type: 'lunch', re: /(?:^|[\n,;])\s*(?:на\s+)?обед\s*[:.-]?\s*/i },
  { type: 'dinner', re: /(?:^|[\n,;])\s*(?:на\s+)?ужин\s*[:.-]?\s*/i },
  { type: 'snack', re: /(?:^|[\n,;])\s*(?:на\s+)?(?:перекус|полдник|снек)\s*[:.-]?\s*/i },
  { type: 'breakfast', re: /\bна\s+завтрак\b/i },
  { type: 'lunch', re: /\bна\s+обед\b/i },
  { type: 'dinner', re: /\bна\s+ужин\b/i },
  { type: 'snack', re: /\bна\s+(?:перекус|полдник)\b/i },
]

/**
 * Detect meal type from text and strip the marker so it is not parsed as food.
 * «обед: паста 200 гр» → lunch + «паста 200 гр»
 */
export function extractMealTypeFromText(text: string): {
  mealType: MealType | null
  cleaned: string
} {
  let cleaned = text
  let mealType: MealType | null = null

  for (const { type, re } of MEAL_MARKERS) {
    if (re.test(cleaned)) {
      mealType = type
      cleaned = cleaned
        .replace(re, ' ')
        .replace(/^[:.-\s]+/, '')
        .replace(/\s{2,}/g, ' ')
        .trim()
      break
    }
  }

  return { mealType, cleaned: cleaned || text.trim() }
}

/** Text without a leading meal label — for previews (type is shown separately). */
export function mealBodyText(rawText: string): string {
  const { cleaned } = extractMealTypeFromText(rawText)
  return cleaned.trim() || rawText.trim()
}
