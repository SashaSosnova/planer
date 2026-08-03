import type { Meal, WeightEntry } from '../types'
import { addDaysIso } from './date'
import { round1, sumMacros } from './nutrition'

export type WeightCheckin = {
  /** Hero label, e.g. «−0,6 кг» or «64,5 кг» for the first point */
  hero: string
  tone: 'up' | 'down' | 'flat'
  /** Dry one-liner about prior menu vs the scale delta */
  note: string
}

const SALTY_RE =
  /пицц|суши|ролл|сыр|колбас|сосиск|бекон|ветчин|соус|чипсы|начос|бургер|хот[\s-]?дог|шаурма|шаверма|лапша\s*бп|доширак|солен|маринад|оливк|фета|пармезан|брынз|креветк|икра|копчен/i

const ALCOHOL_RE =
  /вино|пиво|шампанск|коктейл|водк|виски|коньяк|ром|джин|ликёр|ликер|алкогол|просекко|саке/i

function fmtKg(n: number): string {
  return Math.abs(n).toFixed(1).replace('.', ',')
}

function formatDeltaHero(deltaKg: number): string {
  if (deltaKg === 0) return '0 кг'
  return deltaKg > 0 ? `+${fmtKg(deltaKg)} кг` : `−${fmtKg(deltaKg)} кг`
}

function sortedWeights(weights: WeightEntry[]): WeightEntry[] {
  return [...weights]
    .filter((w) => w.kg >= 30 && w.kg <= 400)
    .sort((a, b) => {
      const byDate = a.date.localeCompare(b.date)
      if (byDate !== 0) return byDate
      return a.createdAt - b.createdAt
    })
}

function mealsBetweenWeighIns(
  meals: Meal[],
  fromDateInclusive: string,
  toDateExclusive: string,
): Meal[] {
  return meals.filter((m) => m.date >= fromDateInclusive && m.date < toDateExclusive)
}

function mealText(m: Meal): string {
  return `${m.rawText} ${m.items.map((i) => i.name).join(' ')}`
}

type MenuSignals = {
  hasMeals: boolean
  dayCount: number
  avgKcal: number
  avgCarbs: number
  eatingOut: boolean
  salty: boolean
  alcohol: boolean
  surplus: boolean
  deficit: boolean
}

function analyzeMenu(
  meals: Meal[],
  dailyKcalGoal: number | null | undefined,
): MenuSignals {
  const dates = [...new Set(meals.map((m) => m.date))].sort()
  const dayCount = Math.max(dates.length, 1)
  const totals = meals.length ? sumMacros(meals.map((m) => m.totals)) : null
  const avgKcal = totals ? totals.kcal / dayCount : 0
  const avgCarbs = totals ? totals.carbs / dayCount : 0
  const carbKcalShare = avgKcal > 0 ? (avgCarbs * 4) / avgKcal : 0

  const eatingOut = meals.some((m) => m.eatingOut || m.isApproximate)
  const salty =
    meals.some((m) => SALTY_RE.test(mealText(m))) ||
    (carbKcalShare >= 0.45 && avgCarbs >= 180)
  const alcohol = meals.some((m) => ALCOHOL_RE.test(mealText(m)))
  const highCarbs = carbKcalShare >= 0.45 || avgCarbs >= 220

  const goal =
    dailyKcalGoal != null && Number.isFinite(dailyKcalGoal) && dailyKcalGoal > 0
      ? dailyKcalGoal
      : null
  const surplus = goal != null && avgKcal >= goal + 300
  const deficit = goal != null && avgKcal > 0 && avgKcal <= goal - 300

  return {
    hasMeals: meals.length > 0,
    dayCount: dates.length,
    avgKcal,
    avgCarbs,
    eatingOut,
    salty: salty || highCarbs,
    alcohol,
    surplus,
    deficit,
  }
}

function waterishFactors(s: MenuSignals): string[] {
  const parts: string[] = []
  if (s.eatingOut) parts.push('вне дома')
  if (s.alcohol) parts.push('алкоголь')
  if (s.salty) parts.push('много углеводов/солёного')
  else if (s.surplus) parts.push('профицит ккал')
  return parts
}

function buildNote(deltaKg: number, signals: MenuSignals): string {
  if (!signals.hasMeals) {
    return 'Меню за предыдущий день не заполнено.'
  }

  const when = signals.dayCount > 1 ? 'За дни до взвешивания' : 'Вчера'
  const water = waterishFactors(signals)
  const waterBit = water.length > 0 ? water.join(' + ') : null

  // Flat
  if (Math.abs(deltaKg) < 0.15) {
    if (waterBit) return `${when}: ${waterBit} — на весах без заметного сдвига.`
    if (signals.deficit) return `${when}: дефицит ккал — вес без заметного сдвига.`
    return 'Без изменений относительно прошлого взвешивания.'
  }

  // Up
  if (deltaKg > 0) {
    if (waterBit) {
      return `${when}: ${waterBit} — типичный плюс воды/гликогена на утро.`
    }
    if (signals.deficit) {
      return `${when}: по меню дефицит — скорее вода, не еда.`
    }
    if (signals.surplus) {
      return `${when}: профицит ккал — плюс на весах ожидаем.`
    }
    return `${when}: явного триггера в меню нет — чаще вода или недосып.`
  }

  // Down
  if (signals.deficit) {
    return `${when}: дефицит ккал — минус согласуется с меню.`
  }
  if (waterBit || signals.surplus) {
    const why = waterBit ?? 'профицит ккал'
    return `${when}: ${why}, но вес ниже — скорее ушла вода.`
  }
  return `${when}: минус на весах; по меню без явного дефицита.`
}

/**
 * Dry check-in: delta vs previous weigh-in + short prior-menu note.
 */
export function buildWeightCheckin(input: {
  weights: WeightEntry[]
  meals?: Meal[]
  dailyKcalGoal?: number | null
}): WeightCheckin | null {
  const sorted = sortedWeights(input.weights)
  if (sorted.length === 0) return null

  const latest = sorted[sorted.length - 1]!
  const prev = sorted.length >= 2 ? sorted[sorted.length - 2]! : null

  if (!prev) {
    return {
      hero: `${latest.kg.toFixed(1).replace('.', ',')} кг`,
      tone: 'flat',
      note: 'Первая точка — сравнение появится со следующего взвешивания.',
    }
  }

  const deltaKg = round1(latest.kg - prev.kg)
  const tone: WeightCheckin['tone'] =
    Math.abs(deltaKg) < 0.15 ? 'flat' : deltaKg > 0 ? 'up' : 'down'

  const from = prev.date
  const toExclusive = latest.date
  // If both weights same calendar day, still look at previous calendar day.
  const windowStart =
    from < toExclusive ? from : addDaysIso(latest.date, -1)
  const windowEnd = from < toExclusive ? toExclusive : latest.date

  const windowMeals = mealsBetweenWeighIns(input.meals ?? [], windowStart, windowEnd)
  // Prefer the day right before the latest weigh-in when the window is wide.
  const dayBefore = addDaysIso(latest.date, -1)
  const focusMeals =
    windowMeals.some((m) => m.date === dayBefore)
      ? windowMeals.filter((m) => m.date === dayBefore)
      : windowMeals

  const signals = analyzeMenu(focusMeals, input.dailyKcalGoal)

  return {
    hero: formatDeltaHero(deltaKg),
    tone,
    note: buildNote(deltaKg, signals),
  }
}
