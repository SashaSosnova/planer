import type { CareWeekday } from '../types'

/** Static face-care routine helpers (rules, weekday labels, legacy catalog). */

export type { CareWeekday }

export type CareCheckStep = {
  id: string
  text: string
}

export type CareCatalogProduct = {
  id: string
  name: string
  when: string
  how: string
}

export type CareProductGroup = {
  id: string
  title: string
  hint?: string
  products: CareCatalogProduct[]
}

export type CareDayEvening = {
  weekday: CareWeekday
  label: string
  title: string
  steps: CareCheckStep[]
}

export type CareDayFlags = {
  caramel: boolean
  bha: boolean
  mask: boolean
}

export const CARE_WEEKDAY_ORDER: CareWeekday[] = [
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat',
  'sun',
]

export const CARE_WEEKDAY_SHORT: Record<CareWeekday, string> = {
  mon: 'Пн',
  tue: 'Вт',
  wed: 'Ср',
  thu: 'Чт',
  fri: 'Пт',
  sat: 'Сб',
  sun: 'Вс',
}

export const CARE_WEEKDAY_LONG: Record<CareWeekday, string> = {
  mon: 'Понедельник',
  tue: 'Вторник',
  wed: 'Среда',
  thu: 'Четверг',
  fri: 'Пятница',
  sat: 'Суббота',
  sun: 'Воскресенье',
}

const JS_DAY_TO_CARE: CareWeekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

export function careWeekdayFromDate(date: Date): CareWeekday {
  return JS_DAY_TO_CARE[date.getDay()] ?? 'mon'
}

export const CARE_RULES: string[] = [
  'Caramel — только Пн–Пт вечером: смывка SPF на сухое лицо; массаж мягкий, без сильного давления на щёки. При усилении красноты — сократить до 3×/нед.',
  'BHA-пэд — только по субботам и строго на Т-зону (лоб, нос, подбородок); щёки не трогать. После BHA — пауза 10–15 минут до следующих средств.',
  'Caramel и BHA никогда не встречаются: в субботу и воскресенье Caramel отдыхает.',
  'Воскресенье — день маски Revital: после очищения сразу маска (без тонера до маски); без Caramel и без BHA. Т-зону покрывать тоньше; при красноте — 10 минут.',
  'Утром — умывание прохладной водой руками (без геля), затем термалка → тонер → сыворотка → крем → SPF.',
  'Вечером второе очищение — пенка La Roche-Posay Toleriane Dermo-Cleanser (в выходные она же основное).',
  'Вода для умывания — прохладная или чуть тёплая (не горячая). Caramel смывать тёплой.',
  'Никогда не тереть лицо полотенцем — только промокательные движения.',
  'Вечером после очищения: термалка → тонер → HA на влажную кожу → NMF плотным слоем на всё лицо. Утром HA не используется.',
  'SPF (Anthelios UVMune 400 Invisible Fluid) — похлопывая, не растирать; дать высохнуть 5 минут.',
  'При сильном ухудшении: база на 2 дня (без BHA/Caramel), только NMF + термалка.',
]

export const CARE_PRODUCT_GROUPS: CareProductGroup[] = [
  {
    id: 'cleanse',
    title: 'Очищение',
    hint: 'Утро + вечер',
    products: [
      {
        id: 'water',
        name: 'Умывание прохладной водой',
        when: 'Каждое утро',
        how: 'Умыться прохладной водой руками, без геля и без трения.',
      },
      {
        id: 'caramel',
        name: 'Mesopharm CLEAR:UP CARAMEL (гель-масло)',
        when: 'Пн–Пт вечером (смывка SPF)',
        how: 'На сухое лицо — мягкий массаж до 1 минуты (без сильного давления на щёки), смыть тёплой водой, эмульгируя. При усилении красноты — сократить до 3×/нед.',
      },
      {
        id: 'dermo-cleanser',
        name: 'La Roche-Posay Toleriane Dermo-Cleanser',
        when: 'Каждый вечер',
        how: 'Вспенить в руках, нанести на влажное лицо, помассировать 30 сек без трения, смыть прохладной или чуть тёплой водой.',
      },
    ],
  },
  {
    id: 'toners',
    title: 'Тонеры и термалка',
    hint: 'Утро + вечер',
    products: [
      {
        id: 'thermal',
        name: 'Термальная вода La Roche-Posay',
        when: 'Утро после умывания + вечер перед тонером',
        how: 'Распылить, подождать до 10 секунд, промокнуть салфеткой — кожа чуть влажная.',
      },
      {
        id: 'dual-toner',
        name: 'Celimax Dual Barrier Creamy Toner',
        when: 'Каждое утро + вечер',
        how: 'На чуть влажную кожу после термалки — похлопывающими движениями на всё лицо.',
      },
      {
        id: 'bha-pads',
        name: 'Celimax Cica BHA Blemish Toner Pad',
        when: 'Только суббота',
        how: 'Протереть только лоб, нос, подбородок. Щёки не трогать. Пауза 10–15 минут до следующих средств.',
      },
    ],
  },
  {
    id: 'serums',
    title: 'Сыворотки',
    hint: 'Утро + вечер',
    products: [
      {
        id: 'soothing',
        name: 'The Ordinary Soothing & Barrier Support Serum',
        when: 'Каждое утро',
        how: '2–3 капли на всё лицо после тонера.',
      },
      {
        id: 'ha',
        name: 'The Ordinary Hyaluronic Acid 2% + B5',
        when: 'Каждый вечер',
        how: '2–3 капли на чуть влажную кожу после термалки и тонера.',
      },
    ],
  },
  {
    id: 'creams',
    title: 'Кремы и защита',
    hint: 'Утро + вечер',
    products: [
      {
        id: 'nmf',
        name: 'The Ordinary Natural Moisturizing Factors + HA',
        when: 'Утро + вечер — всё лицо',
        how: 'Утром: тонкий слой, 3–5 мин перед SPF. Вечером: плотный слой на всё лицо после HA.',
      },
      {
        id: 'spf',
        name: 'La Roche-Posay Anthelios UVMune 400 Invisible Fluid SPF50+',
        when: 'Каждое утро (финиш)',
        how: '½–¾ ч. л. (или 2 нажатия) после NMF. Похлопать, не растирать. Высохнуть 5 минут.',
      },
    ],
  },
  {
    id: 'masks',
    title: 'Маски',
    hint: '1 раз в неделю',
    products: [
      {
        id: 'revital',
        name: 'Mesopharm Revital Intense Mask',
        when: 'Воскресенье',
        how: 'После очищения, до тонера. Щёки — обычный слой, Т-зона — тоньше. 15 мин (при красноте — 10). Смыть → термалка → тонер → HA → крем.',
      },
    ],
  },
]

export const CARE_MORNING_STEPS: CareCheckStep[] = [
  { id: 'm1', text: 'Умыться прохладной водой руками, без геля и без трения' },
  { id: 'm2', text: 'Термальная вода LRP — распылить, до 10 сек, промокнуть (кожа чуть влажная)' },
  { id: 'm3', text: 'Celimax Dual Barrier Toner — похлопать на всё лицо' },
  { id: 'm4', text: 'TO Barrier Support Serum — 2–3 капли на всё лицо' },
  { id: 'm5', text: 'TO NMF + HA — тонкий слой на всё лицо, 3–5 мин' },
  {
    id: 'm6',
    text: 'LRP Anthelios UVMune 400 Invisible Fluid SPF50+ — похлопать, высохнуть 5 мин',
  },
]

/** Пн–Пт: Caramel + пенка, без BHA. */
const eveningCaramel: CareCheckStep[] = [
  {
    id: 'e-caramel',
    text: 'Mesopharm Caramel — на сухое лицо, мягкий массаж до 1 мин, смыть тёплой водой эмульгируя',
  },
  { id: 'e-dermo', text: 'LRP Toleriane Dermo-Cleanser — вспенить, 30 сек, смыть' },
  { id: 'e-thermal', text: 'Термальная вода LRP — распылить, промокнуть (кожа чуть влажная)' },
  { id: 'e-toner', text: 'Celimax Dual Barrier Toner — похлопать на всё лицо' },
  { id: 'e-ha', text: 'TO HA 2% + B5 — 2–3 капли на влажную кожу' },
  { id: 'e-nmf', text: 'TO NMF + HA — плотный слой на всё лицо' },
]

const eveningSat: CareCheckStep[] = [
  { id: 'e-dermo', text: 'LRP Toleriane Dermo-Cleanser — основное очищение, без Caramel' },
  {
    id: 'e-bha',
    text: 'Celimax Cica BHA Pad — только Т-зона (лоб, нос, подбородок); щёки не трогать',
  },
  { id: 'e-bha-pause', text: 'Пауза 10–15 минут' },
  { id: 'e-thermal', text: 'Термальная вода LRP — распылить, промокнуть' },
  { id: 'e-toner', text: 'Celimax Dual Barrier Toner — похлопать на всё лицо' },
  { id: 'e-ha', text: 'TO HA 2% + B5 — 2–3 капли на влажную кожу' },
  { id: 'e-nmf', text: 'TO NMF + HA — плотный слой на всё лицо' },
]

const eveningSun: CareCheckStep[] = [
  { id: 'e-dermo', text: 'LRP Toleriane Dermo-Cleanser — без Caramel' },
  {
    id: 'e-mask',
    text: 'Mesopharm Revital Intense Mask — 15 мин (Т-зона тоньше; при красноте 10 мин) → смыть тёплой водой, промокнуть',
  },
  { id: 'e-thermal', text: 'Термальная вода LRP — распылить, промокнуть' },
  { id: 'e-toner', text: 'Celimax Dual Barrier Toner — похлопать на всё лицо' },
  { id: 'e-ha', text: 'TO HA 2% + B5 — 2–3 капли на влажную кожу' },
  { id: 'e-nmf', text: 'TO NMF + HA — плотный слой на всё лицо' },
]

export const CARE_EVENING_BY_DAY: Record<CareWeekday, CareDayEvening> = {
  mon: {
    weekday: 'mon',
    label: CARE_WEEKDAY_LONG.mon,
    title: 'Caramel, без BHA',
    steps: eveningCaramel,
  },
  tue: {
    weekday: 'tue',
    label: CARE_WEEKDAY_LONG.tue,
    title: 'Caramel, без BHA',
    steps: eveningCaramel,
  },
  wed: {
    weekday: 'wed',
    label: CARE_WEEKDAY_LONG.wed,
    title: 'Caramel, без BHA',
    steps: eveningCaramel,
  },
  thu: {
    weekday: 'thu',
    label: CARE_WEEKDAY_LONG.thu,
    title: 'Caramel, без BHA',
    steps: eveningCaramel,
  },
  fri: {
    weekday: 'fri',
    label: CARE_WEEKDAY_LONG.fri,
    title: 'Caramel, без BHA',
    steps: eveningCaramel,
  },
  sat: {
    weekday: 'sat',
    label: CARE_WEEKDAY_LONG.sat,
    title: 'BHA, без Caramel',
    steps: eveningSat,
  },
  sun: {
    weekday: 'sun',
    label: CARE_WEEKDAY_LONG.sun,
    title: 'Маска Revital',
    steps: eveningSun,
  },
}

/** Caramel / BHA / mask flags for the day chips row. */
export const CARE_DAY_FLAGS: Record<CareWeekday, CareDayFlags> = {
  mon: { caramel: true, bha: false, mask: false },
  tue: { caramel: true, bha: false, mask: false },
  wed: { caramel: true, bha: false, mask: false },
  thu: { caramel: true, bha: false, mask: false },
  fri: { caramel: true, bha: false, mask: false },
  sat: { caramel: false, bha: true, mask: false },
  sun: { caramel: false, bha: false, mask: true },
}

export function eveningForWeekday(day: CareWeekday): CareDayEvening {
  return CARE_EVENING_BY_DAY[day]
}
