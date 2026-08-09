import type {
  AppData,
  MeasurementEntry,
  Meal,
  PeriodStart,
  StepsEntry,
  WeightEntry,
} from '../types'
import { todayIso } from './date'
import { formatKg, round1, round2 } from './nutrition'

/** Classic rule-of-thumb: ~7700 kcal ≈ 1 kg body fat (rough). */
export const KCAL_PER_KG = 7700
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
  /** Observed scale rate in recent deficit intervals (vs maintain) */
  onPlanRateKg: number | null
  /** Observed scale rate in recent overeating intervals */
  overRateKg: number | null
  sampleDays: number
  sampleCount: number
  mealDays: number
  /** Projection in 1 week if keeping deficit tempo (falls back to energy/goal) */
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

/** Rough next-morning change from yesterday's kcal vs maintain (water/glycogen not modeled). */
export type NextMorningEstimate = {
  baseKg: number
  expectedDeltaKg: number
  expectedKg: number
  yesterdayKcal: number
  maintainKcal: number
  yesterday: string
}

/**
 * Expectation for tomorrow morning from yesterday's calorie balance.
 * Returns null when there is no weight, no maintain, or no meals logged yesterday.
 */
export function estimateNextMorning(input: {
  weights: WeightEntry[]
  meals: Meal[]
  maintainKcal: number
  today?: string
}): NextMorningEstimate | null {
  const today = input.today ?? todayIso()
  const maintainKcal = Math.round(input.maintainKcal)
  if (!(maintainKcal > 0)) return null

  const sorted = [...input.weights]
    .filter((w) => w.date <= today && Number.isFinite(w.kg) && w.kg >= 30 && w.kg <= 400)
    .sort((a, b) => a.date.localeCompare(b.date))
  const latest = sorted[sorted.length - 1]
  if (!latest) return null

  const yesterday = addDaysIso(today, -1)
  const yesterdayMeals = input.meals.filter((m) => m.date === yesterday)
  if (yesterdayMeals.length === 0) return null

  const yesterdayKcal = Math.round(
    yesterdayMeals.reduce((sum, meal) => sum + (Number(meal.totals?.kcal) || 0), 0),
  )
  if (yesterdayKcal <= 0) return null

  const expectedDeltaKg = round2((yesterdayKcal - maintainKcal) / KCAL_PER_KG)
  return {
    baseKg: round2(latest.kg),
    expectedDeltaKg,
    expectedKg: round2(latest.kg + expectedDeltaKg),
    yesterdayKcal,
    maintainKcal,
    yesterday,
  }
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

/** Linear kg/week fit; null if span &lt; 5 days or fewer than 2 points. */
function linearWeeklyRate(sample: WeightEntry[]): {
  rate: number | null
  sampleDays: number
} {
  if (sample.length < 2) return { rate: null, sampleDays: 0 }
  const first = sample[0]!
  const last = sample[sample.length - 1]!
  const sampleDays = Math.round((parseIsoMs(last.date) - parseIsoMs(first.date)) / 86_400_000)
  if (sampleDays < 5) return { rate: null, sampleDays }

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
  return { rate: round1(daily * 7), sampleDays }
}

function sortedValidWeights(weights: WeightEntry[]): WeightEntry[] {
  return [...weights]
    .filter((w) => w.kg >= 30 && w.kg <= 400)
    .sort((a, b) => a.date.localeCompare(b.date))
}

/** Linear weekly rate from the full weigh-in history. */
export function scaleWeeklyRate(weights: WeightEntry[]): {
  rate: number | null
  sampleDays: number
  sampleCount: number
  currentKg: number | null
} {
  const sorted = sortedValidWeights(weights)
  if (sorted.length === 0) {
    return { rate: null, sampleDays: 0, sampleCount: 0, currentKg: null }
  }

  const latest = sorted[sorted.length - 1]!
  const { rate, sampleDays } = linearWeeklyRate(sorted)

  return {
    rate,
    sampleDays,
    sampleCount: sorted.length,
    currentKg: latest.kg,
  }
}

/**
 * Recent scale tempo — prefer the last ~10 days (what “−1 кг за неделю” feels like),
 * then widen if there aren’t enough points.
 */
export function recentScaleWeeklyRate(
  weights: WeightEntry[],
  today: string,
  windowDays = 10,
): number | null {
  const sorted = sortedValidWeights(weights).filter((w) => w.date <= today)
  if (sorted.length < 2) return null

  const windows = [windowDays, 14, 21, 28, 42].filter(
    (d, i, arr) => arr.indexOf(d) === i,
  )
  for (const days of windows) {
    const cutoff = addDaysIso(today, -days)
    const sample = sorted.filter((w) => w.date >= cutoff)
    const { rate } = linearWeeklyRate(sample)
    if (rate != null) return rate
  }
  return null
}

/** |weekly kg| above this is usually water/glycogen noise between weigh-ins. */
const WEEKLY_RATE_OUTLIER_KG = 1.5
/** Only use weigh-in intervals ending within this many days. */
const RESPONSE_LOOKBACK_DAYS = 90

/** Median of weekly rates after dropping water-like outliers; null if &lt; 2 kept. */
export function robustWeeklyRate(rates: number[]): number | null {
  const trimmed = rates.filter((r) => Math.abs(r) <= WEEKLY_RATE_OUTLIER_KG)
  if (trimmed.length < 2) return null
  const sorted = [...trimmed].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const med =
    sorted.length % 2 === 1
      ? sorted[mid]!
      : (sorted[mid - 1]! + sorted[mid]!) / 2
  return round1(med)
}

/**
 * Forward “if you keep deficit…” rate: observed deficit intervals first,
 * then recent energy / goal-implied (not a raw short scale spike).
 */
export function pickForwardRate(input: {
  onPlanRate: number | null
  energyRate: number | null
  goalImpliedRate: number | null
  weeklyRateKg?: number | null
}): number | null {
  if (input.onPlanRate != null) return input.onPlanRate
  if (input.energyRate != null && Math.abs(input.energyRate) >= 0.05) {
    return input.energyRate
  }
  if (input.goalImpliedRate != null) return input.goalImpliedRate
  if (input.energyRate != null) return input.energyRate
  return input.weeklyRateKg ?? null
}

export function goalImpliedWeeklyRate(
  dailyKcalGoal: number,
  maintainKcal: number,
): number | null {
  if (!(dailyKcalGoal > 0) || !(maintainKcal > 0)) return null
  return round1(((dailyKcalGoal - maintainKcal) * 7) / KCAL_PER_KG)
}

/**
 * Weekly kg change implied by average intake vs maintain, plus step nudge.
 * Defaults to the last `daysBack` days (14); pass a larger window for full-diary.
 */
export function energyWeeklyRate(
  meals: Meal[],
  steps: StepsEntry[],
  maintainKcal: number,
  today: string,
  daysBack = 14,
): { rate: number | null; mealDays: number; avgKcal: number | null } {
  if (!(maintainKcal > 0)) {
    return { rate: null, mealDays: 0, avgKcal: null }
  }

  const cutoff = daysBack > 0 ? addDaysIso(today, -daysBack) : null
  const kcalByDate = new Map<string, number>()
  for (const m of meals) {
    if (m.date > today) continue
    if (cutoff && m.date < cutoff) continue
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
    .filter(
      (s) =>
        s.date <= today &&
        s.count > 0 &&
        (!cutoff || s.date >= cutoff),
    )
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

export type CalorieWeightResponse = {
  /** Observed weekly kg rate in deficit intervals (robust). */
  onPlanRate: number | null
  /** Observed weekly kg rate in overeating intervals (robust). */
  overRate: number | null
  onPlanN: number
  overN: number
}

/**
 * How the scale moved between weigh-ins during real deficit vs overeating.
 * Uses recent intervals (~90d), classifies vs maintain/goal, trims water outliers.
 */
export function analyzeCalorieWeightResponse(
  weights: WeightEntry[],
  meals: Meal[],
  dailyKcalGoal: number,
  opts?: {
    maintainKcal?: number | null
    today?: string
    lookbackDays?: number
  },
): CalorieWeightResponse {
  const maintainKcal =
    opts?.maintainKcal != null && opts.maintainKcal > 0 ? opts.maintainKcal : 0
  const today = opts?.today ?? todayIso()
  const lookback = opts?.lookbackDays ?? RESPONSE_LOOKBACK_DAYS

  if (!(dailyKcalGoal > 0) && !(maintainKcal > 0)) {
    return { onPlanRate: null, overRate: null, onPlanN: 0, overN: 0 }
  }

  const sorted = sortedValidWeights(weights).filter((w) => w.date <= today)
  const cutoff = addDaysIso(today, -lookback)

  const kcalByDate = new Map<string, number>()
  for (const m of meals) {
    if (m.date > today) continue
    kcalByDate.set(m.date, (kcalByDate.get(m.date) ?? 0) + m.totals.kcal)
  }

  const onPlan: number[] = []
  const over: number[] = []

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]!
    const b = sorted[i + 1]!
    if (b.date < cutoff) continue
    const days = Math.round((parseIsoMs(b.date) - parseIsoMs(a.date)) / 86_400_000)
    // Skip same-day / overnight noise and very long gaps (vacation, missing logs).
    if (days < 2 || days > 14) continue

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

    const isDeficit =
      maintainKcal > 0
        ? avgKcal <= maintainKcal - 100
        : dailyKcalGoal > 0 && avgKcal <= dailyKcalGoal * 1.05
    const isOver =
      !isDeficit &&
      ((dailyKcalGoal > 0 && avgKcal >= dailyKcalGoal * 1.1) ||
        (maintainKcal > 0 && avgKcal >= maintainKcal + 100))

    if (isDeficit) onPlan.push(weekly)
    else if (isOver) over.push(weekly)
  }

  const onPlanRate = robustWeeklyRate(onPlan)
  const overRate = robustWeeklyRate(over)
  const onPlanKept = onPlan.filter((r) => Math.abs(r) <= WEEKLY_RATE_OUTLIER_KG)
  const overKept = over.filter((r) => Math.abs(r) <= WEEKLY_RATE_OUTLIER_KG)

  return {
    onPlanRate,
    overRate,
    onPlanN: onPlanKept.length,
    overN: overKept.length,
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
  if (Math.abs(kg) < 0.005) return '0 кг'
  const abs = formatKg(Math.abs(kg))
  return kg > 0 ? `+${abs} кг` : `−${abs} кг`
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
      ? round2(input.targetKg)
      : null

  const energy = energyWeeklyRate(
    input.meals ?? [],
    input.steps ?? [],
    input.maintainKcal ?? 0,
    today,
    14,
  )

  const response = analyzeCalorieWeightResponse(
    input.weights,
    input.meals ?? [],
    input.dailyKcalGoal ?? 0,
    {
      maintainKcal: input.maintainKcal,
      today,
    },
  )

  const weeklyRateKg = blendRates(scale.rate, energy.rate)
  const implied = goalImpliedWeeklyRate(
    input.dailyKcalGoal ?? 0,
    input.maintainKcal ?? 0,
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
  if (response.onPlanN >= 2) confidence = 'ok'

  const planRateKg = pickForwardRate({
    onPlanRate: response.onPlanRate,
    energyRate: energy.rate,
    goalImpliedRate: implied,
    weeklyRateKg,
  })
  const project = (weeks: number, rate: number | null = planRateKg) =>
    rate == null ? null : round2(currentKg + rate * weeks)

  const inOneWeek = project(1)
  const inTwoWeeks = project(2)
  const inFourWeeks = project(4)

  let weeksToTarget: number | null = null
  if (target != null && planRateKg != null && Math.abs(planRateKg) >= 0.05) {
    const weeks = (target - currentKg) / planRateKg
    if (weeks > 0 && weeks < 104) weeksToTarget = Math.round(weeks * 10) / 10
  }

  const notes: string[] = []
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
    overRateKg: response.overRate,
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
  return first ? round2(first.kg) : null
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
  overRateKg: number | null
  targetKg: number | null
  weeksToTarget: number | null
  confidence: 'low' | 'ok'
}): string {
  if (f.weeklyRateKg == null && f.planRateKg == null) {
    if (f.targetKg != null) {
      const left = round2(f.currentKg - f.targetKg)
      if (Math.abs(left) < 0.15) return 'Вы уже около целевого веса.'
      return left > 0
        ? `До цели ${formatKg(left)} кг`
        : `Цель выше текущего на ${formatKg(Math.abs(left))} кг`
    }
    return 'Появится темп, когда накопится несколько дней веса и еды'
  }

  // Prefer observed deficit / energy plan rate for the forward “if you keep…” line.
  const forwardRate = f.planRateKg ?? f.weeklyRateKg!
  const parts: string[] = []

  if (Math.abs(forwardRate) < 0.05) {
    parts.push('Если держать так — вес почти на месте')
  } else {
    const weekAhead = round2(f.currentKg + forwardRate)
    const prefix =
      forwardRate < 0 ? 'Если держать дефицит' : 'Если есть как сейчас'
    parts.push(
      `${prefix} — ≈ ${formatDelta(forwardRate)} за неделю → ≈ ${formatKg(weekAhead)} кг`,
    )
  }

  if (f.overRateKg != null && Math.abs(f.overRateKg) >= 0.05) {
    parts.push(`при переедании было ≈ ${formatDelta(f.overRateKg)}/нед`)
  }

  if (f.targetKg != null) {
    const left = round2(f.currentKg - f.targetKg)
    if (Math.abs(left) < 0.15) parts.push('у цели')
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
