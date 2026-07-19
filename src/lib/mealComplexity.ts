/** Long recipe-like lines with many commas — local splitter breaks these. */
export function isComplexMealText(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  const commas = (t.match(/,/g) || []).length
  const hasRecipeWords =
    /заправка|украшен|на\s+основе|ростков|отварн|марин|соус|ингредиент/i.test(t)
  const hasTrailingGrams = /(?:^|\n)\s*\d+(?:[.,]\d+)?\s*(?:грамм(?:а|ов)?|гр|г)\s*$/iu.test(t)
  const longLine = t.replace(/\s+/g, ' ').length > 80

  return commas >= 3 || (hasRecipeWords && commas >= 2) || (hasTrailingGrams && commas >= 2 && longLine)
}
