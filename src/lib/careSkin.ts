import type { CareSkinDelta, CareSkinTags } from '../types'

export type CareSkinKey = keyof CareSkinTags

export const CARE_SKIN_DELTAS: { value: CareSkinDelta; label: string }[] = [
  { value: '+', label: '+' },
  { value: '0', label: '0' },
  { value: '-', label: '−' },
]

export const CARE_SKIN_OPTIONS: {
  key: CareSkinKey
  label: string
  question: string
  short: string
}[] = [
  {
    key: 'tzoneOil',
    label: 'Жирность Т-зоны',
    question: 'Кожа менее жирная, чем вчера? Блеск спокойнее?',
    short: 'жир',
  },
  {
    key: 'cheekDry',
    label: 'Сухость щёк',
    question: 'Меньше стянутости? Шелушений нет?',
    short: 'щёки',
  },
  {
    key: 'redness',
    label: 'Купероз (краснота)',
    question: 'Покраснение светлее? Сосуды не так заметны?',
    short: 'красн',
  },
  {
    key: 'tzoneTexture',
    label: 'Рельеф Т-зоны',
    question: 'Комедонов меньше на ощупь? Кожа глаже?',
    short: 'рельеф',
  },
]

export const CARE_SKIN_PROFILE =
  'Комби-чувствительная + купероз: Т-зона жирная/комедоны, щёки суховатые и краснеют, барьер слабый.'

export function hasCareSkinTags(skin: CareSkinTags | undefined): boolean {
  if (!skin) return false
  return CARE_SKIN_OPTIONS.some((g) => skin[g.key] != null)
}

export function countSkinDeltas(skin: CareSkinTags | undefined): {
  up: number
  same: number
  down: number
  filled: number
} {
  let up = 0
  let same = 0
  let down = 0
  for (const g of CARE_SKIN_OPTIONS) {
    const v = skin?.[g.key]
    if (v === '+') up++
    else if (v === '0') same++
    else if (v === '-') down++
  }
  return { up, same, down, filled: up + same + down }
}

/** Short verdict from today's deltas (only when all 4 filled). */
export function careSkinVerdict(skin: CareSkinTags | undefined): string | null {
  const { up, down, filled } = countSkinDeltas(skin)
  if (filled < 4) return null
  if (down === 0 && up === 4) return 'Все «+» — уход идеальный, продолжайте'
  if (down === 0 && up >= 3) return 'Сильный плюс — кожа восстанавливается'
  if (down >= 3) return 'Много «−» — база на 2 дня (без BHA/Caramel), только NMF + термалка'
  if (down >= 1) return 'Лёгкий сбой — наблюдать завтра'
  return 'Без изменений — держите план'
}

/** Short marks for summary, e.g. «жир:+ · щёки:0 · красн:− · рельеф:0». */
export function formatCareSkinBrief(skin: CareSkinTags | undefined): string {
  if (!hasCareSkinTags(skin)) return '—'
  const parts: string[] = []
  for (const g of CARE_SKIN_OPTIONS) {
    const v = skin![g.key]
    if (!v) continue
    const mark = v === '-' ? '−' : v
    parts.push(`${g.short}:${mark}`)
  }
  return parts.length ? parts.join(' · ') : '—'
}
