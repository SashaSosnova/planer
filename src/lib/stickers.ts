import type { AchievementId } from './achievements'

const STYLE =
  'Collectible mobile app achievement sticker, BUST PORTRAIT only (head and shoulders, same tight crop and scale as every other sticker in the set), clean cel-shaded anime illustration, bold uniform black outline, soft flat colors, friendly charming expression, die-cut sticker with thick white border, soft mint-teal and warm cream circular backdrop, no text, no watermark, no full body, no legs, no hands below chest, consistent lighting and line weight'

/** Shared visual brief so every sticker matches. */
export function stickerPrompt(characterBrief: string): string {
  return `${STYLE}. Character: ${characterBrief}.`
}

/** Unique sticker assets to generate (one file per artKey). */
export const STICKER_ART_BRIEF: Record<string, string> = {
  gustave:
    'young expedition leader man, short brown hair, kind determined eyes, beige explorer coat with suspenders, warm hopeful smile',
  sam: 'hobbit-like young man, curly light brown hair, round gentle face, simple rustic cloak, loyal warm smile',
  yuji: 'teenage boy spiky pinkish hair, friendly brown eyes, school black jacket collar, bright earnest grin',
  frodo: 'young hobbit-like man, dark curly hair, blue eyes, worried but brave look, simple travel cloak',
  geralt: 'white-haired witcher man with yellow cat-like eyes, light facial scars, black armor collar, calm stoic face',
  levi: 'short black undercut hair, sharp grey eyes, stern composed expression, Survey Corps-style cravat and dark jacket',
  mikasa: 'black hair with undercut, red scarf around neck, serious protective gaze, dark jacket collar',
  roach: 'chestnut horse head and neck bust, gentle brown eyes, bridle, soft friendly animal sticker',
  triss: 'woman with long wavy auburn red hair, green eyes, warm smile, soft mage dress neckline',
  nobara: 'young woman short brown hair with bangs, confident smirk, school uniform collar, hammer motif tiny pin only',
  megumi: 'teenage boy dark spiky hair, stoic calm eyes, school uniform collar, quiet focused look',
  hange: 'woman with messy brown hair in high ponytail, round glasses, excited curious grin, Survey Corps jacket',
  lune: 'elegant young woman with dark hair in neat style, mystical cool expression, blue-toned expedition mage attire collar',
  galadriel: 'ethereal elven woman long golden hair, serene wise eyes, silver-white gown neckline, soft glow',
  yennefer: 'pale woman with raven-black wavy hair, violet eyes, confident elegant look, black high collar with diamond motif',
  maelle: 'young woman with light hair partially masked or soft half-face covering vibe, gentle quiet eyes, expedition coat collar',
  gojo: 'tall young man fluffy white hair, black blindfold over eyes, playful grin, dark high collar jacket',
  eren: 'teenage boy brown hair, intense teal-green eyes, determined resolute expression, Survey Corps jacket collar',
  ciri: 'young woman ashen white hair, emerald green eyes, fierce hopeful look, light armor collar with swallow hint',
  aragorn: 'rugged man long dark hair slight beard, grey eyes, kingly calm smile, travel cloak and leather collar',
}

/** Anime stickers ready in public/stickers (personal collection). */
export const READY_STICKER_KEYS = new Set([
  'yuji',
  'megumi',
  'nobara',
  'gojo',
  'levi',
  'mikasa',
  'hange',
  'eren',
])

export function stickerSrc(artKey: string): string {
  return `/stickers/${artKey}.png`
}

export function hasStickerArt(artKey: string): boolean {
  return READY_STICKER_KEYS.has(artKey)
}

export type { AchievementId }
