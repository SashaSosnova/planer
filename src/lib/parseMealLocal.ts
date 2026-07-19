import type { FoodRef, MealItem, MealType, ParsedMealDraft } from '../types'
import { stripEatingOutMarkers, textSuggestsEatingOut } from './eatingOut'
import { findBestFood } from './foodMatch'
import { defaultMealTypeForNow } from './labels'
import { isComplexMealText } from './mealComplexity'
import {
  guessFallbackCategory,
  restaurantPortionGrams,
  round1,
  scalePer100g,
  sumMacros,
} from './nutrition'

const DEFAULT_GRAMS = 100
const DECIMAL_GUARD = '\uE000'

type Segment = {
  raw: string
  name: string
  grams: number | null
}

type AddonRule = {
  match: RegExp
  grams: number
  label: (withPart: string) => string
}

/** Only expand known simple add-ons — not «с кабачком и курицей». */
const WITH_PART_DEFAULTS: AddonRule[] = [
  {
    match: /^молок/,
    grams: 60,
    label: (withPart) => {
      const fat = withPart.match(/(\d+[.,]\d+)\s*%/)
      return fat ? `молоко ${fat[1].replace('.', ',')}%` : 'молоко'
    },
  },
  { match: /^сливк/, grams: 30, label: () => 'сливки' },
  { match: /^сахар/, grams: 7, label: () => 'сахар' },
  { match: /^м[её]д/, grams: 10, label: () => 'мёд' },
  { match: /^масло$/, grams: 10, label: () => 'масло' },
  { match: /^сыром$|^сыр$/, grams: 20, label: () => 'сыр' },
  { match: /^сметан/, grams: 30, label: () => 'сметана' },
]

const BASE_DEFAULT_GRAMS: Array<{ match: RegExp; grams: number }> = [
  { match: /кофе|латте|капучино|американо/, grams: 200 },
  { match: /чай/, grams: 200 },
  { match: /тост|хлеб/, grams: 30 },
  { match: /овсянк/, grams: 40 },
]

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function protectDecimals(text: string): string {
  return text.replace(/(\d),(\d)/g, `$1${DECIMAL_GUARD}$2`)
}

function restoreDecimals(text: string): string {
  return text.replaceAll(DECIMAL_GUARD, ',')
}

const GRAM_UNIT = '(?:грамм(?:а|ов)?|гр|г|мл|ml|g)'
const KG_UNIT = '(?:кг|kg)'
const APPROX_PREFIX = /^(?:около|примерно|где[- ]?то|порядка|~)\s+/iu
const APPROX_MID = /\s+(?:примерно|около|где[- ]?то)\s+/iu

function toGrams(value: number, unit: string): number {
  return /кг|kg/i.test(unit) ? round1(value * 1000) : value
}

function stripApproxWords(text: string): string {
  return text.replace(APPROX_PREFIX, '').replace(APPROX_MID, ' ').replace(/\s+/g, ' ').trim()
}

/** «творог 200 г» / «200 г творога» / «0.2 кг творога». */
export function extractMealGrams(part: string): { name: string; grams: number | null } {
  const text = stripApproxWords(part.trim())
  if (!text) return { name: '', grams: null }

  const unit = `(?:${GRAM_UNIT}|${KG_UNIT})`

  const trailing = text.match(
    new RegExp(`^(.*?)\\s+(\\d+(?:[.,]\\d+)?)\\s*(${unit})\\s*$`, 'iu'),
  )
  if (trailing) {
    const raw = Number(trailing[2].replace(',', '.'))
    const grams = toGrams(raw, trailing[3])
    const name = trailing[1].trim()
    if (name && Number.isFinite(grams) && grams > 0) return { name, grams }
  }

  const leading = text.match(
    new RegExp(`^(\\d+(?:[.,]\\d+)?)\\s*(${unit})\\s+(.+)$`, 'iu'),
  )
  if (leading) {
    const raw = Number(leading[1].replace(',', '.'))
    const grams = toGrams(raw, leading[2])
    const name = leading[3].trim()
    if (name && Number.isFinite(grams) && grams > 0) return { name, grams }
  }

  return { name: text, grams: null }
}

function extractGrams(part: string): { name: string; grams: number | null } {
  return extractMealGrams(part)
}

function defaultGramsForBase(name: string): number {
  const n = normalize(name)
  for (const rule of BASE_DEFAULT_GRAMS) {
    if (rule.match.test(n)) return rule.grams
  }
  return DEFAULT_GRAMS
}

function resolveAddon(withPart: string): { name: string; grams: number } | null {
  const withNorm = normalize(withPart)
  for (const rule of WITH_PART_DEFAULTS) {
    if (rule.match.test(withNorm)) {
      return { name: rule.label(withPart), grams: rule.grams }
    }
  }
  return null
}

/** Expand only «кофе с молоком», not dish titles with «с … и …». */
function expandWithParts(seg: Segment): Segment[] {
  const m = seg.name.match(/^(.+?)\s+с\s+(.+)$/i)
  if (!m) return [seg]

  const baseName = m[1].trim()
  const withPart = m[2].trim()
  // Don't break multi-ingredient dish names
  if (/\sи\s/i.test(withPart) || withPart.split(/\s+/).length > 3) {
    return [seg]
  }

  const addon = resolveAddon(withPart)
  if (!addon) return [seg]

  // Explicit total weight (e.g. «кофе с молоком 200 г») — allocate, don't double-count.
  if (seg.grams != null && seg.grams > 0) {
    const addonGrams = Math.min(addon.grams, seg.grams)
    const baseGrams = round1(seg.grams - addonGrams)
    if (baseGrams <= 0) return [seg]
    return [
      { raw: baseName, name: baseName, grams: baseGrams },
      { raw: `${addon.name} ${addonGrams} г`, name: addon.name, grams: addonGrams },
    ]
  }

  return [
    {
      raw: baseName,
      name: baseName,
      grams: defaultGramsForBase(baseName),
    },
    {
      raw: `${addon.name} ${addon.grams} г`,
      name: addon.name,
      grams: addon.grams,
    },
  ]
}

/** Split meal lists on commas — not on «и» (breaks dish names). */
function splitList(text: string): string[] {
  return protectDecimals(text)
    .split(/[,;\n]+/)
    .map((p) => restoreDecimals(p).trim())
    .filter(Boolean)
}

function splitSegments(text: string): Segment[] {
  const segments: Segment[] = []
  for (const raw of splitList(text)) {
    const { name, grams } = extractGrams(raw)
    segments.push(...expandWithParts({ raw, name, grams }))
  }
  return segments
}

function toItem(
  name: string,
  grams: number,
  foods: FoodRef[],
  eatingOut: boolean,
): MealItem {
  if (!eatingOut) {
    const matched = findBestFood(name, foods)
    if (matched) {
      const macros = scalePer100g(matched.per100g, grams)
      return {
        name: matched.name,
        grams,
        foodId: matched.id,
        ...macros,
        source: 'library',
      }
    }
  }
  const per100 = guessFallbackCategory(name)
  const macros = scalePer100g(per100, grams)
  return {
    name,
    grams,
    ...macros,
    source: 'estimate',
  }
}

/** If the whole phrase is a known product/dish — one line, no splitting. */
function tryMatchWholeFood(
  text: string,
  foods: FoodRef[],
  mealType: MealType | undefined,
  eatingOut: boolean,
): ParsedMealDraft | null {
  if (eatingOut || foods.length === 0) return null
  // Multi-item lists must go through splitSegments, not a single fuzzy hit.
  if (/[,;\n]/.test(text)) return null

  const collapsed = text.replace(/\s+/g, ' ').trim()
  const { name, grams } = extractGrams(collapsed)
  if (!name) return null

  // Prefer dishes / longer names — lower min score for near-exact titles
  const matched = findBestFood(name, foods, 70)
  if (!matched) return null

  const g = grams ?? DEFAULT_GRAMS
  const macros = scalePer100g(matched.per100g, g)
  const item: MealItem = {
    name: matched.name,
    grams: g,
    foodId: matched.id,
    ...macros,
    source: 'library',
  }

  return {
    mealType: mealType ?? defaultMealTypeForNow(),
    items: [item],
    totals: sumMacros([item]),
    isApproximate: false,
    eatingOut: false,
    parseSource: 'library',
    notes:
      matched.kind === 'dish'
        ? 'Найдено готовое блюдо из справочника — без разбивки на ингредиенты.'
        : 'Совпало с продуктом из справочника.',
  }
}

function parseAsSingleDish(
  text: string,
  foods: FoodRef[],
  mealType: MealType | undefined,
  eatingOut: boolean,
): ParsedMealDraft {
  const collapsed = text.replace(/\s+/g, ' ').trim()
  const extracted = extractGrams(collapsed)
  const rawName = extracted.name || collapsed
  const grams =
    extracted.grams ?? (eatingOut ? restaurantPortionGrams(rawName) : DEFAULT_GRAMS)

  let name = rawName
  const cut = rawName.search(/,\s*заправка|,?\s*украшен/i)
  if (cut > 10) name = rawName.slice(0, cut).trim()
  if (name.length > 64) name = `${name.slice(0, 61).trim()}…`

  // Try library dish before generic estimate
  const whole = tryMatchWholeFood(collapsed, foods, mealType, false)
  if (whole) return { ...whole, eatingOut, isApproximate: eatingOut || whole.isApproximate }

  const item = toItem(name, grams, foods, true)
  return {
    mealType: mealType ?? defaultMealTypeForNow(),
    items: [item],
    totals: sumMacros([item]),
    isApproximate: true,
    eatingOut,
    parseSource: 'local',
    notes:
      'Локальная оценка (без LLM): одно блюдо по весу в конце. Подключите DeepSeek для умнее.',
  }
}

export function parseMealLocal(
  text: string,
  foods: FoodRef[],
  mealType?: MealType,
  eatingOutHint = false,
): ParsedMealDraft {
  const eatingOut = eatingOutHint || textSuggestsEatingOut(text)
  const cleaned = stripEatingOutMarkers(text) || text

  const whole = tryMatchWholeFood(cleaned, foods, mealType, eatingOut)
  if (whole) return whole

  if (isComplexMealText(cleaned)) {
    return parseAsSingleDish(cleaned, foods, mealType, eatingOut)
  }

  const segments = eatingOut
    ? splitList(cleaned).map((raw) => {
        const { name, grams } = extractGrams(raw)
        return { raw, name, grams }
      })
    : splitSegments(cleaned)

  const items: MealItem[] = segments.map((seg) => {
    const grams =
      seg.grams ??
      (eatingOut ? restaurantPortionGrams(seg.name) : defaultGramsForBase(seg.name))
    return toItem(seg.name, grams, foods, eatingOut)
  })

  const expanded =
    !eatingOut &&
    segments.length > 1 &&
    /\sс\s/i.test(cleaned) &&
    !/\sи\s/i.test(cleaned)

  return {
    mealType: mealType ?? defaultMealTypeForNow(),
    items,
    totals: sumMacros(items),
    isApproximate: eatingOut || items.some((i) => i.source === 'estimate'),
    eatingOut,
    parseSource: 'local',
    notes: eatingOut
      ? 'Локальная оценка «вне дома» (без LLM).'
      : expanded
        ? 'Локальный разбор: составные позиции (кофе с молоком и т.п.).'
        : items.some((i) => i.source === 'estimate')
          ? 'Локальная оценка без LLM — грубые средние по типу продукта.'
          : undefined,
  }
}
