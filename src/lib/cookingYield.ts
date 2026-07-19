/**
 * Approximate cooked weight / raw weight.
 * Calories stay with the food; only density (per 100g cooked) changes.
 */
const YIELD_RULES: Array<{ match: RegExp; factor: number; note: string }> = [
  { match: /спагетт|макарон|паста|лапш|вермишел|сухи/i, factor: 2.3, note: 'макароны набухают' },
  { match: /рис\b.*сух|сухой рис|крупа/i, factor: 2.5, note: 'крупа набухает' },
  { match: /греч/i, factor: 2.2, note: 'гречка набухает' },
  { match: /овсян|геркулес/i, factor: 3.0, note: 'овсянка разваривается' },
  { match: /курин|филе|грудк|индейк|мясо|говяд|свинин|фарш/i, factor: 0.75, note: 'мясо ужаривается' },
  { match: /кабачок|цукини|баклажан|гриб/i, factor: 0.55, note: 'овощи сильно ужариваются' },
  { match: /лук|морков|перец|помидор|томат/i, factor: 0.7, note: 'овощи ужариваются' },
  { match: /сливк|молоко|сок|бульон|вода/i, factor: 0.85, note: 'жидкость частично выкипает' },
  { match: /масло|оливк/i, factor: 1.0, note: 'жир почти без потерь' },
  { match: /сыр|творог/i, factor: 0.95, note: 'сыр почти без потерь' },
]

export function guessYieldFactor(ingredientName: string): { factor: number; note: string } {
  const n = ingredientName.toLowerCase().replace(/ё/g, 'е')
  for (const rule of YIELD_RULES) {
    if (rule.match.test(n)) return { factor: rule.factor, note: rule.note }
  }
  return { factor: 0.9, note: 'небольшая потеря влаги при готовке' }
}
