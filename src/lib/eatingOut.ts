/** Phrases that mean the meal was away from home / restaurant-style. */
const EATING_OUT_RE =
  /(вне\s*дома|не\s*дома|в\s*кафе|в\s*ресторане|в\s*столовой|на\s*вынос|ресторан|кафе|фастфуд|макдак|кулинари[яи]|delivery|takeaway|заказ\s*из|доставк)/i

export function textSuggestsEatingOut(text: string): boolean {
  return EATING_OUT_RE.test(text.trim())
}

/** Strip marker phrases so they don't become fake food items. */
export function stripEatingOutMarkers(text: string): string {
  return text
    .replace(EATING_OUT_RE, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[,;\s]+|[,;\s]+$/g, '')
    .trim()
}
