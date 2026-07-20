/**
 * Print bot day totals vs imported sums for a range.
 * Usage: node scripts/audit-week-totals.mjs 2026-06-08 2026-06-14
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const from = process.argv[2] || '2026-06-08'
const to = process.argv[3] || '2026-06-14'

const chatDir = fs
  .readdirSync(path.join(os.homedir(), 'Downloads'))
  .map((n) => path.join(os.homedir(), 'Downloads', n))
  .find((p) => fs.existsSync(path.join(p, 'messages7.html')))

const files = [
  'messages.html',
  'messages2.html',
  'messages3.html',
  'messages4.html',
  'messages5.html',
  'messages6.html',
  'messages7.html',
]

function stripHtml(raw) {
  return raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&apos;/g, "'")
    .replace(/«|»/g, '"')
    .replace(/\u00a0/g, ' ')
    .trim()
}

function toIso(ddmmyyyy) {
  const m = ddmmyyyy.match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
  if (!m) return null
  return `${m[3]}-${m[2]}-${m[1]}`
}

function num(s) {
  const n = Number(String(s).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function extractDayTotal(text) {
  const patterns = [
    /Всего сегодня\s+([\d.,]+)\s*ккал/i,
    /Сегодня\s+([\d.,]+)\s*ккал\s*[—\-–]\s*[\d.,]+\s*%/i,
    /🔥\s*Ккал:\s*([\d.,]+)\s*\/\s*[\d.,]+/i,
    /🔥\s*Калории:\s*([\d.,]+)\s*\/\s*[\d.,]+/i,
    /Калории:\s*([\d.,]+)\s*\/\s*[\d.,]+/i,
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

function shiftIso(iso, days) {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

const all = []
for (const f of files) {
  const html = fs.readFileSync(path.join(chatDir, f), 'utf8')
  let d = ''
  let t = ''
  for (const chunk of html.split(/<div class="message /)) {
    const td = chunk.match(/title="(\d{2}\.\d{2}\.\d{4})\s+(\d{2}:\d{2}:\d{2})/)
    if (td) {
      d = td[1]
      t = td[2]
    }
    const tm = chunk.match(/<div class="text">([\s\S]*?)<\/div>/)
    if (!tm || !d) continue
    const text = stripHtml(tm[1])
    if (!text) continue
    const iso = toIso(d)
    if (!iso) continue
    // include next morning for recap
    if (iso < from || iso > shiftIso(to, 1)) continue
    all.push({ iso, time: t, text, id: `${iso}-${t}` })
  }
}
all.sort((a, b) => (a.iso === b.iso ? a.time.localeCompare(b.time) : a.iso.localeCompare(b.iso)))

const botFinal = new Map()
for (let seq = 0; seq < all.length; seq++) {
  const msg = all[seq]
  if (/Пересчёт за/i.test(msg.text)) continue

  const prior = extractPriorDayTotal(msg.text)
  if (prior != null && !/Всего сегодня/i.test(msg.text)) {
    const dated = msg.text.match(
      /(?:на|за|итогам|день\s*\()\s*(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)/i,
    )
    let iso = msg.iso
    if (dated) {
      const months = {
        января: '01',
        февраля: '02',
        марта: '03',
        апреля: '04',
        мая: '05',
        июня: '06',
        июля: '07',
        августа: '08',
        сентября: '09',
        октября: '10',
        ноября: '11',
        декабря: '12',
      }
      iso = `${msg.iso.slice(0, 4)}-${months[dated[2].toLowerCase()]}-${String(dated[1]).padStart(2, '0')}`
    } else if (/за вчера|вчерашний|про вчера|по вчера|калориями\s*[—\-–]/i.test(msg.text)) {
      iso = shiftIso(msg.iso, -1)
    }
    if (iso >= from && iso <= to) {
      const prev = botFinal.get(iso)
      if (!prev || seq >= prev.seq) botFinal.set(iso, { kcal: prior, time: msg.time, seq })
    }
  }

  const total = extractDayTotal(msg.text)
  if (total == null) continue
  const isMorningRecap =
    (msg.time || '') < '10:30:00' &&
    !/Всего сегодня/i.test(msg.text) &&
    !/Записал\s+"/i.test(msg.text) &&
    /вчера/i.test(msg.text) &&
    /Калории:|🔥\s*Калории|🔥\s*Ккал:|калориями\s*[—\-–]/i.test(msg.text)
  const iso = isMorningRecap ? shiftIso(msg.iso, -1) : msg.iso
  if (iso < from || iso > to) continue
  // Ignore tiny morning running totals as "final" for today.
  if (!isMorningRecap && (msg.time || '') < '10:30:00' && total < 500 && /🔥\s*Ккал:/i.test(msg.text)) {
    continue
  }
  const prev = botFinal.get(iso)
  if (!prev || seq >= prev.seq) botFinal.set(iso, { kcal: total, time: msg.time, seq })
}

const preview = JSON.parse(fs.readFileSync('scripts/tg-import-preview.json', 'utf8'))
const by = {}
for (const m of preview.meals) {
  if (m.date < from || m.date > to) continue
  by[m.date] ??= { sum: 0, n: 0 }
  by[m.date].sum += m.totals.kcal
  by[m.date].n++
}

console.log(`Range ${from}..${to}`)
let botSum = 0
let impSum = 0
let days = 0
for (let d = new Date(`${from}T12:00:00`); ; d.setDate(d.getDate() + 1)) {
  const iso = d.toISOString().slice(0, 10)
  if (iso > to) break
  const bot = botFinal.get(iso)?.kcal
  const imp = by[iso]?.sum
  const mark =
    bot != null && imp != null && Math.abs(bot - imp) > 40 ? ' <<' : ''
  console.log(
    `${iso}  bot=${bot ?? '—'}  import=${imp != null ? Math.round(imp) : '—'}  meals=${by[iso]?.n ?? 0}${mark}`,
  )
  if (bot != null) botSum += bot
  if (imp != null) impSum += imp
  days++
}
console.log(`AVG bot=${Math.round(botSum / days)}  import=${Math.round(impSum / days)}`)

console.log('\n--- missing-looking messages (Записал / ккал without import match) ---')
for (const msg of all) {
  if (msg.iso < from || msg.iso > to) continue
  if (!/Записал|Всего сегодня|🔥\s*Ккал|ккал\s*\(/i.test(msg.text)) continue
  if (!/Записал|Всего сегодня|Б:\s*[\d.,]+/i.test(msg.text)) continue
  console.log(`\n${msg.iso} ${msg.time}`)
  console.log(msg.text.replace(/\n/g, ' | ').slice(0, 220))
}
