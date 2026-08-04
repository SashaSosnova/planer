import type { Meal, WeightEntry } from '../types'
import { addDaysIso } from './date'
import { round1, sumMacros } from './nutrition'

export type WeightCheckin = {
  /** Hero label, e.g. «−0,6 кг» or «64,5 кг» for the first point */
  hero: string
  tone: 'up' | 'down' | 'flat'
  /** Short factual note — no salt/water guesses */
  note: string
}

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

type MenuSignals = {
  hasMeals: boolean
  dayCount: number
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

  const goal =
    dailyKcalGoal != null && Number.isFinite(dailyKcalGoal) && dailyKcalGoal > 0
      ? dailyKcalGoal
      : null
  const surplus = goal != null && avgKcal >= goal + 300
  const deficit = goal != null && avgKcal > 0 && avgKcal <= goal - 300

  return {
    hasMeals: meals.length > 0,
    dayCount: dates.length,
    surplus,
    deficit,
  }
}

function buildNote(deltaKg: number, signals: MenuSignals): string {
  if (!signals.hasMeals) {
    return 'Меню за предыдущий день не заполнено.'
  }

  const when = signals.dayCount > 1 ? 'За дни до взвешивания' : 'Вчера'

  if (Math.abs(deltaKg) < 0.15) {
    return 'Без изменений относительно прошлого взвешивания.'
  }

  if (deltaKg > 0) {
    if (signals.surplus) return `${when}: профицит ккал к цели.`
    if (signals.deficit) return `${when}: по меню был дефицит ккал.`
    return 'Плюс относительно прошлого взвешивания.'
  }

  if (signals.deficit) return `${when}: дефицит ккал к цели.`
  if (signals.surplus) return `${when}: по меню был профицит ккал.`
  return 'Минус относительно прошлого взвешивания.'
}

/**
 * Dry check-in: delta vs previous weigh-in + short factual note.
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
