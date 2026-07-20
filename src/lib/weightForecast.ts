import type {
  AppData,
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
  /** Earliest weigh-in in the diary (progress baseline). */
  startKg: number
  /** Blended kg/week used for projection; negative = losing */
  weeklyRateKg: number | null
  /** Scale-only trend (full diary) */
  scaleRateKg: number | null
  /** Energy balance estimate (intake vs maintain ± steps), full diary */
  energyRateKg: number | null
  /** Observed scale rate on days near/under calorie goal */
  onPlanRateKg: number | null
  /** Observed scale rate when average intake is over goal */
  overRateKg: number | null
  sampleDays: number
  sampleCount: number
  mealDays: number
  /** Projection in 1 week if sticking near calorie goal (falls back to blended rate) */
  inOneWeek: number | null
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
  periodStarts?: PeriodStart[]
  measurements?: MeasurementEntry[]
  targetKg?: number | null
  /** TDEE / maintain kcal per day */
  maintainKcal?: number | null
  /** Daily calorie goal (deficit target) — for on-plan vs over analysis */
  dailyKcalGoal?: number | null
  cycleLengthDays?: number
  periodLengthDays?: number
  today?: string
}

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

/** Linear weekly rate from the full weigh-in history. */
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
  const sample = sorted

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

/** Weekly kg change implied by average intake vs maintain, plus step nudge (full diary). */
export function energyWeeklyRate(
  meals: Meal[],
  steps: StepsEntry[],
  maintainKcal: number,
  today: string,
  _daysBack?: number,
): { rate: number | null; mealDays: number; avgKcal: number | null } {
  if (!(maintainKcal > 0)) {
    return { rate: null, mealDays: 0, avgKcal: null }
  }

  const kcalByDate = new Map<string, number>()
  for (const m of meals) {
    if (m.date > today) continue
    kcalByDate.set(m.date, (kcalByDate.get(m.date) ?? 0) + m.totals.kcal)
  }
  const mealDays = kcalByDate.size
  if (mealDays < 5) {
    return { rate: null, mealDays, avgKcal: null }
  }

  const avgKcal =
    [...kcalByDate.values()].reduce((s, v) => s + v, 0) / mealDays

  let stepAdjKcal = 0
  const stepVals = steps.filter((s) => s.date <= today && s.count > 0).map((s) => s.count)
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

/**
 * How the scale moves between weigh-ins when eating near the goal vs over it.
 * Uses the whole diary: each consecutive weigh-in pair → interval avg kcal → weekly kg rate.
 */
export function analyzeCalorieWeightResponse(
  weights: WeightEntry[],
  meals: Meal[],
  dailyKcalGoal: number,
): { onPlanRate: number | null; overRate: number | null; onPlanN: number; overN: number } {
  if (!(dailyKcalGoal > 0)) {
    return { onPlanRate: null, overRate: null, onPlanN: 0, overN: 0 }
  }

  const sorted = [...weights]
    .filter((w) => w.kg >= 30 && w.kg <= 400)
    .sort((a, b) => a.date.localeCompare(b.date))

  const kcalByDate = new Map<string, number>()
  for (const m of meals) {
    kcalByDate.set(m.date, (kcalByDate.get(m.date) ?? 0) + m.totals.kcal)
  }

  const onPlan: number[] = []
  const over: number[] = []

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]!
    const b = sorted[i + 1]!
    const days = Math.round((parseIsoMs(b.date) - parseIsoMs(a.date)) / 86_400_000)
    // Skip same-day / overnight noise and very long gaps (vacation, missing logs).
    if (days < 2 || days > 18) continue

    const from = a.date
    const to = addDaysIso(b.date, -1)
    const dayKcal: number[] = []
    for (let d = from; d <= to; d = addDaysIso(d, 1)) {
      const k = kcalByDate.get(d)
      if (k != null && k > 0) dayKcal.push(k)
    }
    if (dayKcal.length < 2) continue

    const avgKcal = dayKcal.reduce((s, v) => s + v, 0) / dayKcal.length
    const weekly = ((b.kg - a.kg) / days) * 7

    if (avgKcal <= dailyKcalGoal * 1.05) onPlan.push(weekly)
    else if (avgKcal >= dailyKcalGoal * 1.1) over.push(weekly)
  }

  const mean = (xs: number[]) =>
    xs.length >= 2 ? round1(xs.reduce((s, v) => s + v, 0) / xs.length) : null

  return {
    onPlanRate: mean(onPlan),
    overRate: mean(over),
    onPlanN: onPlan.length,
    overN: over.length,
  }
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

function blendRates(scaleRate: number | null, energyRate: number | null): number | null {
  if (scaleRate != null && energyRate != null) {
    return round1(0.55 * scaleRate + 0.45 * energyRate)
  }
  return scaleRate ?? energyRate
}

function formatDelta(kg: number): string {
  const sign = kg > 0 ? '+' : ''
  return `${sign}${kg.toFixed(1).replace('.', ',')} кг`
}

/**
 * Forecast from scale trend + energy balance, with soft notes from cycle and measures.
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
  const startKg = earliestWeightKg(input.weights) ?? currentKg
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

  const response = analyzeCalorieWeightResponse(
    input.weights,
    input.meals ?? [],
    input.dailyKcalGoal ?? 0,
  )

  const weeklyRateKg = blendRates(scale.rate, energy.rate)

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
    ((scale.sampleCount >= 4 && scale.sampleDays >= 14) || energy.mealDays >= 10)
  ) {
    confidence = 'ok'
  }
  if (scale.rate != null && energy.rate != null && Math.abs(scale.rate - energy.rate) > 0.35) {
    confidence = 'low'
  }
  if (response.onPlanN >= 5 && response.overN >= 3) confidence = 'ok'

  // Forward-looking numbers assume sticking to calorie goal when we have that signal.
  const planRateKg = response.onPlanRate ?? weeklyRateKg
  const project = (weeks: number, rate: number | null = planRateKg) =>
    rate == null ? null : round1(currentKg + rate * weeks)

  const inOneWeek = project(1)
  const inTwoWeeks = project(2)
  const inFourWeeks = project(4)

  let weeksToTarget: number | null = null
  if (target != null && planRateKg != null && Math.abs(planRateKg) >= 0.05) {
    const weeks = (target - currentKg) / planRateKg
    if (weeks > 0 && weeks < 104) weeksToTarget = Math.round(weeks * 10) / 10
  }

  const notes: string[] = []
  if (cycle.weightNote) notes.push(cycle.weightNote)
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
      `Весы ${formatDelta(scale.rate)}/нед, по калориям ≈ ${formatDelta(energy.rate)}/нед — по всему дневнику.`,
    )
  }

  const summary = buildSummary({
    currentKg,
    weeklyRateKg,
    planRateKg,
    inOneWeek,
    targetKg: target,
    weeksToTarget,
    confidence,
  })

  return {
    currentKg,
    startKg,
    weeklyRateKg,
    scaleRateKg: scale.rate,
    energyRateKg: energy.rate,
    onPlanRateKg: response.onPlanRate,
    overRateKg: response.overRate,
    sampleDays: scale.sampleDays,
    sampleCount: scale.sampleCount,
    mealDays: energy.mealDays,
    inOneWeek,
    inTwoWeeks,
    inFourWeeks,
    targetKg: target,
    weeksToTarget,
    confidence,
    summary,
    notes,
  }
}

function earliestWeightKg(weights: WeightEntry[]): number | null {
  const sorted = [...weights]
    .filter((w) => w.kg > 0)
    .sort((a, b) => {
      const byDate = a.date.localeCompare(b.date)
      if (byDate !== 0) return byDate
      return a.createdAt - b.createdAt
    })
  const first = sorted[0]
  return first ? round1(first.kg) : null
}

/** Convenience: build forecast from full app data + settings. */
export function forecastFromAppData(
  data: AppData,
  opts: {
    targetKg?: number | null
    maintainKcal?: number | null
    dailyKcalGoal?: number | null
    cycleLengthDays?: number
    periodLengthDays?: number
    today?: string
  },
): WeightForecast | null {
  return computeWeightForecast({
    weights: data.weights,
    meals: data.meals,
    steps: data.steps,
    periodStarts: data.periodStarts,
    measurements: data.measurements,
    ...opts,
  })
}

function buildSummary(f: {
  currentKg: number
  weeklyRateKg: number | null
  planRateKg: number | null
  inOneWeek: number | null
  targetKg: number | null
  weeksToTarget: number | null
  confidence: 'low' | 'ok'
}): string {
  if (f.weeklyRateKg == null && f.planRateKg == null) {
    if (f.targetKg != null) {
      const left = round1(f.currentKg - f.targetKg)
      if (Math.abs(left) < 0.15) return 'Вы уже около целевого веса.'
      return left > 0
        ? `До цели ${left.toFixed(1).replace('.', ',')} кг`
        : `Цель выше текущего на ${Math.abs(left).toFixed(1).replace('.', ',')} кг`
    }
    return 'Появится темп, когда накопится несколько дней веса и еды'
  }

  const tempoRate = f.weeklyRateKg ?? f.planRateKg!
  const pace =
    Math.abs(tempoRate) < 0.05
      ? 'Темп: вес почти на месте'
      : `Темп ${formatDelta(tempoRate)}/нед`

  const parts = [pace]

  if (f.targetKg != null) {
    const left = round1(f.currentKg - f.targetKg)
    if (Math.abs(left) < 0.15) {
      parts.push('у цели')
    } else if (left > 0) {
      parts.push(`ещё ${left.toFixed(1).replace('.', ',')} кг`)
    } else {
      parts.push(`ниже цели на ${Math.abs(left).toFixed(1).replace('.', ',')} кг`)
    }
  }

  if (f.inOneWeek != null) {
    parts.push(`через неделю ≈ ${f.inOneWeek.toFixed(1).replace('.', ',')} кг`)
  }

  const towardRate = f.planRateKg ?? f.weeklyRateKg
  if (f.weeksToTarget != null && f.targetKg != null) {
    const w = f.weeksToTarget
    const label = w < 1.5 ? 'около недели' : `≈ ${Math.ceil(w)} нед`
    parts.push(`до цели ${label}`)
  } else if (f.targetKg != null && towardRate != null && towardRate !== 0) {
    const toward = f.targetKg < f.currentKg ? towardRate < 0 : towardRate > 0
    if (!toward) parts.push('сейчас тренд не к цели')
  }
  if (f.confidence === 'low') parts.push('пока ориентир')

  return parts.join(' · ')
}
