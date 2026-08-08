/** Protect decimals like «2,5%» before splitting on commas. */
function protectDecimals(text: string): string {
  return text.replace(/(\d),(\d)/g, '$1\uE000$2')
}

function splitMealParts(text: string): string[] {
  return protectDecimals(text)
    .split(/[,;\n]+/)
    .map((p) => p.replaceAll('\uE000', ',').trim())
    .filter(Boolean)
}

/**
 * Recipe-like prose (one dish, many ingredients) — not a meal list of separate dishes.
 * Lists like «гречка, курица, хлеб, яблоко, творог, кофе» must stay multi-item.
 */
export function isComplexMealText(text: string): boolean {
  const t = text.trim()
  if (!t) return false

  const commas = (t.match(/,/g) || []).length
  if (commas < 2) return false

  const hasRecipeWords =
    /заправка|украшен|на\s+основе|ростков|отварн|марин|соус|ингредиент/i.test(t)
  const hasTrailingGrams =
    /\d+(?:[.,]\d+)?\s*(?:грамм(?:а|ов)?|гр|г)\s*$/iu.test(t)
  const longLine = t.replace(/\s+/g, ' ').length > 80

  const parts = splitMealParts(t)

  // Meal list: several short standalone items (often each with its own grams).
  const looksLikeMealList =
    parts.length >= 2 &&
    !hasRecipeWords &&
    parts.every((p) => p.length <= 72) &&
    parts.filter((p) => {
      const ownWeight = /\d+(?:[.,]\d+)?\s*(?:грамм(?:а|ов)?|гр|г|мл|ml)/iu.test(p)
      const shortName = p.split(/\s+/).length <= 8
      return ownWeight || shortName
    }).length >= Math.ceil(parts.length * 0.75)

  if (looksLikeMealList) return false

  return (
    commas >= 3 ||
    (hasRecipeWords && commas >= 2) ||
    (hasTrailingGrams && commas >= 2 && longLine)
  )
}
