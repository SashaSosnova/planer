import type { AppData, Meal, PeriodStart } from '../types'
import { cyclePhaseTip, getCycleInfo, type CyclePhase } from './cycle'
import { todayIso } from './date'

const SWEET_RE =
  /шоколад|мороже|слойк|киндер|kinder|торт|чизкейк|конфет|зефир|вафл|батончик|сгущён|сгущен|м&м|m&m|драже|эклер|печенье|булоч|круассан|пирож|десерт|сахар|мёд|мед\b|джем|нутелл|bueno|kitkat/i

export type PhaseInsight = {
  phase: CyclePhase
  days: number
  avgKcal: number
  avgDelta: number
  overShare: number
  sweetShare: number
}

export type CycleCalorieInsights = {
  /** Tip for today's phase — personal if enough data, else generic. */
  tip: string | null
  phases: PhaseInsight[]
  sampleDays: number
}

function dayHasSweet(meals: Meal[]): boolean {
  return meals.some((m) => {
    const blob = `${m.rawText} ${m.items.map((i) => i.name).join(' ')}`
    return SWEET_RE.test(blob)
  })
}

function mealsByDate(meals: Meal[]): Map<string, Meal[]> {
  const map = new Map<string, Meal[]>()
  for (const m of meals) {
    const list = map.get(m.date) ?? []
    list.push(m)
    map.set(m.date, list)
  }
  return map
}

/**
 * Aggregate calorie / sweet patterns by cycle phase from the diary.
 */
export function analyzeCycleCalories(
  periodStarts: PeriodStart[],
  meals: Meal[],
  dailyKcalGoal: number,
  opts?: {
    cycleLengthDays?: number
    periodLengthDays?: number
    today?: string
  },
): CycleCalorieInsights {
  const today = opts?.today ?? todayIso()
  const byDate = mealsByDate(meals.filter((m) => m.date <= today))
  const buckets = new Map<
    CyclePhase,
    { kcal: number[]; over: number; sweet: number; n: number }
  >()

  for (const [date, dayMeals] of byDate) {
    const info = getCycleInfo(
      periodStarts,
      date,
      opts?.cycleLengthDays,
      opts?.periodLengthDays,
    )
    if (info.phase === 'unknown') continue
    const kcal = dayMeals.reduce((s, m) => s + m.totals.kcal, 0)
    if (kcal < 200) continue
    const bucket = buckets.get(info.phase) ?? { kcal: [], over: 0, sweet: 0, n: 0 }
    bucket.kcal.push(kcal)
    bucket.n++
    if (dailyKcalGoal > 0 && kcal > dailyKcalGoal * 1.05) bucket.over++
    if (dayHasSweet(dayMeals)) bucket.sweet++
    buckets.set(info.phase, bucket)
  }

  const phases: PhaseInsight[] = []
  for (const phase of ['menstrual', 'follicular', 'ovulation', 'luteal'] as CyclePhase[]) {
    const b = buckets.get(phase)
    if (!b || b.n < 2) continue
    const avgKcal = Math.round(b.kcal.reduce((s, v) => s + v, 0) / b.n)
    phases.push({
      phase,
      days: b.n,
      avgKcal,
      avgDelta: dailyKcalGoal > 0 ? avgKcal - dailyKcalGoal : 0,
      overShare: b.over / b.n,
      sweetShare: b.sweet / b.n,
    })
  }

  const sampleDays = phases.reduce((s, p) => s + p.days, 0)
  const todayInfo = getCycleInfo(
    periodStarts,
    today,
    opts?.cycleLengthDays,
    opts?.periodLengthDays,
  )
  const tip = buildTip(todayInfo.phase, phases, sampleDays)

  return { tip, phases, sampleDays }
}

function buildTip(
  phase: CyclePhase,
  phases: PhaseInsight[],
  sampleDays: number,
): string | null {
  if (phase === 'unknown') return null
  const generic = cyclePhaseTip(phase)
  if (sampleDays < 12 || phases.length < 2) return generic

  const current = phases.find((p) => p.phase === phase)
  const easiest = [...phases].sort((a, b) => a.avgDelta - b.avgDelta)[0]
  const hardest = [...phases].sort((a, b) => b.avgDelta - a.avgDelta)[0]
  const sweetest = [...phases].sort((a, b) => b.sweetShare - a.sweetShare)[0]

  const bits: string[] = []

  if (current && Math.abs(current.avgDelta) >= 80) {
    const sign = current.avgDelta > 0 ? '+' : ''
    bits.push(`Обычно ${sign}${Math.round(current.avgDelta)} ккал к цели`)
  } else if (current && current.overShare >= 0.45) {
    bits.push('Обычно чаще дни с перебором')
  } else if (
    easiest &&
    easiest.phase === phase &&
    hardest &&
    hardest.phase !== phase &&
    hardest.avgDelta - easiest.avgDelta >= 100
  ) {
    bits.push('Обычно план держать проще')
  }

  if (
    sweetest &&
    sweetest.phase === phase &&
    sweetest.sweetShare >= 0.35 &&
    sweetest.days >= 3
  ) {
    bits.push('чаще тянет на сладкое')
  } else if (
    sweetest &&
    sweetest.sweetShare >= 0.4 &&
    sweetest.phase === 'luteal' &&
    phase !== 'luteal'
  ) {
    bits.push('сладкое чаще ближе к концу цикла')
  }

  if (!bits.length) {
    if (current && current.avgDelta <= -50) {
      bits.push('Обычно легче уложиться в калораж')
    } else {
      return generic
    }
  }

  const text = bits.join(', ')
  return text.endsWith('.') ? text : `${text}.`
}

/** Convenience for Today / screens with full app data. */
export function cycleInsightsFromAppData(
  data: AppData,
  dailyKcalGoal: number,
  opts?: {
    cycleLengthDays?: number
    periodLengthDays?: number
    today?: string
  },
): CycleCalorieInsights {
  return analyzeCycleCalories(data.periodStarts, data.meals, dailyKcalGoal, opts)
}
