/** Static face-care routine (notes + daily checklists). */

export type CareWeekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

export type CareCheckStep = {
  id: string
  text: string
}

export type CareProduct = {
  id: string
  name: string
  when: string
  how: string
}

export type CareProductGroup = {
  id: string
  title: string
  hint?: string
  products: CareProduct[]
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
  'Caramel — 5 дней подряд (Пн–Пт): ежедневная смывка SPF.',
  'BHA-пэд — только по субботам и строго на Т-зону (лоб, нос, подбородок).',
  'Caramel и BHA никогда не встречаются: в субботу Caramel отдыхает.',
  'Воскресенье — день маски; без активов (ни Caramel, ни BHA).',
  'Утром НЕ умываться водой/гелем. Только термальная вода и промокнуть салфеткой.',
  'Вода для умывания вечером — только прохладная или чуть тёплая (не горячая).',
  'Никогда не тереть лицо полотенцем — только промокательные движения.',
  'Все кремы и сыворотки наносить на влажную кожу (после тонера или термалки).',
  'SPF наносить похлопывающими движениями (не растирать).',
]

export const CARE_PRODUCT_GROUPS: CareProductGroup[] = [
  {
    id: 'cleanse',
    title: 'Очищение',
    hint: 'Вечер',
    products: [
      {
        id: 'caramel',
        name: 'Mesopharm CLEAR:UP CARAMEL (гель-масло)',
        when: 'Пн–Пт вечером (смывка SPF)',
        how: 'На сухое лицо и сухие руки — 1–2 нажатия. Массаж 1 минуту (особенно Т-зону). Смывать тёплой водой, эмульгируя (потереть влажными руками до белёсого цвета). Смыть.',
      },
      {
        id: 'squalane',
        name: 'The Ordinary Squalane Cleanser',
        when: 'Каждый вечер (второе очищение; Сб/Вс — дважды)',
        how: 'На сухие ладони (размер с фасолину). Растереть 5–7 секунд до прозрачного масла. На сухое лицо, массаж 1 минуту. Смочить руки тёплой водой, помассировать 20–30 секунд (эмульгировать). Смыть прохладной водой.',
      },
    ],
  },
  {
    id: 'toners',
    title: 'Тонеры',
    hint: 'Утро + вечер',
    products: [
      {
        id: 'thermal',
        name: 'Термальная вода La Roche-Posay',
        when: 'Каждое утро + вечер перед HA',
        how: 'Распылить на лицо, подождать 10 секунд, промокнуть бумажной салфеткой (не давать высохнуть самой).',
      },
      {
        id: 'dual-toner',
        name: 'Celimax Dual Barrier Creamy Toner',
        when: 'Каждое утро + вечер',
        how: 'На ладони или ватный диск, похлопывающими движениями на всё лицо. Можно в 2 слоя.',
      },
      {
        id: 'bha-pads',
        name: 'Celimax Cica BHA Blemish Toner Pad',
        when: 'Только суббота',
        how: 'Пэдом протереть только лоб, нос, подбородок. Щёки и область вокруг глаз не трогать. Выбросить после использования.',
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
        how: '2–3 капли на всё лицо после тонера. Лёгкий массаж до впитывания.',
      },
      {
        id: 'ha',
        name: 'The Ordinary Hyaluronic Acid 2% + B5',
        when: 'Каждый вечер',
        how: 'Обязательно на влажную кожу: сначала термалка или тонер. 2–3 капли на всё лицо, похлопать. При сухости — второй слой.',
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
        when: 'Утро — всё лицо; вечер — щёки',
        how: 'Утром: тонкий слой на всё лицо, 3–5 минут перед SPF. Вечером: плотный слой только на щёки (сухая зона).',
      },
      {
        id: 'cerave',
        name: 'CeraVe Moisturising Lotion',
        when: 'Каждый вечер на Т-зону',
        how: 'Тонким слоем только на лоб, нос, подбородок. На щёки нельзя.',
      },
      {
        id: 'spf',
        name: 'Likoberon солнцезащитный крем SPF 50',
        when: 'Каждое утро (финиш)',
        how: 'Похлопывающими движениями на всё лицо после крема. Не растирать. Дать высохнуть 5 минут перед выходом.',
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
        how: 'После очищения на всё лицо (включая щёки) на 15 минут. Смыть тёплой водой, промокнуть салфеткой. Далее — тонер, HA и кремы.',
      },
    ],
  },
]

export const CARE_MORNING_STEPS: CareCheckStep[] = [
  { id: 'm1', text: 'Термальная вода → промокнуть салфеткой' },
  { id: 'm2', text: 'Celimax Dual Barrier Toner — похлопать' },
  { id: 'm3', text: 'TO Barrier Support Serum — 2–3 капли' },
  { id: 'm4', text: 'TO NMF + HA крем — тонкий слой на всё лицо' },
  { id: 'm5', text: 'Likoberon SPF 50 — похлопывая (высохнуть 5 мин)' },
]

/** Пн–Пт: Caramel + Squalane, без BHA. */
const eveningCaramel: CareCheckStep[] = [
  { id: 'e-caramel', text: 'Caramel — смывка SPF на сухое лицо, массаж 1 мин, смыть' },
  { id: 'e-squalane', text: 'TO Squalane — второе очищение, смыть' },
  { id: 'e-toner', text: 'Celimax Toner — похлопать на всё лицо' },
  { id: 'e-ha', text: 'Термалка → TO HA + B5 на влажную кожу' },
  { id: 'e-creams', text: 'TO NMF — на щёки / CeraVe Lotion — на Т-зону' },
]

const eveningSat: CareCheckStep[] = [
  {
    id: 'e-squalane-2',
    text: 'TO Squalane дважды (1 — смыть SPF, 2 — очистить)',
  },
  { id: 'e-toner', text: 'Celimax Toner — на всё лицо' },
  { id: 'e-bha', text: 'BHA-пэд — только Т-зона (лоб, нос, подбородок)' },
  { id: 'e-ha', text: 'Термалка → TO HA + B5 на влажную кожу' },
  { id: 'e-creams', text: 'TO NMF — на щёки / CeraVe Lotion — на Т-зону' },
]

const eveningSun: CareCheckStep[] = [
  { id: 'e-squalane-2', text: 'TO Squalane дважды — по инструкции' },
  { id: 'e-toner', text: 'Celimax Toner — на всё лицо' },
  {
    id: 'e-mask',
    text: 'Маска Revital — на всё лицо 15 мин → смыть',
  },
  { id: 'e-ha', text: 'Термалка → TO HA + B5 на влажную кожу' },
  {
    id: 'e-creams',
    text: 'TO NMF — на щёки (плотно) / CeraVe Lotion — на Т-зону',
  },
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
