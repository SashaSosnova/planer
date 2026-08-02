import type { CareProduct, CareSlot, CareWeekday } from '../types'

/** Bump when the default care catalog changes so clients replace the seed set. */
export const SEED_CARE_PRODUCTS_KEY = 'planer-seed-care-products-v2'
export const CARE_PRODUCTS_SEED_VERSION = 2

const MON_FRI: CareWeekday[] = ['mon', 'tue', 'wed', 'thu', 'fri']

/** Preferred application order per slot (thermal is before toner in AM, after in PM). */
export const CARE_SLOT_ORDER: Record<CareSlot, string[]> = {
  morning: ['water', 'thermal', 'dual-toner', 'soothing', 'nmf', 'spf'],
  evening: [
    'caramel',
    'dermo-cleanser',
    'dual-toner',
    'bha-pads',
    'revital',
    'thermal',
    'ha',
    'nmf',
  ],
}

export function hasSeededCareProducts(): boolean {
  if (typeof localStorage === 'undefined') return false
  try {
    return localStorage.getItem(SEED_CARE_PRODUCTS_KEY) === '1'
  } catch {
    return false
  }
}

export function markSeededCareProducts(): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(SEED_CARE_PRODUCTS_KEY, '1')
  } catch {
    /* ignore */
  }
}

/** Default routine products (stable ids). */
export function buildSeedCareProducts(now = Date.now()): CareProduct[] {
  const base = { createdAt: now, updatedAt: now }
  return [
    {
      ...base,
      id: 'water',
      name: 'Умывание прохладной водой',
      slots: ['morning'],
      days: 'every',
      sortOrder: 10,
      how: 'Умыться прохладной водой руками, без геля и без трения.',
    },
    {
      ...base,
      id: 'caramel',
      name: 'Mesopharm CLEAR:UP CARAMEL (гель-масло)',
      slots: ['evening'],
      days: MON_FRI,
      sortOrder: 10,
      how: 'На сухое лицо — массаж 1 минуту, смыть тёплой водой, эмульгируя. Смывка SPF, только Пн–Пт.',
    },
    {
      ...base,
      id: 'dermo-cleanser',
      name: 'La Roche-Posay Toleriane Dermo-Cleanser',
      slots: ['evening'],
      days: 'every',
      sortOrder: 20,
      how: 'Вспенить в руках, нанести на влажное лицо, помассировать 30 сек, смыть прохладной водой. Пн–Пт — второе очищение после Caramel; Сб/Вс — основное (без Caramel).',
    },
    {
      ...base,
      id: 'thermal',
      name: 'Термальная вода La Roche-Posay',
      slots: ['morning', 'evening'],
      days: 'every',
      sortOrder: 25,
      how: 'Распылить на лицо, подождать 10 секунд, промокнуть бумажной салфеткой. Утром — после умывания; вечером — перед гиалуронкой.',
    },
    {
      ...base,
      id: 'dual-toner',
      name: 'Celimax Dual Barrier Creamy Toner',
      slots: ['morning', 'evening'],
      days: 'every',
      sortOrder: 30,
      how: 'Похлопывающими движениями на всё лицо.',
    },
    {
      ...base,
      id: 'bha-pads',
      name: 'Celimax Cica BHA Blemish Toner Pad',
      slots: ['evening'],
      days: ['sat'],
      sortOrder: 35,
      how: 'Протереть ТОЛЬКО лоб, нос, подбородок. Щёки не трогать.',
    },
    {
      ...base,
      id: 'revital',
      name: 'Mesopharm Revital Intense Mask',
      slots: ['evening'],
      days: ['sun'],
      sortOrder: 35,
      how: 'На всё лицо (включая щёки) на 15 минут → смыть тёплой водой, промокнуть салфеткой (не тереть). Далее — термалка, HA, крем.',
    },
    {
      ...base,
      id: 'soothing',
      name: 'The Ordinary Soothing & Barrier Support Serum',
      slots: ['morning'],
      days: 'every',
      sortOrder: 40,
      how: '2–3 капли на всё лицо после тонера.',
    },
    {
      ...base,
      id: 'ha',
      name: 'The Ordinary Hyaluronic Acid 2% + B5',
      slots: ['evening'],
      days: 'every',
      sortOrder: 50,
      how: '2–3 капли на влажную кожу всего лица (после термалки).',
    },
    {
      ...base,
      id: 'nmf',
      name: 'The Ordinary Natural Moisturizing Factors + HA',
      slots: ['morning', 'evening'],
      days: 'every',
      sortOrder: 60,
      how: 'Утром: тонкий слой на всё лицо, дать впитаться 3–5 мин перед SPF. Вечером: плотный слой на всё лицо.',
    },
    {
      ...base,
      id: 'spf',
      name: 'Likoberon солнцезащитный крем SPF 50',
      slots: ['morning'],
      days: 'every',
      sortOrder: 70,
      how: 'Похлопывающими движениями на всё лицо (не растирать). Дать высохнуть 5 минут.',
    },
  ]
}

/** Ids removed from the canonical catalog (archive / delete on migrate). */
export const RETIRED_CARE_PRODUCT_IDS = [
  'squalane',
  'cerave',
] as const
