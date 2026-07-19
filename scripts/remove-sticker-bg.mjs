/**
 * Remove solid outer backgrounds from sticker PNGs (black / white / cream / mint).
 * Keeps character + black outlines; floods only from image edges.
 */
import { readdir, readFile, writeFile, copyFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dir = path.resolve(__dirname, '../public/stickers')
const bak = path.resolve(__dirname, '../public/stickers-bak')

function idx(x, y, w) {
  return (y * w + x) * 4
}

function luma(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b
}

function dist(r1, g1, b1, r2, g2, b2) {
  const dr = r1 - r2
  const dg = g1 - g2
  const db = b1 - b2
  return Math.sqrt(dr * dr + dg * dg + db * db)
}

function isSoftBackdrop(r, g, b) {
  const L = luma(r, g, b)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const sat = max === 0 ? 0 : (max - min) / max
  // cream / near-white pastel
  if (L > 200 && sat < 0.22) return true
  // mint / soft teal wash
  if (L > 150 && L < 235 && sat < 0.35 && g >= r - 8 && g >= b - 15) return true
  // warm peach wash
  if (L > 180 && sat < 0.28 && r >= g && g >= b - 10) return true
  return false
}

function sampleCorners(data, w, h) {
  const pts = [
    [2, 2],
    [w - 3, 2],
    [2, h - 3],
    [w - 3, h - 3],
    [Math.floor(w / 2), 2],
    [Math.floor(w / 2), h - 3],
    [2, Math.floor(h / 2)],
    [w - 3, Math.floor(h / 2)],
  ]
  let r = 0
  let g = 0
  let b = 0
  for (const [x, y] of pts) {
    const i = idx(x, y, w)
    r += data[i]
    g += data[i + 1]
    b += data[i + 2]
  }
  const n = pts.length
  return { r: r / n, g: g / n, b: b / n, L: luma(r / n, g / n, b / n) }
}

function removeBg(png) {
  const { width: w, height: h, data } = png
  const bg = sampleCorners(data, w, h)
  const darkMode = bg.L < 90
  const threshold = darkMode ? 55 : 48

  const alpha = new Uint8Array(w * h)
  alpha.fill(255)
  const visited = new Uint8Array(w * h)
  const q = []

  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return
    const p = y * w + x
    if (visited[p]) return
    visited[p] = 1
    q.push(p)
  }

  for (let x = 0; x < w; x++) {
    push(x, 0)
    push(x, h - 1)
  }
  for (let y = 0; y < h; y++) {
    push(0, y)
    push(w - 1, y)
  }

  const matchesBg = (r, g, b) => {
    if (darkMode) {
      return luma(r, g, b) < 70 || dist(r, g, b, bg.r, bg.g, bg.b) < threshold
    }
    // Light canvas: don't jump across ink outlines
    if (luma(r, g, b) < 85) return false
    return (
      dist(r, g, b, bg.r, bg.g, bg.b) < threshold ||
      isSoftBackdrop(r, g, b)
    )
  }

  while (q.length) {
    const p = q.pop()
    const x = p % w
    const y = (p - x) / w
    const i = p * 4
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    if (!matchesBg(r, g, b)) continue
    alpha[p] = 0
    push(x + 1, y)
    push(x - 1, y)
    push(x, y + 1)
    push(x, y - 1)
  }

  // Expand into soft circular backdrops touching cleared pixels
  let grew = true
  while (grew) {
    grew = false
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const p = y * w + x
        if (alpha[p] === 0) continue
        const i = p * 4
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]
        if (luma(r, g, b) < 85) continue
        if (!isSoftBackdrop(r, g, b) && !(darkMode && luma(r, g, b) < 50)) continue
        const nearClear =
          alpha[p - 1] === 0 ||
          alpha[p + 1] === 0 ||
          alpha[p - w] === 0 ||
          alpha[p + w] === 0
        if (!nearClear) continue
        alpha[p] = 0
        grew = true
      }
    }
  }

  for (let p = 0; p < w * h; p++) {
    data[p * 4 + 3] = alpha[p]
  }
}

await mkdir(bak, { recursive: true })
const files = (await readdir(dir)).filter((f) => f.endsWith('.png'))
console.log(`Processing ${files.length} stickers…`)

for (const file of files) {
  const inputPath = path.join(dir, file)
  await copyFile(inputPath, path.join(bak, file))
  const buf = await readFile(inputPath)
  const png = PNG.sync.read(buf)
  removeBg(png)
  const out = PNG.sync.write(png)
  await writeFile(inputPath, out)
  console.log(`  ${file}`)
}

console.log(`Done. Backups in public/stickers-bak`)
