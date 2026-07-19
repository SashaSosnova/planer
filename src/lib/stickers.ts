/** Shared bust-sticker style for anime characters. */
export const STICKER_STYLE =
  'Collectible mobile app achievement sticker, BUST PORTRAIT only head and shoulders same tight crop, clean cel-shaded anime illustration, bold uniform black outline, soft flat colors, die-cut sticker with thick white border, soft mint-teal and warm cream circular backdrop, no text, no watermark, no full body'

export function stickerPrompt(characterBrief: string): string {
  return `${STICKER_STYLE}. Character: ${characterBrief}.`
}

/** Anime stickers ready in public/stickers (personal collection). */
export const READY_STICKER_KEYS = new Set([
  // Jujutsu Kaisen
  'yuji',
  'megumi',
  'nobara',
  'gojo',
  'maki',
  // Attack on Titan
  'levi',
  'mikasa',
  'hange',
  'eren',
  'armin',
  'sasha',
  'erwin',
  // Death Note
  'lawliet',
  'ryuk',
  'near',
  // Pandora Hearts
  'oz',
  'xbreak',
  'alice',
  // Sailor Moon
  'jupiter',
  'usagi',
  'mercury',
  'mars',
  // Code Geass
  'cc',
  'lelouch',
  // Devil May Cry
  'dante',
])

export function stickerSrc(artKey: string): string {
  return `/stickers/${artKey}.png`
}

export function hasStickerArt(artKey: string): boolean {
  return READY_STICKER_KEYS.has(artKey)
}
