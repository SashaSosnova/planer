const STOP = new Set([
  'для',
  'без',
  'про',
  'или',
  'со',
  'на',
  'из',
  'и',
  'с',
  'the',
])

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripJunk(s: string): string {
  return normalize(s)
    .replace(/%/g, ' % ')
    .replace(/[^\p{L}\p{N}\s%]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Rough Russian adjective/noun case endings → shorter stem for matching. */
function softStem(token: string): string | null {
  if (token.length < 5) return null
  const endings = [
    'ыми',
    'ими',
    'ого',
    'ему',
    'ому',
    'ыми',
    'ами',
    'ями',
    'ией',
    'ой',
    'ый',
    'ий',
    'ая',
    'яя',
    'ое',
    'ее',
    'ые',
    'ие',
    'ом',
    'ем',
    'ой',
    'ей',
    'ую',
    'юю',
    'ов',
    'ев',
    'ах',
    'ях',
  ]
  for (const end of endings) {
    if (token.endsWith(end) && token.length - end.length >= 3) {
      return token.slice(0, -end.length)
    }
  }
  return null
}

function significantTokens(name: string): string[] {
  return stripJunk(name)
    .split(' ')
    .filter((t) => t.length >= 3 && !STOP.has(t) && !/^\d/.test(t) && t !== '%')
}

/**
 * Build search aliases from a product name so the user doesn't type them.
 * «Форель слабосоленая» → форель, слабосоленая форель, stems…
 * «Молоко 2,5%» → молоко, молоко 2 5, …
 */
export function generateAliases(name: string): string[] {
  const raw = name.trim()
  if (!raw) return []

  const aliases = new Set<string>()
  const full = stripJunk(raw)
  if (full) aliases.add(full)

  // Without fat %: «молоко 2,5%» → «молоко»
  const withoutFat = full.replace(/\s*\d+(?:[.,]\d+)?\s*%/g, '').trim()
  if (withoutFat && withoutFat !== full) aliases.add(withoutFat)

  const tokens = significantTokens(raw)
  for (const t of tokens) {
    aliases.add(t)
    const stem = softStem(t)
    if (stem && stem.length >= 3) aliases.add(stem)
  }

  // 2-word swap: «творожный сыр» ↔ «сыр творожный»
  if (tokens.length === 2) {
    aliases.add(`${tokens[1]} ${tokens[0]}`)
  }

  // Head noun + rest: keep first token as short key if multi-word
  if (tokens.length >= 2) {
    aliases.add(tokens[0])
    // last token often the product: сыр, форель, хлеб
    const last = tokens[tokens.length - 1]
    if (last.length >= 3) aliases.add(last)
  }

  // Drop the exact full name from aliases list (stored separately as name)
  const normName = stripJunk(raw)
  aliases.delete(normName)

  return [...aliases].filter((a) => a.length >= 2).slice(0, 24)
}
