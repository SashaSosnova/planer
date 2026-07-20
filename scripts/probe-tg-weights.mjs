import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const downloads = path.join(os.homedir(), 'Downloads')
const chat = fs
  .readdirSync(downloads)
  .map((n) => path.join(downloads, n))
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

const rx = /Записал\s+(\d+[.,]\d+|\d+)\s*кг/gi
const all = []

for (const f of files) {
  const p = path.join(chat, f)
  if (!fs.existsSync(p)) continue
  const html = fs.readFileSync(p, 'utf8')
  const parts = html.split(/<div class="message /)
  let lastDate = ''
  for (const chunk of parts) {
    const td = chunk.match(/title="(\d{2}\.\d{2}\.\d{4})/)
    if (td) lastDate = td[1]
    const tm = chunk.match(/<div class="text">([\s\S]*?)<\/div>/)
    if (!tm || !lastDate) continue
    const text = tm[1]
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .trim()
    for (const x of text.matchAll(rx)) {
      all.push({
        file: f,
        date: lastDate,
        kg: x[1].replace(',', '.'),
        line: text.split('\n')[0].slice(0, 120),
      })
    }
  }
}

console.log('weight hits', all.length)
console.log('unique dates', new Set(all.map((a) => a.date)).size)
console.log('last 12:')
console.log(JSON.stringify(all.slice(-12), null, 2))
