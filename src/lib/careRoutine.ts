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
  'Caramel — только Пн–Пт вечером: смывка SPF на сухое лицо.',
  'BHA-пэд — только по субботам и строго на Т-зону (лоб, нос, подбородок); щёки не трогать.',
  'Caramel и BHA никогда не встречаются: в субботу и воскресенье Caramel отдыхает.',
  'Воскресенье — день маски Revital; без Caramel и без BHA.',
  'Утром — умывание прохладной водой руками (без геля), затем термалка → тонер → сыворотка → крем → SPF.',
  'Вечером второе очищение — пенка La Roche-Posay Toleriane Dermo-Cleanser (в выходные она же основное).',
  'Вода для умывания — прохладная или чуть тёплая (не горячая). Caramel смывать тёплой.',
  'Никогда не тереть лицо полотенцем — только промокательные движения.',
  'HA наносить на влажную кожу после термалки. NMF вечером — плотный слой на всё лицо.',
  'SPF наносить похлопывающими движениями (не растирать), дать высохнуть 5 минут.',
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
        how: 'На сухое лицо — массаж 1 минуту, смыть тёплой водой, эмульгируя.',
      },
      {
        id: 'dermo-cleanser',
        name: 'La Roche-Posay Toleriane Dermo-Cleanser',
        when: 'Каждый вечер',
        how: 'Вспенить в руках, нанести на влажное лицо, помассировать 30 сек, смыть прохладной водой.',
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
        when: 'Утро после умывания + вечер перед HA',
        how: 'Распылить, подождать 10 секунд, промокнуть салфеткой.',
      },
      {
        id: 'dual-toner',
        name: 'Celimax Dual Barrier Creamy Toner',
        when: 'Каждое утро + вечер',
        how: 'Похлопывающими движениями на всё лицо.',
      },
      {
        id: 'bha-pads',
        name: 'Celimax Cica BHA Blemish Toner Pad',
        when: 'Только суббота',
        how: 'Протереть только лоб, нос, подбородок. Щёки не трогать.',
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
        how: '2–3 капли на влажную кожу всего лица после термалки.',
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
        how: 'Утром: тонкий слой, 3–5 мин перед SPF. Вечером: плотный слой на всё лицо.',
      },
      {
        id: 'spf',
        name: 'Likoberon солнцезащитный крем SPF 50',
        when: 'Каждое утро (финиш)',
        how: 'Похлопывающими движениями на всё лицо. Не растирать. Высохнуть 5 минут.',
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
        how: 'На всё лицо 15 минут → смыть тёплой водой, промокнуть. Далее — термалка, HA, крем.',
      },
    ],
  },
]

export const CARE_MORNING_STEPS: CareCheckStep[] = [
  { id: 'm1', text: 'Умыться прохладной водой (руками, без геля)' },
  { id: 'm2', text: 'Термальная вода → промокнуть салфеткой' },
  { id: 'm3', text: 'Celimax Dual Barrier Toner — похлопать' },
  { id: 'm4', text: 'TO Barrier Support Serum — 2–3 капли' },
  { id: 'm5', text: 'TO NMF + HA — тонкий слой на всё лицо' },
  { id: 'm6', text: 'Likoberon SPF 50 — похлопывая (высохнуть 5 мин)' },
]

/** Пн–Пт: Caramel + пенка, без BHA. */
const eveningCaramel: CareCheckStep[] = [
  { id: 'e-caramel', text: 'Caramel — смывка SPF на сухое лицо, массаж 1 мин, смыть' },
  { id: 'e-dermo', text: 'LRP Toleriane Dermo-Cleanser — вспенить, 30 сек, смыть' },
  { id: 'e-toner', text: 'Celimax Toner — похлопать на всё лицо' },
  { id: 'e-ha', text: 'Термалка → TO HA + B5 на влажную кожу' },
  { id: 'e-nmf', text: 'TO NMF — плотный слой на всё лицо' },
]

const eveningSat: CareCheckStep[] = [
  { id: 'e-dermo', text: 'LRP Toleriane Dermo-Cleanser — без Caramel' },
  { id: 'e-toner', text: 'Celimax Toner — на всё лицо' },
  { id: 'e-bha', text: 'BHA-пэд — только Т-зона (лоб, нос, подбородок)' },
  { id: 'e-ha', text: 'Термалка → TO HA + B5 на влажную кожу' },
  { id: 'e-nmf', text: 'TO NMF — плотный слой на всё лицо' },
]

const eveningSun: CareCheckStep[] = [
  { id: 'e-dermo', text: 'LRP Toleriane Dermo-Cleanser — без Caramel' },
  { id: 'e-toner', text: 'Celimax Toner — на всё лицо' },
  { id: 'e-mask', text: 'Маска Revital — на всё лицо 15 мин → смыть' },
  { id: 'e-ha', text: 'Термалка → TO HA + B5 на влажную кожу' },
  { id: 'e-nmf', text: 'TO NMF — плотный слой на всё лицо' },
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
