/** Human-facing food labels: casing and equality ignoring case. */

export function normalizeFoodLabel(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
}

export function sameFoodLabel(a: string, b: string): boolean {
  return normalizeFoodLabel(a) === normalizeFoodLabel(b)
}

/** «креветки отварные» → «Креветки отварные» */
export function capitalizeFoodName(name: string): string {
  const t = name.trim().replace(/\s+/g, ' ')
  if (!t) return t
  return t.charAt(0).toLocaleUpperCase('ru-RU') + t.slice(1)
}
