import type { MealType } from '../types'
import { capitalizeFoodName } from './foodName'
import { extractMealTypeFromText } from './labels'

export type SpokenMeal = {
  /** One product per line: «Молоко 100 г». */
  text: string
  mealType: MealType | null
}

const UNIT =
  '(?:килограмм(?:а|ов)?|кило|кг|грамм(?:а|ов)?|гр|мл|г)'

const CORRECTION_WORD =
  '(?:нет|не\\s+так|неправильно|ошиб(?:лась|ся|ка)|вернее|точнее|стой|подожди(?:те)?|исправ(?:ь|ляю)|отмена|убери|забудь)'

const LEAD_IN =
  /^(?:(?:ну|так|значит|короче|слушай(?:те)?|алло|давай(?:те)?|пожалуйста|запиши(?:те)?|добавь(?:те)?|сегодня|итак)\s+)+/i

const ATE =
  /^(?:я\s+)?(?:по)?(?:съела|съел|съели|ела|ел|ели|кушала|кушал|кушали|поела|поел|поели|было|были)\s+/i

/** JS `\b` is ASCII-only and does not see Cyrillic letters. */
const FILLER =
  /(?<![\p{L}\p{N}])(?:ну|ээ+|эм+|мм+|типа|короче|значит|вот|это|просто|пожалуйста|как\s+бы|примерно|около|где[-\s]?то|порядка)(?![\p{L}\p{N}])/giu

const NAME_STOP = new Set([
  'я',
  'мы',
  'он',
  'она',
  'они',
  'все',
  'всё',
  'спасибо',
  'пожалуйста',
  'привет',
  'алло',
  'стоп',
  'готово',
  'конец',
  'запись',
  'грамм',
  'грамма',
  'граммов',
])

const ONES: Record<string, number> = {
  ноль: 0,
  один: 1,
  одна: 1,
  одно: 1,
  одного: 1,
  одну: 1,
  два: 2,
  две: 2,
  двух: 2,
  три: 3,
  трех: 3,
  трёх: 3,
  четыре: 4,
  четырех: 4,
  четырёх: 4,
  пять: 5,
  пяти: 5,
  шесть: 6,
  шести: 6,
  семь: 7,
  семи: 7,
  восемь: 8,
  восьми: 8,
  девять: 9,
  девяти: 9,
}

const TEENS: Record<string, number> = {
  десять: 10,
  десяти: 10,
  одиннадцать: 11,
  двенадцать: 12,
  тринадцать: 13,
  четырнадцать: 14,
  пятнадцать: 15,
  шестнадцать: 16,
  семнадцать: 17,
  восемнадцать: 18,
  девятнадцать: 19,
}

const TENS: Record<string, number> = {
  двадцать: 20,
  двадцати: 20,
  тридцать: 30,
  тридцати: 30,
  сорок: 40,
  сорока: 40,
  пятьдесят: 50,
  пятидесяти: 50,
  шестьдесят: 60,
  шестидесяти: 60,
  семьдесят: 70,
  семидесяти: 70,
  восемьдесят: 80,
  восьмидесяти: 80,
  девяносто: 90,
  девяноста: 90,
}

const HUNDREDS: Record<string, number> = {
  сто: 100,
  ста: 100,
  двести: 200,
  двухсот: 200,
  триста: 300,
  трехсот: 300,
  трёхсот: 300,
  четыреста: 400,
  пятьсот: 500,
  шестьсот: 600,
  семьсот: 700,
  восемьсот: 800,
  девятьсот: 900,
}

const THOUSANDS = new Set(['тысяча', 'тысячи', 'тысяч'])

type SpokenItem = {
  key: string
  name: string
  grams: number | null
}

/**
 * Turn a dictated meal into the final product lines.
 * Later mentions replace earlier ones; «ой нет» / «не 10 а 20» correct in place.
 * «я съела молоко 100 грамм, хлеб 10 грамм, ой нет хлеб 20 грамм» → молоко 100, хлеб 20.
 */
export function resolveSpokenMeal(raw: string): SpokenMeal {
  const folded = raw.replace(/ё/g, 'е').replace(/\s+/g, ' ').trim()
  if (!folded) return { text: '', mealType: null }

  const led = stripLeadIn(folded.toLowerCase())
  const { mealType, cleaned } = extractMealTypeFromText(led)
  const body = (mealType ? cleaned : led).trim()
  if (!body) return { text: '', mealType }

  const prepared = separateClauses(replaceNotAmount(replaceSpokenNumbers(expandKitchenAmounts(body))))
  const items = foldClauses(prepared.split(/[,]+/).map((part) => part.trim()).filter(Boolean))

  const text = items
    .filter((item) => item.name.trim())
    .map(formatItem)
    .join('\n')
  return { text, mealType }
}

function stripLeadIn(text: string): string {
  let s = text.trim()
  let prev = ''
  while (s !== prev) {
    prev = s
    s = s.replace(LEAD_IN, '').replace(ATE, '').trim()
  }
  return s
}

function expandKitchenAmounts(text: string): string {
  return text
    .replace(/полтора\s+кило(?:грамм(?:а|ов)?)?/g, '1500 г')
    .replace(/пол\s*-?\s*кило(?:грамм(?:а|ов)?)?/g, '500 г')
}

function formatNum(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace('.', ',')
}

function replaceSpokenNumbers(text: string): string {
  const parts = text.split(/\s+/)
  const out: string[] = []
  let i = 0
  while (i < parts.length) {
    const seq = readNumber(parts, i)
    if (!seq) {
      out.push(parts[i])
      i += 1
      continue
    }
    out.push(formatNum(seq.value))
    i = seq.next
  }
  return out.join(' ')
}

function readNumber(
  parts: string[],
  start: number,
): { value: number; next: number } | null {
  let i = start
  let total = 0
  let current = 0
  let consumed = false
  let sawOnes = false
  let sawTens = false
  let sawHundreds = false

  const word = parts[i]?.toLowerCase().replace(/ё/g, 'е')
  if (word === 'полтора' || word === 'полторы') {
    let value = 1.5
    let next = i + 1
    if (parts[next] === 'с' && (parts[next + 1] ?? '').startsWith('половин')) {
      value += 0.5
      next += 2
    }
    return { value, next }
  }

  while (i < parts.length) {
    const w = parts[i].toLowerCase().replace(/ё/g, 'е')
    if (THOUSANDS.has(w)) {
      current = (current || 1) * 1000
      total += current
      current = 0
      sawOnes = false
      sawTens = false
      sawHundreds = false
      consumed = true
      i += 1
      continue
    }
    if (w in HUNDREDS) {
      if (sawHundreds) break
      current += HUNDREDS[w]
      sawHundreds = true
      consumed = true
      i += 1
      continue
    }
    if (w in TEENS) {
      if (sawTens || sawOnes) break
      current += TEENS[w]
      sawTens = true
      sawOnes = true
      consumed = true
      i += 1
      continue
    }
    if (w in TENS) {
      if (sawTens) break
      current += TENS[w]
      sawTens = true
      consumed = true
      i += 1
      continue
    }
    if (w in ONES) {
      if (sawOnes) break
      current += ONES[w]
      sawOnes = true
      consumed = true
      i += 1
      continue
    }
    break
  }

  if (!consumed) return null
  if (parts[i] === 'с' && (parts[i + 1] ?? '').startsWith('половин')) {
    current += 0.5
    i += 2
  }
  return { value: total + current, next: i }
}

/** «не 10 а 20» / «не 10 грамм а 20 грамм» → keep the corrected amount. */
function replaceNotAmount(text: string): string {
  return text.replace(
    new RegExp(
      `не\\s+(\\d+(?:[.,]\\d+)?)\\s*(?:${UNIT})?\\s*а\\s+(\\d+(?:[.,]\\d+)?)\\s*(${UNIT})?`,
      'gi',
    ),
    (_m, _old: string, next: string, unit?: string) => `${next} ${unit || 'г'}`,
  )
}

function separateClauses(text: string): string {
  const withBreaks = text
    .replace(/[!?]+\s*/g, ', ')
    .replace(/([^\d])\.(?=\s|$)/g, '$1,')
    .replace(/[;]+/g, ',')
  const items = withBreaks.replace(
    new RegExp(
      `(${UNIT})(?!\\p{L})\\s+(?!(?:и|а|или|ой|нет|не|ещ[её]|плюс|с|со)(?![\\p{L}\\p{N}]))(?=\\p{L})`,
      'giu',
    ),
    '$1, ',
  )
  const marked = items
    .replace(
      new RegExp(
        `(?<!ой)\\s+(?=(?:ой\\s+)?${CORRECTION_WORD}(?![\\p{L}\\p{N}]))`,
        'giu',
      ),
      ', ',
    )
    .replace(/\s*,\s*/g, ', ')
    .replace(/,+/g, ',')
  return marked
    .split(',')
    .flatMap((part) => splitAnd(part.trim()))
    .filter(Boolean)
    .join(', ')
}

function splitAnd(chunk: string): string[] {
  if (!/(?<![\p{L}\p{N}])и(?![\p{L}\p{N}])/iu.test(chunk)) return [chunk]
  const parts = chunk
    .split(/\s+и\s+/i)
    .map((part) => part.trim())
    .filter(Boolean)
  if (parts.length < 2) return [chunk]
  if (parts.every((part) => /\d/.test(part))) return parts
  if (/\d/.test(parts[0]) && !/\sс\s/i.test(parts[0])) return parts
  if (parts.every((part) => part.split(/\s+/).length <= 3) && !parts.some((part) => /\sс\s/i.test(part))) {
    return parts
  }
  return [chunk]
}

function foldClauses(clauses: string[]): SpokenItem[] {
  const items: SpokenItem[] = []
  for (let i = 0; i < clauses.length; i += 1) {
    let body = cleanFillers(clauses[i])
    if (!body) continue

    let correction = false
    if (isOnlyMarker(body)) {
      let j = i + 1
      while (j < clauses.length && isOnlyMarker(cleanFillers(clauses[j]))) j += 1
      const next = j < clauses.length ? cleanFillers(clauses[j]) : ''
      if (next) {
        correction = true
        body = next
        i = j
      } else {
        items.pop()
        continue
      }
    }

    const peeled = peelLeadingMarker(body)
    if (peeled.correction) {
      correction = true
      body = peeled.rest
    }
    if (!body) {
      if (correction) items.pop()
      continue
    }

    const additive = peelAdditive(body)
    body = additive.rest
    if (applyNotBut(body, items, correction)) continue

    const parsed = parseBody(body)
    if (!parsed || (!parsed.name && parsed.grams == null)) {
      if (correction) items.pop()
      continue
    }
    if (!parsed.name && parsed.grams != null) {
      if (items.length > 0) {
        items[items.length - 1] = { ...items[items.length - 1], grams: parsed.grams }
      }
      continue
    }
    if (NAME_STOP.has(parsed.name.toLowerCase())) {
      if (correction) items.pop()
      continue
    }

    const key = foodKey(parsed.name)
    if (!key) continue
    const idx = items.findIndex((item) => item.key === key)
    const nextItem: SpokenItem = { key, name: parsed.name, grams: parsed.grams }

    if (correction) {
      if (idx >= 0) {
        items[idx] = {
          ...nextItem,
          grams: nextItem.grams ?? items[idx].grams,
        }
      } else if (items.length > 0) {
        const prev = items[items.length - 1]
        items[items.length - 1] = {
          ...nextItem,
          grams: nextItem.grams ?? prev.grams,
        }
      } else {
        items.push(nextItem)
      }
      continue
    }

    if (idx >= 0) {
      const prev = items[idx]
      if (additive.additive && parsed.grams != null && prev.grams != null) {
        items[idx] = {
          ...prev,
          name: parsed.name,
          grams: roundGrams(prev.grams + parsed.grams),
        }
      } else if (parsed.grams != null) {
        items[idx] = nextItem
      } else {
        items[idx] = { ...prev, name: parsed.name }
      }
    } else {
      items.push(nextItem)
    }
  }
  return items
}

function isOnlyMarker(body: string): boolean {
  return new RegExp(`^(?:ой(?:-ой)?(?:\\s+нет)?|упс|${CORRECTION_WORD})$`, 'iu').test(body.trim())
}

function peelLeadingMarker(body: string): { correction: boolean; rest: string } {
  const match = body.match(
    new RegExp(`^(?:ой\\s+)?${CORRECTION_WORD}(?![\\p{L}\\p{N}])[\\s,:-]*`, 'iu'),
  )
  if (!match) return { correction: false, rest: body }
  return { correction: true, rest: body.slice(match[0].length).trim() }
}

function peelAdditive(body: string): { additive: boolean; rest: string } {
  const match = body.match(/^(?:ещ[её]|плюс|также|добавь(?:те)?)\s+/i)
  if (!match) return { additive: false, rest: body }
  return { additive: true, rest: body.slice(match[0].length).trim() }
}

function applyNotBut(body: string, items: SpokenItem[], correction: boolean): boolean {
  const match = body.match(/^не\s+(.+?)\s+а\s+(.+)$/i)
  if (!match) return false
  const to = parseBody(match[2])
  if (!to?.name) return false
  const from = parseBody(match[1])
  const fromKey = from?.name ? foodKey(from.name) : ''
  const idx = fromKey ? items.findIndex((item) => item.key === fromKey) : -1
  const nextItem: SpokenItem = {
    key: foodKey(to.name),
    name: to.name,
    grams: to.grams,
  }
  if (!nextItem.key) return false
  if (idx >= 0) {
    items[idx] = { ...nextItem, grams: nextItem.grams ?? items[idx].grams }
  } else if (correction && items.length > 0) {
    const prev = items[items.length - 1]
    items[items.length - 1] = { ...nextItem, grams: nextItem.grams ?? prev.grams }
  } else {
    items.push(nextItem)
  }
  return true
}

function parseBody(body: string): { name: string; grams: number | null } | null {
  const cleaned = cleanFillers(body)
  if (!cleaned) return null

  const re = new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(${UNIT})(?!\\p{L})`, 'giu')
  const found: { grams: number; index: number; length: number }[] = []
  for (const match of cleaned.matchAll(re)) {
    if (match.index == null) continue
    found.push({
      grams: toGrams(parseNum(match[1]), match[2]),
      index: match.index,
      length: match[0].length,
    })
  }

  if (found.length === 0) {
    const trailing = cleaned.match(/^(.*\S)\s+(\d+(?:[.,]\d+)?)$/)
    if (trailing) {
      const grams = parseNum(trailing[2])
      if (grams > 0 && grams <= 5000) return { name: cleanName(trailing[1]), grams }
    }
    const only = cleaned.match(new RegExp(`^(\\d+(?:[.,]\\d+)?)(?:\\s*${UNIT})?$`, 'i'))
    if (only) return { name: '', grams: toGrams(parseNum(only[1]), only[0]) }
    const name = cleanName(cleaned)
    return name ? { name, grams: null } : null
  }

  const grams = found[found.length - 1].grams
  const name = cleanName(cleaned.replace(re, ' '))
  return { name, grams }
}

function cleanFillers(text: string): string {
  return text.replace(FILLER, ' ').replace(/\s+/g, ' ').trim()
}

function cleanName(name: string): string {
  let s = name.replace(/\s+/g, ' ').trim()
  const lead = /^(?:ну|это|вот|просто|ещ[её]|также|плюс|и|а)\s+/iu
  let prev = ''
  while (s !== prev) {
    prev = s
    s = s.replace(lead, '').trim()
  }
  return s.replace(/\s+(?:ну|это|вот|и|а)$/iu, '').trim()
}

function parseNum(raw: string): number {
  const n = Number(raw.replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

function toGrams(value: number, unit: string): number {
  if (/кг|кило/i.test(unit)) return roundGrams(value * 1000)
  return value
}

function roundGrams(value: number): number {
  return Math.round(value * 10) / 10
}

const ENDINGS = [
  'ами',
  'ями',
  'ого',
  'ему',
  'ому',
  'ыми',
  'ими',
  'ах',
  'ях',
  'ов',
  'ев',
  'ом',
  'ем',
  'ой',
  'ей',
  'ий',
  'ый',
  'ая',
  'ое',
  'ые',
  'ие',
  'ую',
  'юю',
  'а',
  'я',
  'у',
  'ю',
  'ы',
  'и',
  'о',
  'е',
]

function stemRu(word: string): string {
  if (word.length <= 3) return word
  for (const ending of ENDINGS) {
    if (word.endsWith(ending) && word.length - ending.length >= 3) {
      return word.slice(0, -ending.length)
    }
  }
  return word
}

function foodKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9\s]/gi, ' ')
    .split(/\s+/)
    .filter((word) => word && !/^\d+$/.test(word))
    .map(stemRu)
    .join(' ')
}

function formatItem(item: SpokenItem): string {
  const name = capitalizeFoodName(item.name)
  if (item.grams == null || !(item.grams > 0)) return name
  return `${name} ${formatNum(item.grams)} г`
}
