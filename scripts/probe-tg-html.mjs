import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const downloads = path.join(os.homedir(), 'Downloads')
const chat = fs
  .readdirSync(downloads)
  .map((n) => path.join(downloads, n))
  .find((p) => fs.existsSync(path.join(p, 'messages7.html')))

if (!chat) {
  console.error('chat folder not found')
  process.exit(1)
}
console.log('chat', chat)

const html = fs.readFileSync(path.join(chat, 'messages7.html'), 'utf8')
const parts = html.split(/<div class="message /)

function stripHtml(raw) {
  return raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/«|»/g, '"')
    .trim()
}

const meals = []
const weights = []
const corr = []

for (const part of parts) {
  const dateM = part.match(/title="(\d{2}\.\d{2}\.\d{4})[^"]*"/)
  const fromM = part.match(/<div class="from_name">\s*([^<]+)/)
  const textM = part.match(/<div class="text">([\s\S]*?)<\/div>/)
  if (!textM) continue
  const text = stripHtml(textM[1])
  const from = (fromM ? fromM[1] : '').trim()
  const date = dateM ? dateM[1] : ''
  const first = text.split('\n')[0] ?? ''

  if (/Записал\s+\d+[.,]?\d*\s*кг/i.test(first)) {
    weights.push({ date, text: first })
    continue
  }

  const m = text.match(
    /Записал\s+"([^"]+)"\s*,?\s*([\d.,]+)\s*ккал\s*\(\s*Б:\s*([\d.,]+)\s*г\s*,\s*Ж:\s*([\d.,]+)\s*г\s*,\s*У:\s*([\d.,]+)\s*г/i,
  )
  if (m) {
    meals.push({
      date,
      from,
      title: m[1],
      kcal: m[2],
      p: m[3],
      f: m[4],
      c: m[5],
      head: first.slice(0, 180),
    })
  }

  if (
    /исправ|перезапис|заменил|обновил|было\s*[\d.,]+.*стало\s*[\d.,]+/i.test(text) &&
    /ккал/i.test(text)
  ) {
    corr.push({ date, from, text: text.slice(0, 280).replace(/\n/g, ' | ') })
  }
}

console.log('meals', meals.length, 'weights', weights.length, 'corr', corr.length)
console.log('last 5 meals:\n', JSON.stringify(meals.slice(-5), null, 2))
console.log('first 3 meals:\n', JSON.stringify(meals.slice(0, 3), null, 2))
console.log('corr samples:\n', JSON.stringify(corr.slice(0, 8), null, 2))
