import { mkdir, copyFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const root = path.resolve(import.meta.dirname, '..')
const src = path.join(
  process.env.USERPROFILE ?? '',
  '.cursor/projects/c-Users-amles-Projects-planer/assets/planer-icon-1024.png',
)
const res = path.join(root, 'android/app/src/main/res')
const webIcon = path.join(root, 'public/icon-512.png')

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

async function writePng(dir, name, size) {
  const outDir = path.join(res, dir)
  await mkdir(outDir, { recursive: true })
  const out = path.join(outDir, name)
  await sharp(src).resize(size, size).png().toFile(out)
  console.log(out)
}

for (const [dir, size] of launcher) {
  await writePng(dir, 'ic_launcher.png', size)
  await writePng(dir, 'ic_launcher_round.png', size)
}

for (const [dir, size] of foreground) {
  await writePng(dir, 'ic_launcher_foreground.png', size)
}

await mkdir(path.dirname(webIcon), { recursive: true })
await sharp(src).resize(512, 512).png().toFile(webIcon)
await copyFile(src, path.join(root, 'resources/icon.png')).catch(async () => {
  await mkdir(path.join(root, 'resources'), { recursive: true })
  await copyFile(src, path.join(root, 'resources/icon.png'))
})

console.log('icons ok')
