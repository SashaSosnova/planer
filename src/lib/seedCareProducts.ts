import type { CareProduct, CareSlot, CareWeekday } from '../types'

/** Bump when the default care catalog changes so clients replace the seed set. */
export const SEED_CARE_PRODUCTS_KEY = 'planer-seed-care-products-v3'
export const CARE_PRODUCTS_SEED_VERSION = 3

/**
 * New routine (order, Anthelios SPF, updated how-texts) applies from this evening.
 * Mornings before the next day still show the previous catalog (Likoberon etc.).
 */
export const CARE_V3_EVENING_FROM = '2026-08-05'
export const CARE_V3_MORNING_FROM = '2026-08-06'

const MON_FRI: CareWeekday[] = ['mon', 'tue', 'wed', 'thu', 'fri']

/** Preferred application order per slot (current / v3). */
export const CARE_SLOT_ORDER: Record<CareSlot, string[]> = {
  morning: ['water', 'thermal', 'dual-toner', 'soothing', 'nmf', 'spf'],
  evening: [
    'caramel',
    'dermo-cleanser',
    'bha-pads',
    'revital',
    'thermal',
    'dual-toner',
    'ha',
    'nmf',
  ],
}

/** Pre-v3 evening order: toner before thermal; BHA after toner. */
export const CARE_SLOT_ORDER_V2: Record<CareSlot, string[]> = {
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

/** Name/how overlay for dates before the v3 cutoff (stable seed ids). */
export const CARE_PRODUCT_OVERLAY_V2: Record<string, { name: string; how: string }> = {
  water: {
    name: 'Умывание прохладной водой',
    how: 'Умыться прохладной водой руками, без геля и без трения.',
  },
  caramel: {
    name: 'Mesopharm CLEAR:UP CARAMEL (гель-масло)',
    how: 'На сухое лицо — массаж 1 минуту, смыть тёплой водой, эмульгируя. Смывка SPF, только Пн–Пт.',
  },
  'dermo-cleanser': {
    name: 'La Roche-Posay Toleriane Dermo-Cleanser',
    how: 'Вспенить в руках, нанести на влажное лицо, помассировать 30 сек, смыть прохладной водой. Пн–Пт — второе очищение после Caramel; Сб/Вс — основное (без Caramel).',
  },
  thermal: {
    name: 'Термальная вода La Roche-Posay',
    how: 'Распылить на лицо, подождать 10 секунд, промокнуть бумажной салфеткой. Утром — после умывания; вечером — перед гиалуронкой.',
  },
  'dual-toner': {
    name: 'Celimax Dual Barrier Creamy Toner',
    how: 'Похлопывающими движениями на всё лицо.',
  },
  'bha-pads': {
    name: 'Celimax Cica BHA Blemish Toner Pad',
    how: 'Протереть ТОЛЬКО лоб, нос, подбородок. Щёки не трогать.',
  },
  revital: {
    name: 'Mesopharm Revital Intense Mask',
    how: 'На всё лицо (включая щёки) на 15 минут → смыть тёплой водой, промокнуть салфеткой (не тереть). Далее — термалка, HA, крем.',
  },
  soothing: {
    name: 'The Ordinary Soothing & Barrier Support Serum',
    how: '2–3 капли на всё лицо после тонера.',
  },
  ha: {
    name: 'The Ordinary Hyaluronic Acid 2% + B5',
    how: '2–3 капли на влажную кожу всего лица (после термалки).',
  },
  nmf: {
    name: 'The Ordinary Natural Moisturizing Factors + HA',
    how: 'Утром: тонкий слой на всё лицо, дать впитаться 3–5 мин перед SPF. Вечером: плотный слой на всё лицо.',
  },
  spf: {
    name: 'Likoberon солнцезащитный крем SPF 50',
    how: 'Похлопывающими движениями на всё лицо (не растирать). Дать высохнуть 5 минут.',
  },
}

export type CareCatalogVersion = 2 | 3

/** Which catalog to show for a calendar day + slot. */
export function careCatalogVersionFor(date: string, slot: CareSlot): CareCatalogVersion {
  if (slot === 'evening') {
    return date >= CARE_V3_EVENING_FROM ? 3 : 2
  }
  return date >= CARE_V3_MORNING_FROM ? 3 : 2
}

export function careSlotOrderFor(version: CareCatalogVersion): Record<CareSlot, string[]> {
  return version === 2 ? CARE_SLOT_ORDER_V2 : CARE_SLOT_ORDER
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

/** Default routine products (stable ids) — current / v3 catalog. */
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
      how: 'На сухое лицо — мягкий массаж до 1 минуты (без сильного давления на щёки), смыть тёплой водой, эмульгируя. Смывка SPF, только Пн–Пт. При усилении красноты — сократить до 3×/нед.',
    },
    {
      ...base,
      id: 'dermo-cleanser',
      name: 'La Roche-Posay Toleriane Dermo-Cleanser',
      slots: ['evening'],
      days: 'every',
      sortOrder: 20,
      how: 'Вспенить в руках, нанести на влажное лицо, помассировать 30 сек без трения, смыть прохладной или чуть тёплой водой. Пн–Пт — второе очищение после Caramel; Сб/Вс — основное (без Caramel).',
    },
    {
      ...base,
      id: 'thermal',
      name: 'Термальная вода La Roche-Posay',
      slots: ['morning', 'evening'],
      days: 'every',
      sortOrder: 25,
      how: 'Распылить на лицо, подождать до 10 секунд, промокнуть салфеткой (не тереть) — кожа должна остаться чуть влажной. Утро: после умывания, перед тонером. Вечер: после очищения (и после паузы BHA в субботу) / после маски в воскресенье — перед тонером.',
    },
    {
      ...base,
      id: 'dual-toner',
      name: 'Celimax Dual Barrier Creamy Toner',
      slots: ['morning', 'evening'],
      days: 'every',
      sortOrder: 30,
      how: 'На чуть влажную кожу после термалки — похлопывающими движениями на всё лицо. В субботу — после паузы BHA и термалки.',
    },
    {
      ...base,
      id: 'bha-pads',
      name: 'Celimax Cica BHA Blemish Toner Pad',
      slots: ['evening'],
      days: ['sat'],
      sortOrder: 35,
      how: 'Протереть ТОЛЬКО лоб, нос, подбородок. Щёки не трогать. Подождать 10–15 минут, затем термалка и дальше по уходу.',
    },
    {
      ...base,
      id: 'revital',
      name: 'Mesopharm Revital Intense Mask',
      slots: ['evening'],
      days: ['sun'],
      sortOrder: 35,
      how: 'После очищения, до тонера. На щёки — обычный слой, на Т-зону — тоньше. Держать 15 минут (при красноте — 10 мин или акцент на щёки). Смыть тёплой водой, промокнуть. Далее — термалка → тонер → HA → крем.',
    },
    {
      ...base,
      id: 'soothing',
      name: 'The Ordinary Soothing & Barrier Support Serum',
      slots: ['morning'],
      days: 'every',
      sortOrder: 40,
      how: '2–3 капли на всё лицо после тонера. Только утром.',
    },
    {
      ...base,
      id: 'ha',
      name: 'The Ordinary Hyaluronic Acid 2% + B5',
      slots: ['evening'],
      days: 'every',
      sortOrder: 50,
      how: '2–3 капли на чуть влажную кожу всего лица после термалки и тонера. Если кожа уже высохла — снова лёгкий туман термалки, затем HA. Только вечером.',
    },
    {
      ...base,
      id: 'nmf',
      name: 'The Ordinary Natural Moisturizing Factors + HA',
      slots: ['morning', 'evening'],
      days: 'every',
      sortOrder: 60,
      how: 'Утром: тонкий слой на всё лицо, дать впитаться 3–5 мин перед SPF. Вечером: плотный слой на всё лицо после HA.',
    },
    {
      ...base,
      id: 'spf',
      name: 'La Roche-Posay Anthelios UVMune 400 Invisible Fluid SPF50+',
      slots: ['morning'],
      days: 'every',
      sortOrder: 70,
      how: '½–¾ ч. л. (или 2 нажатия) на лицо после NMF. Наносить похлопывая, не растирать. Дать высохнуть 5 минут. При долгом солнце обновлять каждые 2 часа.',
    },
  ]
}

/** Ids removed from the canonical catalog (archive / delete on migrate). */
export const RETIRED_CARE_PRODUCT_IDS = [
  'squalane',
  'cerave',
] as const
