import { mkdir, copyFile, access } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const root = path.resolve(import.meta.dirname, '..')
const res = path.join(root, 'android/app/src/main/res')
const webIcon = path.join(root, 'public/icon-512.png')
const resourcesIcon = path.join(root, 'resources/icon.png')
const src1024 = path.join(root, 'resources/icon-1024.png')

const launcher = [
  ['mipmap-mdpi', 48],
  ['mipmap-hdpi', 72],
  ['mipmap-xhdpi', 96],
  ['mipmap-xxhdpi', 144],
  ['mipmap-xxxhdpi', 192],
]

const foreground = [
  ['mipmap-mdpi', 108],
  ['mipmap-hdpi', 162],
  ['mipmap-xhdpi', 216],
  ['mipmap-xxhdpi', 324],
  ['mipmap-xxxhdpi', 432],
]

try {
  await access(src1024)
} catch {
  throw new Error(`Missing ${src1024} — place a 1024×1024 master icon there first`)
}

async function writePng(dir, name, size, input) {
  const outDir = path.join(res, dir)
  await mkdir(outDir, { recursive: true })
  const out = path.join(outDir, name)
  await sharp(input).resize(size, size).png().toFile(out)
  console.log(out)
}

/** Adaptive foreground: master scaled into safe zone on transparent canvas */
async function makeForeground(size) {
  const inner = Math.round(size * 0.72)
  const offset = Math.round((size - inner) / 2)
  const scaled = await sharp(src1024).resize(inner, inner).png().toBuffer()
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: scaled, left: offset, top: offset }])
    .png()
    .toBuffer()
}

for (const [dir, size] of launcher) {
  await writePng(dir, 'ic_launcher.png', size, src1024)
  await writePng(dir, 'ic_launcher_round.png', size, src1024)
}

for (const [dir, size] of foreground) {
  const fg = await makeForeground(size)
  const outDir = path.join(res, dir)
  await mkdir(outDir, { recursive: true })
  const out = path.join(outDir, 'ic_launcher_foreground.png')
  await sharp(fg).png().toFile(out)
  console.log(out)
}

await mkdir(path.dirname(webIcon), { recursive: true })
await sharp(src1024).resize(512, 512).png().toFile(webIcon)
await copyFile(src1024, resourcesIcon)

console.log('icons ok')
