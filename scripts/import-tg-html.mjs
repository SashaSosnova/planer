/**
 * Telegram HTML export → Planer meals + weights preview.
 *
 * Usage:
 *   node scripts/import-tg-html.mjs --all
 *   node scripts/import-tg-html.mjs --all --since 2026-07-01
 *   node scripts/import-tg-html.mjs --file messages7.html --limit 30
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createHash } from 'node:crypto'

const args = process.argv.slice(2)
function flag(name, fallback) {
  const i = args.indexOf(name)
  if (i < 0) return fallback
  return args[i + 1] ?? true
}

const useAll = args.includes('--all')
const fileName = String(flag('--file', 'messages7.html'))
const limit = Number(flag('--limit', '0')) || 0
const since = String(flag('--since', '') || '')
const outPath = String(flag('--out', path.join('scripts', 'tg-import-preview.json')))

const ALL_FILES = [
  'messages.html',
  'messages2.html',
  'messages3.html',
  'messages4.html',
  'messages5.html',
  'messages6.html',
  'messages7.html',
]

const MONTHS_RU = {
  января: 1,
  февраля: 2,
  марта: 3,
  апреля: 4,
  мая: 5,
  июня: 6,
  июля: 7,
  августа: 8,
  сентября: 9,
  октября: 10,
  ноября: 11,
  декабря: 12,
}

const downloads = path.join(os.homedir(), 'Downloads')
const chatDir = fs
  .readdirSync(downloads)
  .map((n) => path.join(downloads, n))
  .find((p) => fs.existsSync(path.join(p, 'messages7.html')))

if (!chatDir) {
  console.error('Папка экспорта не найдена (ожидался …/Downloads/…/messages7.html)')
  process.exit(1)
}

const files = useAll ? ALL_FILES.filter((f) => fs.existsSync(path.join(chatDir, f))) : [fileName]

function stripHtml(raw) {
  return raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&apos;/g, "'")
    .replace(/«|»/g, '"')
    .replace(/\u00a0/g, ' ')
    .trim()
}

function num(s) {
  const n = Number(String(s).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function toIso(ddmmyyyy) {
  const m = ddmmyyyy.match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
  if (!m) return null
  return `${m[3]}-${m[2]}-${m[1]}`
}

function shiftIso(iso, days) {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function parseRuDayMonth(text, fallbackYear) {
  const m = text.match(
    /(?:на|за|итогам|день\s*\()\s*(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)(?:\s+(\d{4}))?/i,
  ) || text.match(
    /(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)(?:\s+(\d{4}))?/i,
  )
  if (!m) return null
  const day = String(m[1]).padStart(2, '0')
  const month = String(MONTHS_RU[m[2].toLowerCase()]).padStart(2, '0')
  const year = m[3] || fallbackYear
  return `${year}-${month}-${day}`
}

function stableId(seed) {
  const h = createHash('sha1').update(seed).digest('hex').slice(0, 12)
  return `tg-${h}`
}

/** Infer breakfast/lunch/dinner/snack from free-form bot titles. */
function parseMealType(title) {
  const t = title.trim().toLowerCase()
  const head = t.split(/[:\-–—]/)[0]?.trim() ?? t
  if (/завтрак|утренн/.test(head) || /завтрак|утренн/.test(t)) return 'breakfast'
  if (/обед/.test(head) || /обед/.test(t)) return 'lunch'
  if (/ужин/.test(head) || /ужин/.test(t)) return 'dinner'
  if (
    /перекус|полдник|десерт|снек|напиток|кофе|капучино|эспрессо|салат|чип|конфет|мороже|слойка|чизкейк|мармелад|шоколад|яблоко|манго|огурец|капуста|творог|арбуз|черешн|клубник|слив|вино|эклер|kitkat|kinder|м&м|m&m|булоч|батончик|печенье|протеин/.test(
      t,
    )
  ) {
    return 'snack'
  }
  // Bare food lines without a slot label → snack (second plate, coffee, fruit…)
  if (t.length > 0) return 'snack'
  return null
}

function bodyFromTitle(title) {
  const i = title.search(/[:\-–—]/)
  if (i >= 0) return title.slice(i + 1).trim() || title.trim()
  return title.trim()
}

function extractWeightKg(text) {
  // Avoid \\b after «кг» — in JS Cyrillic is non-word, so «кг.» fails \\b.
  const patterns = [
    /Исправил на\s+(\d+[.,]\d+|\d+)\s*кг/i,
    /Записал!\s*(\d+[.,]\d+|\d+)\s*кг/i,
    /Записал\s+вес\s+(\d+[.,]\d+|\d+)\s*кг/i,
    /Записал\s+(\d+[.,]\d+|\d+)\s*кг/i,
    /Готово![^\n]*?(\d+[.,]\d+|\d+)\s*кг\s*[—\-–]?\s*записал/i,
    /(\d+[.,]\d+|\d+)\s*кг\s*[—\-–]\s*записал/i,
    /Я\s+взвесилась\s+(\d+[.,]\d+|\d+)\s*кг/i,
    /^Вес\s+(\d+[.,]\d+|\d+)\s*$/im,
    /^#\s*(\d+[.,]\d+|\d+)\s*(?:кг|[—\-–])/im,
    /^(\d+[.,]\d+|\d+)\s*кг(?:\s|[.,!?—\-–:]|$)/im,
    // «63,6 — +1 кг после…» (number then dash, кг later on line)
    /^(\d+[.,]\d+|\d+)\s*[—\-–]\s*[+\-]?\s*\d/im,
  ]
  for (const re of patterns) {
    const m = text.match(re)
    if (!m) continue
    // Skip if this looks like food grams mistaken for weight in «Записал "…"»
    if (/Записал\s+"/i.test(text) && !/^#|Записал!\s*\d|Записал\s+вес|Записал\s+\d|Исправил на/i.test(text.split('\n')[0] || '')) {
      // still allow header weight on first line
      const first = (text.split('\n')[0] || '').trim()
      if (!/^#?\s*\d+[.,]?\d*\s*(кг|[—\-–])/.test(first) && !/^Вес\s+\d/i.test(first)) {
        if (!/Записал!\s*\d|Записал\s+\d+[.,]?\d*\s*кг|Записал\s+вес|Исправил на/i.test(text)) continue
      }
    }
    const kg = num(m[1])
    if (kg != null && kg >= 40 && kg <= 120) return Math.round(kg * 10) / 10
  }
  return null
}

/**
 * Weight writes for this message — including multi-day corrections
 * («обновил весовые записи: 20 марта и 21 марта на 65.8 кг»).
 */
function extractWeightUpdates(text, msgIso, fallbackYear) {
  /** @type {{ date: string, kg: number }[]} */
  const updates = []

  const multi = text.match(
    /обновил весовые записи[^\n.]{0,160}?на\s+(\d+[.,]\d+|\d+)\s*кг/i,
  )
  if (multi) {
    const kg = num(multi[1])
    if (kg != null && kg >= 40 && kg <= 120) {
      const monthRe =
        /(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)/gi
      for (const m of text.matchAll(monthRe)) {
        const day = String(m[1]).padStart(2, '0')
        const month = String(MONTHS_RU[m[2].toLowerCase()]).padStart(2, '0')
        updates.push({ date: `${fallbackYear}-${month}-${day}`, kg: Math.round(kg * 10) / 10 })
      }
      if (updates.length) return updates
    }
  }

  const kg = extractWeightKg(text)
  if (kg != null) updates.push({ date: msgIso, kg })
  return updates
}

function mealFromParts(title, kcal, protein, fat, carbs, flags = {}) {
  if (kcal == null || !title) return null
  if (kcal < 20 || kcal > 4000) return null
  const mealType = parseMealType(title)
  if (!mealType) return null
  return {
    title,
    mealType,
    rawText: bodyFromTitle(title),
    kcal,
    protein: protein ?? 0,
    fat: fat ?? 0,
    carbs: carbs ?? 0,
    corrected: Boolean(flags.corrected),
    bare: Boolean(flags.bare),
  }
}

/** All meal lines in a message (Записал + soft «Title — N ккал»). */
function extractAllMealsFromText(text) {
  const found = []
  const seen = new Set()

  const push = (m) => {
    if (!m) return
    const key = `${m.mealType}|${m.kcal}|${m.rawText.slice(0, 40)}`
    if (seen.has(key)) return
    seen.add(key)
    found.push(m)
  }

  const patterns = [
    /Записал\s+"([^"]+)"\s*[,—\-–]?\s*([\d.,]+)\s*ккал(?:\s*\(\s*Б:\s*([\d.,]+)\s*г\s*,\s*Ж:\s*([\d.,]+)\s*г\s*,\s*У:\s*([\d.,]+)\s*г)?/gi,
    /"([^"]+)"\s*[—\-–]\s*(?:теперь\s*)?([\d.,]+)\s*ккал(?:\s*\(\s*Б:\s*([\d.,]+)\s*г(?:\s*,\s*Ж:\s*([\d.,]+)\s*г)?(?:\s*,\s*У:\s*([\d.,]+)\s*г)?)?/gi,
    /(?:^|\n)\s*((?:Завтрак|Обед|Ужин|Перекус|Поздний перекус|Вечерний перекус|Утренний перекус|Десерт|Добавка|Обед\s*\([^)]*\)):[^\n—\-–]{2,180})\s*[—\-–]\s*([\d.,]+)\s*ккал(?:\s*\(\s*Б:\s*([\d.,]+)\s*г(?:\s*,\s*Ж:\s*([\d.,]+)\s*г)?(?:\s*,\s*У:\s*([\d.,]+)\s*г)?)?/gi,
    /"([^"]+)"\s*[—\-–]\s*[^\n]{0,60}?([\d.,]+)\s*ккал(?:\s*\(\s*Б:\s*([\d.,]+)\s*г(?:\s*,\s*Ж:\s*([\d.,]+)\s*г)?(?:\s*,\s*У:\s*([\d.,]+)\s*г)?)?/gi,
  ]

  for (const re of patterns) {
    for (const best of text.matchAll(re)) {
      push(
        mealFromParts(
          best[1].trim(),
          num(best[2]),
          num(best[3]),
          num(best[4]),
          num(best[5]),
          { corrected: /теперь|поправил|обновил/i.test(text) },
        ),
      )
    }
  }

  // Bare: Записал! ✅ 830 ккал (Б:…) without title
  if (!/Записал\s+"/i.test(text)) {
    const bare = text.match(
      /Записал!?[^\n]*?([\d.,]+)\s*ккал\s*\(\s*Б:\s*([\d.,]+)\s*г\s*,\s*Ж:\s*([\d.,]+)\s*г\s*,\s*У:\s*([\d.,]+)\s*г/i,
    )
    if (bare) {
      push(
        mealFromParts(
          'Перекус',
          num(bare[1]),
          num(bare[2]),
          num(bare[3]),
          num(bare[4]),
          { bare: true },
        ),
      )
    }
  }

  // «Было 455, стало 505 ккал» → bump last snack/dinner via slot correction later
  return found
}

const SLOT_MAP = { завтрак: 'breakfast', обед: 'lunch', ужин: 'dinner', перекус: 'snack' }

/** Soft correction of last meal in a slot, e.g. «Итого ужин 540 ккал». */
function extractSlotCorrection(text) {
  const slotted = [
    /(?:Итого|итого)\s+(завтрак|обед|ужин|перекус)\s+([\d.,]+)\s*ккал/i,
    /(?:пересчитал|учёл|учела|уточнил|обновил)[^\n]{0,80}?(завтрак|обед|ужин|перекус)[^\n]{0,40}?теперь\s+([\d.,]+)\s*ккал/i,
    /(завтрак|обед|ужин|перекус)\s+стал[аи]?\s+(?:чуть\s+)?легче\s*[—\-–]?\s*([\d.,]+)\s*ккал/i,
    /Теперь\s+(завтрак|обед|ужин|перекус)[^\n]{0,50}?([\d.,]+)\s*ккал/i,
    /Теперь\s+ужин\s+тянет\s+на\s+([\d.,]+)\s*ккал/i,
    /ужин\s+стал[аи]?\s+[^\n]{0,50}?([\d.,]+)\s*ккал/i,
    /Добавил овощи![^\n]{0,80}?([\d.,]+)\s*ккал/i,
  ]
  for (const re of slotted) {
    const m = text.match(re)
    if (!m) continue
    if (m.length >= 3 && SLOT_MAP[m[1]?.toLowerCase()]) {
      return { mealType: SLOT_MAP[m[1].toLowerCase()], kcal: num(m[2]) }
    }
    // Patterns with only kcal (ужин / овощи)
    const kcal = num(m[1])
    if (kcal == null) continue
    if (/ужин/i.test(re.source) || /ужин/i.test(m[0])) {
      return { mealType: 'dinner', kcal }
    }
    if (/овощи/i.test(m[0])) return { mealType: 'breakfast', kcal }
    return { mealType: null, kcal, anySlot: true }
  }

  const bare = text.match(/Было\s+[\d.,]+\s*,\s*стало\s+([\d.,]+)\s*ккал/i)
  if (bare) return { mealType: null, kcal: num(bare[1]), anySlot: true }
  return null
}

/** Authoritative day total from bot summary lines. */
function extractDayTotal(text) {
  const patterns = [
    /Всего сегодня\s+([\d.,]+)\s*ккал/i,
    /Сегодня\s+([\d.,]+)\s*ккал\s*[—\-–]\s*[\d.,]+\s*%/i,
    /🔥\s*Ккал:\s*([\d.,]+)\s*\/\s*[\d.,]+/i,
    /🔥\s*Калории:\s*([\d.,]+)\s*\/\s*[\d.,]+/i,
    /Калории:\s*([\d.,]+)\s*\/\s*[\d.,]+/i,
    /Пересчёт за[^\n]*?Ккал:\s*([\d.,]+)\s*\//i,
    /Итого за день:\s*([\d.,]+)\s*ккал/i,
  ]
  let best = null
  for (const re of patterns) {
    for (const m of text.matchAll(new RegExp(re.source, `${re.flags}g`))) {
      const kcal = num(m[1])
      if (kcal != null && kcal >= 200 && kcal <= 6000) best = kcal
    }
  }
  return best
}

/** Totals explicitly for yesterday / a dated past day (not «сегодня»). */
function extractPriorDayTotal(text) {
  const patterns = [
    /Итого за вчера[^\n]{0,60}?([\d.,]+)\s*ккал/i,
    /Теперь за вчера[^\n]{0,60}?([\d.,]+)\s*ккал/i,
    /за вчера у тебя суммарно\s+([\d.,]+)\s*ккал/i,
    /за вчера\s*\([^)]+\)\s*у тебя\s+([\d.,]+)\s*ккал/i,
    /По итогам\s+\d{1,2}\s+\S+\s+получилось\s+([\d.,]+)\s*ккал/i,
    /калориями\s*[—\-–]\s*([\d.,]+)\s*ккал/i,
    /с калориями\s*[—\-–]\s*([\d.,]+)\s*ккал/i,
  ]
  let best = null
  for (const re of patterns) {
    for (const m of text.matchAll(new RegExp(re.source, `${re.flags}g`))) {
      const kcal = num(m[1])
      if (kcal != null && kcal >= 200 && kcal <= 6000) best = kcal
    }
  }
  return best
}

/** Extra dishes mentioned as «X — N ккал» when bot backfills a day. */
function extractAddedDishes(text) {
  if (!/добавил|добавила|два блюда/i.test(text)) return []
  const found = []
  const re =
    /([А-Яа-яA-Za-z0-9][^.\n—\-–]{4,120}?)\s*[—\-–]\s*([\d.,]+)\s*ккал/gi
  for (const m of text.matchAll(re)) {
    const title = m[1].replace(/^и\s+/i, '').trim()
    if (/итог|всего|базе|шаг/i.test(title)) continue
    const meal = mealFromParts(title, num(m[2]), 0, 0, 0, { corrected: true })
    if (meal) found.push(meal)
  }
  return found
}

function parseHtmlMessages(html, file) {
  const chunks = html.split(/<div class="message /)
  const messages = []
  let lastDate = ''
  let lastFrom = ''
  let lastTime = ''

  for (const chunk of chunks) {
    const idM = chunk.match(/^[^"]*"\s+id="(message-?\d+)"/)
    const titleDate = chunk.match(/title="(\d{2}\.\d{2}\.\d{4})\s+(\d{2}:\d{2}:\d{2})/)
    if (titleDate) {
      lastDate = titleDate[1]
      lastTime = titleDate[2]
    }
    const fromM = chunk.match(/<div class="from_name">\s*([^<]+)/)
    if (fromM) lastFrom = fromM[1].trim()

    const textM = chunk.match(/<div class="text">([\s\S]*?)<\/div>/)
    if (!textM || !lastDate) continue

    const text = stripHtml(textM[1])
    if (!text) continue

    messages.push({
      id: idM?.[1] ?? `msg-${file}-${messages.length}`,
      date: lastDate,
      time: lastTime,
      from: lastFrom,
      text,
      file,
    })
  }
  return messages
}

const mealById = new Map()
const weightByDate = new Map()
/** @type {Map<string, { kcal: number, time: string, messageId: string, seq: number }>} */
const dayTotalByDate = new Map()
let messageCount = 0
const allMessages = []

for (const f of files) {
  const filePath = path.join(chatDir, f)
  const html = fs.readFileSync(filePath, 'utf8')
  const messages = parseHtmlMessages(html, f)
  messageCount += messages.length
  allMessages.push(...messages)
}

allMessages.sort((a, b) => {
  const da = toIso(a.date) || ''
  const db = toIso(b.date) || ''
  if (da !== db) return da.localeCompare(db)
  return (a.time || '').localeCompare(b.time || '')
})

function upsertDayTotal(iso, kcal, time, messageId, seq) {
  if (kcal == null) return
  const prev = dayTotalByDate.get(iso)
  // Later message in chat order wins — so next-morning recap beats yesterday evening.
  if (!prev || seq >= prev.seq) {
    dayTotalByDate.set(iso, { kcal, time: time || '', messageId, seq })
  }
}

function lookBackFoodList(i) {
  for (let j = i - 1; j >= Math.max(0, i - 8); j--) {
    const prevText = allMessages[j].text
    if (
      /запиши на|я снова много|внесем очень много|давай внесем|на завтрак|бургер|съела|сделай запись за/i.test(
        prevText,
      ) &&
      !/Записал\s+"/i.test(prevText) &&
      !/🔥\s*Ккал/i.test(prevText)
    ) {
      const foodLines = prevText
        .split(/\n/)
        .map((s) => s.trim())
        .filter(
          (s) =>
            s &&
            !/запиши на|я снова|работаю с базой|переключа|давай внесем|очень много всего|надо было записать|сделай запись за|\d+\s*шагов/i.test(
              s,
            ),
        )
      if (foodLines.length) return foodLines.join(', ').slice(0, 240)
    }
  }
  return null
}

function findLatestMeal(iso, mealType) {
  let target = null
  for (const m of mealById.values()) {
    if (m.date !== iso) continue
    if (mealType && m.mealType !== mealType) continue
    if (!target || (m.time || '') >= (target.time || '')) target = m
  }
  return target
}

for (let i = 0; i < allMessages.length; i++) {
  const msg = allMessages[i]
  const msgIso = toIso(msg.date)
  if (!msgIso) continue
  if (since && msgIso < since) continue

  const year = msgIso.slice(0, 4)

  for (const upd of extractWeightUpdates(msg.text, msgIso, year)) {
    if (since && upd.date < since) continue
    const prev = weightByDate.get(upd.date)
    // Later chat message wins (corrections like «Исправил на 65.7»).
    if (!prev || i >= (prev.seq ?? -1)) {
      weightByDate.set(upd.date, {
        date: upd.date,
        time: msg.time,
        kg: upd.kg,
        messageId: msg.id,
        file: msg.file,
        seq: i,
      })
    }
  }

  const backdate =
    parseRuDayMonth(msg.text, year) ||
    (i > 0 ? parseRuDayMonth(allMessages[i - 1].text, year) : null)

  const mealsInMsg = [
    ...extractAllMealsFromText(msg.text),
    ...extractAddedDishes(msg.text),
  ]
  let mealIndex = 0
  for (const parsed of mealsInMsg) {
    let iso = msgIso
    if (parsed.bare) {
      if (backdate) iso = backdate
      else if ((msg.time || '') < '05:00:00') iso = shiftIso(msgIso, -1)
      const food = lookBackFoodList(i)
      if (food) {
        parsed.rawText = food
        parsed.title = 'Перекус'
      }
    } else if (
      backdate &&
      /запиши на|за\s+\d+|по итогам|добавил.*за\s+\d+|за\s+\d{1,2}\s+\S+/i.test(
        msg.text + ' ' + (allMessages[i - 1]?.text || ''),
      )
    ) {
      iso = backdate
    }

    if (since && iso < since) continue

    // Breakfast/lunch/dinner: later log replaces earlier (corrections).
    if (parsed.mealType !== 'snack') {
      for (const [key, m] of mealById) {
        if (m.date === iso && m.mealType === parsed.mealType) mealById.delete(key)
      }
    } else {
      // Snack corrections («по этикетке», «теперь») replace a similar earlier snack.
      const stop = new Set([
        'кофе',
        'молоком',
        'молоко',
        'хлеб',
        'творожный',
        'сыр',
        'перекус',
        'десерт',
      ])
      const tokens = new Set(
        parsed.rawText
          .toLowerCase()
          .split(/[^a-zа-яё0-9]+/i)
          .filter((w) => w.length > 4 && !stop.has(w)),
      )
      for (const [key, m] of mealById) {
        if (m.date !== iso || m.mealType !== 'snack') continue
        const other = m.rawText
          .toLowerCase()
          .split(/[^a-zа-яё0-9]+/i)
          .filter((w) => w.length > 4 && !stop.has(w))
        const shared = other.filter((w) => tokens.has(w))
        if (shared.length >= 1) mealById.delete(key)
      }
    }

    const id = mealsInMsg.length > 1 ? `${msg.id}#${mealIndex}` : msg.id
    mealIndex++
    mealById.set(id, {
      date: iso,
      time: msg.time,
      messageId: id,
      file: msg.file,
      ...parsed,
      createdAt: Date.parse(`${iso}T${msg.time || '12:00:00'}`) || Date.now(),
    })
  }

  // Soft slot / «стало N» corrections (may target yesterday / dated day)
  const corr = extractSlotCorrection(msg.text)
  if (corr?.kcal != null) {
    const corrIso =
      parseRuDayMonth(msg.text, year) ||
      (/за вчера|вчерашний день|за вчера\s*\(/i.test(msg.text)
        ? shiftIso(msgIso, -1)
        : msgIso)
    const target = findLatestMeal(corrIso, corr.mealType)
    if (target) {
      mealById.set(target.messageId, { ...target, kcal: corr.kcal, corrected: true })
    }
  }

  // «Обновил завтрак» + running day total → breakfast = that total when early in day
  if (/Обновил завтрак/i.test(msg.text)) {
    const running = extractDayTotal(msg.text)
    const breakfast = findLatestMeal(msgIso, 'breakfast')
    if (breakfast && running != null && running < 600) {
      mealById.set(breakfast.messageId, {
        ...breakfast,
        kcal: running,
        corrected: true,
      })
    }
  }

  // Bot moved dinner to previous calendar day (timezone / late night)
  if (/Перен[её]с\s+ужин\s+на\s+вчерашний\s+день/i.test(msg.text)) {
    const toIsoDay = parseRuDayMonth(msg.text, year) || shiftIso(msgIso, -1)
    const dinner = findLatestMeal(msgIso, 'dinner') || findLatestMeal(toIsoDay, 'dinner')
    if (dinner) {
      // Remove any other dinner already on target day
      for (const [key, m] of mealById) {
        if (m.date === toIsoDay && m.mealType === 'dinner' && key !== dinner.messageId) {
          mealById.delete(key)
        }
      }
      mealById.set(dinner.messageId, {
        ...dinner,
        date: toIsoDay,
        corrected: true,
      })
    }
    const prior = extractPriorDayTotal(msg.text)
    if (prior != null) upsertDayTotal(toIsoDay, prior, msg.time, msg.id, i)
  }

  // Pasta / lunch kcal rewrite: «= 897 ккал за обед»
  const lunchFix = msg.text.match(/=\s*([\d.,]+)\s*ккал за обед/i)
  if (lunchFix) {
    const kcal = num(lunchFix[1])
    let target = null
    for (const m of mealById.values()) {
      if (m.date === msgIso && m.mealType === 'lunch') {
        if (!target || (m.time || '') >= (target.time || '')) target = m
      }
    }
    if (target && kcal != null) {
      mealById.set(target.messageId, { ...target, kcal, corrected: true })
    }
  }

  // Breakfast rewrite without Записал: «Завтрак: … — 301 ккал» already in extractAll
  // Half-sandwich style: «Полсэндвича — 230 ккал» + espresso → update breakfast
  const half = msg.text.match(/Полсэндвича\s*[—\-–]\s*([\d.,]+)\s*ккал/i)
  if (half) {
    // Bot summary already folds espresso into the stated day total (230).
    const kcal = num(half[1])
    let target = null
    for (const m of mealById.values()) {
      if (m.date === msgIso && m.mealType === 'breakfast') {
        if (!target || (m.time || '') >= (target.time || '')) target = m
      }
    }
    if (target && kcal != null) {
      mealById.set(target.messageId, {
        ...target,
        kcal,
        rawText: 'полсэндвича, эспрессо тоник',
        corrected: true,
      })
    }
  }

  // «с учётом масла …: 340 ккал» / «Итого N ккал» style lunch/dinner fixes
  const oilFix = msg.text.match(
    /(?:с учётом|с учетом)[^\n]{0,40}?([\d.,]+)\s*ккал/i,
  )
  if (oilFix && /обед/i.test(msg.text)) {
    const kcal = num(oilFix[1])
    let target = null
    for (const m of mealById.values()) {
      if (m.date === msgIso && m.mealType === 'lunch') {
        if (!target || (m.time || '') >= (target.time || '')) target = m
      }
    }
    if (target && kcal != null) {
      mealById.set(target.messageId, { ...target, kcal, corrected: true })
    }
  }

  const priorTotal = extractPriorDayTotal(msg.text)
  const priorIso =
    parseRuDayMonth(msg.text, year) ||
    (/за вчера|вчерашний|про вчера|по вчера|с калориями|калориями\s*[—\-–]/i.test(msg.text)
      ? shiftIso(msgIso, -1)
      : null)
  if (priorTotal != null && priorIso && !/Всего сегодня/i.test(msg.text)) {
    upsertDayTotal(priorIso, priorTotal, msg.time, msg.id, i)
  }

  const dayTotal = extractDayTotal(msg.text)
  // Skip «Пересчёт за …» — those totals are often moved to another day a minute later.
  if (dayTotal != null && !/Пересчёт за/i.test(msg.text)) {
    // Only shift to yesterday when the digest clearly talks about yesterday.
    // Bare «🔥 Ккал: 368» after today's breakfast must NOT overwrite yesterday.
    const isMorningRecap =
      (msg.time || '') < '10:30:00' &&
      !/Всего сегодня/i.test(msg.text) &&
      !/Записал\s+"/i.test(msg.text) &&
      /вчера/i.test(msg.text) &&
      /Калории:|🔥\s*Калории|🔥\s*Ккал:|калориями\s*[—\-–]/i.test(msg.text)

    if (isMorningRecap) {
      upsertDayTotal(shiftIso(msgIso, -1), dayTotal, msg.time, msg.id, i)
    } else if (!((msg.time || '') < '10:30:00' && dayTotal < 500 && /🔥\s*Ккал:/i.test(msg.text))) {
      // Ignore tiny morning running totals as "final" for today.
      upsertDayTotal(msgIso, dayTotal, msg.time, msg.id, i)
    }
  }
}

// Reconcile to bot day totals (morning recap / «Всего сегодня» / end-of-day сводка).
{
  const sumByDate = new Map()
  for (const m of mealById.values()) {
    sumByDate.set(m.date, (sumByDate.get(m.date) || 0) + m.kcal)
  }
  for (const [iso, tot] of dayTotalByDate) {
    if (since && iso < since) continue
    let sum = Math.round(sumByDate.get(iso) || 0)
    let gap = Math.round(tot.kcal - sum)

    if (gap >= 15) {
      const idx = allMessages.findIndex((m) => m.id === tot.messageId)
      let rawText = 'сводка бота (детали в чате)'
      if (idx >= 0) {
        const food = lookBackFoodList(idx)
        if (food) rawText = food
      }
      const id = `gap-${iso}-${tot.messageId}`
      mealById.set(id, {
        date: iso,
        time: tot.time || '23:59:00',
        messageId: id,
        file: 'reconcile',
        title: 'Добор из сводки',
        mealType: 'snack',
        rawText,
        kcal: gap,
        protein: 0,
        fat: 0,
        carbs: 0,
        corrected: true,
        createdAt: Date.parse(`${iso}T${tot.time || '23:59:00'}`) || Date.now(),
      })
      sumByDate.set(iso, tot.kcal)
      continue
    }

    // Overshoot vs bot final — remove/trim latest non-breakfast meals.
    if (gap <= -15) {
      let over = -gap
      const dayMeals = [...mealById.entries()]
        .filter(([, m]) => m.date === iso)
        .sort((a, b) => (a[1].time || '').localeCompare(b[1].time || ''))
      for (let mi = dayMeals.length - 1; mi >= 0 && over > 0; mi--) {
        const [key, m] = dayMeals[mi]
        if (m.mealType === 'breakfast' && dayMeals.length > 1) continue
        if (m.kcal <= over) {
          over -= m.kcal
          mealById.delete(key)
          continue
        }
        mealById.set(key, { ...m, kcal: Math.round(m.kcal - over), corrected: true })
        over = 0
      }
      sumByDate.set(iso, tot.kcal)
    }
  }
}

let meals = [...mealById.values()].sort((a, b) =>
  a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date),
)
let weights = [...weightByDate.values()].sort((a, b) => a.date.localeCompare(b.date))

const mealsTotal = meals.length
const weightsTotal = weights.length
if (limit > 0) {
  meals = meals.slice(-limit)
  weights = weights.slice(-limit)
}

const planerMeals = meals.map((m) => ({
  id: stableId(`${m.messageId}|${m.date}|${m.mealType}|${m.kcal}`),
  date: m.date,
  mealType: m.mealType,
  rawText: m.rawText,
  items: [
    {
      name: m.rawText,
      grams: 100,
      kcal: m.kcal,
      protein: m.protein,
      fat: m.fat,
      carbs: m.carbs,
      source: 'estimate',
    },
  ],
  totals: {
    kcal: m.kcal,
    protein: m.protein,
    fat: m.fat,
    carbs: m.carbs,
  },
  isApproximate: true,
  eatingOut: false,
  createdAt: m.createdAt,
  _import: {
    title: m.title,
    messageId: m.messageId,
    corrected: m.corrected,
    time: m.time,
    file: m.file,
  },
}))

const planerWeights = weights.map((w) => ({
  id: stableId(`w|${w.date}|${w.kg}|${w.messageId}`),
  date: w.date,
  kg: w.kg,
  createdAt: Date.parse(`${w.date}T${w.time || '08:00:00'}`) || Date.now(),
  _import: {
    messageId: w.messageId,
    time: w.time,
    file: w.file,
  },
}))

// Week audit helper
function sumByDay(from, to) {
  const days = {}
  for (const m of planerMeals) {
    if (m.date < from || m.date > to) continue
    days[m.date] ??= { kcal: 0, n: 0 }
    days[m.date].kcal += m.totals.kcal
    days[m.date].n += 1
  }
  return days
}

console.log(`Папка: ${chatDir}`)
console.log(`Файлы: ${files.join(', ')}`)
console.log(`Сообщений: ${messageCount}`)
console.log(`Приёмов (каждый лог): ${mealsTotal}`)
console.log(`Весов (день): ${weightsTotal}`)
if (since) console.log(`Фильтр since: ${since}`)
if (limit) console.log(`В превью хвост limit=${limit}`)

console.log('\nПрошлая неделя 13–19.07 (суммы):')
const week = sumByDay('2026-07-13', '2026-07-19')
for (const d of Object.keys(week).sort()) {
  console.log(`  ${d}  ${week[d].n} записей  ${Math.round(week[d].kcal)} ккал`)
}
const weekWeights = planerWeights.filter((w) => w.date >= '2026-07-13' && w.date <= '2026-07-19')
console.log(`Вес за неделю: ${weekWeights.length}`)
for (const w of weekWeights) {
  console.log(`  ${w.date}  ${String(w.kg).replace('.', ',')} кг`)
}

console.log('\nВес — последние 12:')
for (const w of planerWeights.slice(-12)) {
  console.log(`  ${w.date}  ${String(w.kg).replace('.', ',')} кг`)
}

console.log('\nПриёмы — последние 12:')
for (const m of planerMeals.slice(-12)) {
  const mark = m._import.corrected ? ' (правка)' : ''
  console.log(
    `  ${m.date} ${m._import.time}  ${m.mealType.padEnd(9)}  ${Math.round(m.totals.kcal)} ккал  — ${m.rawText.slice(0, 64)}${mark}`,
  )
}

const payload = {
  source: { chatDir, files },
  counts: { meals: planerMeals.length, weights: planerWeights.length, mealsTotal, weightsTotal },
  meals: planerMeals,
  weights: planerWeights,
  replaceByDate: true,
}

fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8')
console.log(`\nПревью JSON: ${outPath}`)

const monthDir = path.join('scripts', 'tg-import-by-month')
fs.mkdirSync(monthDir, { recursive: true })
for (const old of fs.readdirSync(monthDir)) {
  if (old.startsWith('tg-import-') && old.endsWith('.json')) {
    fs.unlinkSync(path.join(monthDir, old))
  }
}

const byMonth = new Map()
for (const m of planerMeals) {
  const key = m.date.slice(0, 7)
  if (!byMonth.has(key)) byMonth.set(key, { meals: [], weights: [] })
  byMonth.get(key).meals.push(m)
}
for (const w of planerWeights) {
  const key = w.date.slice(0, 7)
  if (!byMonth.has(key)) byMonth.set(key, { meals: [], weights: [] })
  byMonth.get(key).weights.push(w)
}

console.log(`\nПо месяцам → ${monthDir}`)
for (const month of [...byMonth.keys()].sort()) {
  const { meals: mm, weights: ww } = byMonth.get(month)
  const monthPayload = {
    source: { chatDir, files, month },
    counts: { meals: mm.length, weights: ww.length },
    replaceByDate: true,
    meals: mm,
    weights: ww,
  }
  const monthFile = path.join(monthDir, `tg-import-${month}.json`)
  fs.writeFileSync(monthFile, JSON.stringify(monthPayload, null, 2), 'utf8')
  console.log(
    `  ${month}  ${mm.length} приёмов  ${ww.length} весов  → ${monthFile}`,
  )
}
console.log('Импортируй по одному месяцу и проверяй. Дни из файла перезапишутся.')
