import type {
  AppData,
  DayCheckIn,
  MeasurementEntry,
  Meal,
  PeriodStart,
  StepsEntry,
  WeightEntry,
} from '../types'
import { getCycleInfo } from './cycle'
import { todayIso } from './date'
import { round1 } from './nutrition'

/** Classic rule-of-thumb: ~7700 kcal ≈ 1 kg body fat (rough). */
const KCAL_PER_KG = 7700
/** Assumed steps already baked into activity/TDEE; extras nudge energy estimate. */
const STEPS_BASELINE = 6000
const KCAL_PER_STEP = 0.04

export type WeightForecast = {
  currentKg: number
  /** Blended kg/week used for projection; negative = losing */
  weeklyRateKg: number | null
  /** Scale-only trend */
  scaleRateKg: number | null
  /** Energy balance estimate (intake vs maintain ± steps) */
  energyRateKg: number | null
  sampleDays: number
  sampleCount: number
  mealDays: number
  inTwoWeeks: number | null
  inFourWeeks: number | null
  targetKg: number | null
  weeksToTarget: number | null
  confidence: 'low' | 'ok'
  summary: string
  /** Soft extras shown under the main line */
  notes: string[]
}

export type ForecastInput = {
  weights: WeightEntry[]
  meals?: Meal[]
  steps?: StepsEntry[]
  checkIns?: DayCheckIn[]
  periodStarts?: PeriodStart[]
  measurements?: MeasurementEntry[]
  targetKg?: number | null
  /** TDEE / maintain kcal per day */
  maintainKcal?: number | null
  cycleLengthDays?: number
  periodLengthDays?: number
  today?: string
}

type CheckInLike = Pick<DayCheckIn, 'date' | 'sleepHours'>

function parseIsoMs(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y!, m! - 1, d!).getTime()
}

function addDaysIso(iso: string, delta: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y!, m! - 1, d!)
  dt.setDate(dt.getDate() + delta)
  const yy = dt.getFullYear()
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/** Linear weekly rate from weigh-ins in the last ~56 days. */
export function scaleWeeklyRate(weights: WeightEntry[]): {
  rate: number | null
  sampleDays: number
  sampleCount: number
  currentKg: number | null
} {
  const sorted = [...weights]
    .filter((w) => w.kg >= 30 && w.kg <= 400)
    .sort((a, b) => a.date.localeCompare(b.date))
  if (sorted.length === 0) {
    return { rate: null, sampleDays: 0, sampleCount: 0, currentKg: null }
  }

  const latest = sorted[sorted.length - 1]!
  const latestMs = parseIsoMs(latest.date)
  const windowStart = latestMs - 56 * 86_400_000
  const recent = sorted.filter((w) => parseIsoMs(w.date) >= windowStart)
  const sample = recent.length >= 2 ? recent : sorted

  let rate: number | null = null
  let sampleDays = 0
  if (sample.length >= 2) {
    const first = sample[0]!
    const last = sample[sample.length - 1]!
    sampleDays = Math.round((parseIsoMs(last.date) - parseIsoMs(first.date)) / 86_400_000)
    if (sampleDays >= 5) {
      const t0 = parseIsoMs(first.date)
      const xs = sample.map((w) => (parseIsoMs(w.date) - t0) / 86_400_000)
      const ys = sample.map((w) => w.kg)
      const n = xs.length
      const meanX = xs.reduce((s, x) => s + x, 0) / n
      const meanY = ys.reduce((s, y) => s + y, 0) / n
      let num = 0
      let den = 0
      for (let i = 0; i < n; i++) {
        num += (xs[i]! - meanX) * (ys[i]! - meanY)
        den += (xs[i]! - meanX) ** 2
      }
      const daily = den > 0 ? num / den : (last.kg - first.kg) / sampleDays
      rate = round1(daily * 7)
    }
  }

  return {
    rate,
    sampleDays,
    sampleCount: sample.length,
    currentKg: latest.kg,
  }
}

/** Weekly kg change implied by average intake vs maintain, plus step nudge. */
export function energyWeeklyRate(
  meals: Meal[],
  steps: StepsEntry[],
  maintainKcal: number,
  today: string,
  daysBack = 21,
): { rate: number | null; mealDays: number; avgKcal: number | null } {
  if (!(maintainKcal > 0)) {
    return { rate: null, mealDays: 0, avgKcal: null }
  }

  const from = addDaysIso(today, -(daysBack - 1))
  const kcalByDate = new Map<string, number>()
  for (const m of meals) {
    if (m.date < from || m.date > today) continue
    kcalByDate.set(m.date, (kcalByDate.get(m.date) ?? 0) + m.totals.kcal)
  }
  const mealDays = kcalByDate.size
  if (mealDays < 5) {
    return { rate: null, mealDays, avgKcal: null }
  }

  const avgKcal =
    [...kcalByDate.values()].reduce((s, v) => s + v, 0) / mealDays

  let stepAdjKcal = 0
  const stepVals = steps
    .filter((s) => s.date >= from && s.date <= today && s.count > 0)
    .map((s) => s.count)
  if (stepVals.length >= 5) {
    const avgSteps = stepVals.reduce((s, v) => s + v, 0) / stepVals.length
    const extra = (avgSteps - STEPS_BASELINE) * KCAL_PER_STEP
    // Cap so steps don't dominate the estimate
    stepAdjKcal = Math.max(-250, Math.min(250, extra))
  }

  const dailyBalance = avgKcal - maintainKcal + stepAdjKcal
  const rate = round1((dailyBalance * 7) / KCAL_PER_KG)
  return { rate, mealDays, avgKcal: Math.round(avgKcal) }
}

function avgSleepHours(checkIns: CheckInLike[], today: string, daysBack = 14): number | null {
  const from = addDaysIso(today, -(daysBack - 1))
  const vals = checkIns
    .filter((c) => c.date >= from && c.date <= today && c.sleepHours != null)
    .map((c) => c.sleepHours!)
  if (vals.length < 3) return null
  return vals.reduce((s, v) => s + v, 0) / vals.length
}

function waistTrendCm(measurements: MeasurementEntry[]): number | null {
  const withWaist = [...measurements]
    .filter((m) => m.waist != null && m.waist > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
  if (withWaist.length < 2) return null
  const first = withWaist[0]!
  const last = withWaist[withWaist.length - 1]!
  const days = (parseIsoMs(last.date) - parseIsoMs(first.date)) / 86_400_000
  if (days < 14) return null
  return round1((last.waist ?? 0) - (first.waist ?? 0))
}

function blendRates(
  scaleRate: number | null,
  energyRate: number | null,
  sleepDamp: boolean,
): number | null {
  let energy = energyRate
  if (energy != null && sleepDamp && energy < 0) {
    // Short sleep → expected fat loss often overstated
    energy = round1(energy * 0.85)
  }
  if (scaleRate != null && energy != null) {
    return round1(0.55 * scaleRate + 0.45 * energy)
  }
  return scaleRate ?? energy
}

function formatDelta(kg: number): string {
  const sign = kg > 0 ? '+' : ''
  return `${sign}${kg.toFixed(1).replace('.', ',')} кг`
}

/**
 * Forecast from scale trend + energy balance, with soft notes from sleep, cycle, measures.
 */
export function computeWeightForecast(input: ForecastInput): WeightForecast | null
/** @deprecated Prefer ForecastInput object */
export function computeWeightForecast(
  weights: WeightEntry[],
  targetKg?: number | null,
): WeightForecast | null
export function computeWeightForecast(
  weightsOrInput: WeightEntry[] | ForecastInput,
  targetKg?: number | null,
): WeightForecast | null {
  const input: ForecastInput = Array.isArray(weightsOrInput)
    ? { weights: weightsOrInput, targetKg }
    : weightsOrInput

  const today = input.today ?? todayIso()
  const scale = scaleWeeklyRate(input.weights)
  if (scale.currentKg == null) return null

  const currentKg = scale.currentKg
  const target =
    input.targetKg != null &&
    Number.isFinite(input.targetKg) &&
    input.targetKg >= 30 &&
    input.targetKg <= 400
      ? round1(input.targetKg)
      : null

  const energy = energyWeeklyRate(
    input.meals ?? [],
    input.steps ?? [],
    input.maintainKcal ?? 0,
    today,
  )

  const sleepAvg = avgSleepHours(input.checkIns ?? [], today)
  const sleepDamp = sleepAvg != null && sleepAvg < 6.5

  const weeklyRateKg = blendRates(scale.rate, energy.rate, sleepDamp)

  const cycle = getCycleInfo(
    input.periodStarts ?? [],
    today,
    input.cycleLengthDays,
    input.periodLengthDays,
  )

  const waistDelta = waistTrendCm(input.measurements ?? [])

  let confidence: 'low' | 'ok' = 'low'
  if (
    weeklyRateKg != null &&
    ((scale.sampleCount >= 4 && scale.sampleDays >= 14) || energy.mealDays >= 10) &&
    !sleepDamp
  ) {
    confidence = 'ok'
  }
  if (scale.rate != null && energy.rate != null && Math.abs(scale.rate - energy.rate) > 0.35) {
    confidence = 'low'
  }

  const project = (weeks: number) =>
    weeklyRateKg == null ? null : round1(currentKg + weeklyRateKg * weeks)

  const inTwoWeeks = project(2)
  const inFourWeeks = project(4)

  let weeksToTarget: number | null = null
  if (target != null && weeklyRateKg != null && Math.abs(weeklyRateKg) >= 0.05) {
    const weeks = (target - currentKg) / weeklyRateKg
    if (weeks > 0 && weeks < 104) weeksToTarget = Math.round(weeks * 10) / 10
  }

  const notes: string[] = []
  if (cycle.weightNote) notes.push(cycle.weightNote)
  if (sleepDamp && sleepAvg != null) {
    notes.push(
      `Сон в среднем ${sleepAvg.toFixed(1).replace('.', ',')} ч — прогноз менее точный, вес может гулять.`,
    )
  }
  if (waistDelta != null && waistDelta <= -1) {
    notes.push(
      `Талия −${Math.abs(waistDelta).toFixed(1).replace('.', ',')} см — объёмы уходят, даже если весы капризничают.`,
    )
  } else if (waistDelta != null && waistDelta >= 1 && (weeklyRateKg == null || weeklyRateKg <= 0)) {
    notes.push('Талия подросла — смотрите и на обхваты, не только на кг.')
  }
  if (
    scale.rate != null &&
    energy.rate != null &&
    Math.abs(scale.rate - energy.rate) > 0.35
  ) {
    notes.push(
      `Весы ${formatDelta(scale.rate)}/нед, по калориям ≈ ${formatDelta(energy.rate)}/нед — ориентир усреднён.`,
    )
  }

  const summary = buildSummary({
    currentKg,
    weeklyRateKg,
    scaleRate: scale.rate,
    energyRate: energy.rate,
    inFourWeeks,
    targetKg: target,
    weeksToTarget,
    confidence,
  })

  return {
    currentKg,
    weeklyRateKg,
    scaleRateKg: scale.rate,
    energyRateKg: energy.rate,
    sampleDays: scale.sampleDays,
    sampleCount: scale.sampleCount,
    mealDays: energy.mealDays,
    inTwoWeeks,
    inFourWeeks,
    targetKg: target,
    weeksToTarget,
    confidence,
    summary,
    notes,
  }
}

/** Convenience: build forecast from full app data + settings. */
export function forecastFromAppData(
  data: AppData,
  opts: {
    targetKg?: number | null
    maintainKcal?: number | null
    cycleLengthDays?: number
    periodLengthDays?: number
    today?: string
  },
): WeightForecast | null {
  return computeWeightForecast({
    weights: data.weights,
    meals: data.meals,
    steps: data.steps,
    checkIns: data.checkIns,
    periodStarts: data.periodStarts,
    measurements: data.measurements,
    ...opts,
  })
}

function buildSummary(f: {
  currentKg: number
  weeklyRateKg: number | null
  scaleRate: number | null
  energyRate: number | null
  inFourWeeks: number | null
  targetKg: number | null
  weeksToTarget: number | null
  confidence: 'low' | 'ok'
}): string {
  if (f.weeklyRateKg == null) {
    if (f.targetKg != null) {
      const left = round1(f.currentKg - f.targetKg)
      if (Math.abs(left) < 0.15) return 'Вы уже около целевого веса.'
      return left > 0
        ? `До цели ${left.toFixed(1).replace('.', ',')} кг. Нужно ещё взвешивания и дни с едой в дневнике.`
        : `Цель выше текущего веса на ${Math.abs(left).toFixed(1).replace('.', ',')} кг.`
    }
    return 'Отмечайте вес и еду несколько дней — появится прогноз.'
  }

  const rate = f.weeklyRateKg
  const sources: string[] = []
  if (f.scaleRate != null) sources.push('весы')
  if (f.energyRate != null) sources.push('калории')
  const sourceLabel = sources.length ? ` (${sources.join(' + ')})` : ''

  const pace =
    Math.abs(rate) < 0.05
      ? `Вес почти на месте${sourceLabel}`
      : `Темп около ${formatDelta(rate)}/нед${sourceLabel}`

  const parts = [pace]
  if (f.inFourWeeks != null) {
    parts.push(`через 4 нед ≈ ${f.inFourWeeks.toFixed(1).replace('.', ',')} кг`)
  }
  if (f.weeksToTarget != null && f.targetKg != null) {
    const w = f.weeksToTarget
    const label = w < 1.5 ? 'около недели' : `≈ ${Math.ceil(w)} нед`
    parts.push(`до цели ${label}`)
  } else if (f.targetKg != null && rate !== 0) {
    const toward = f.targetKg < f.currentKg ? rate < 0 : rate > 0
    if (!toward) parts.push('сейчас тренд не к цели')
  }
  if (f.confidence === 'low') parts.push('оценка пока грубая')

  return parts.join(' · ')
}
