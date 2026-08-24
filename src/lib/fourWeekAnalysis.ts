import type { AppData, Meal, WeightEntry } from '../types'
import { ACTIVITY_LABELS, type ActivityLevel } from './calorieGoal'
import { addDaysIso, todayIso } from './date'
import { formatKg, round2 } from './nutrition'
import { formatWeekRange, weekEndIso, weekStartIso } from './week'
import { KCAL_PER_KG } from './weightForecast'

const WEEK_COUNT = 4
const LOGGED_MIN_KCAL = 800
const MIN_LOGGED_DAYS = 10
const MIN_WEIGH_INS = 4
const MIN_SPAN_DAYS = 14

export type AnalysisActionKind = 'do' | 'keep' | 'watch'
export type AnalysisActionGo = 'profile'

export type AnalysisAction = {
  id: string
  kind: AnalysisActionKind
  title: string
  detail: string
  go?: AnalysisActionGo
}

export type AnalysisWeekRow = {
  start: string
  end: string
  label: string
  loggedDays: number
  avgKcal: number | null
  kgStart: number | null
  kgEnd: number | null
  deltaKg: number | null
}

export type FourWeekAnalysis = {
  from: string
  to: string
  loggedDays: number
  weighIns: number
  avgKcal: number
  dailyKcalGoal: number | null
  maintainKcal: number | null
  observedMaintainKcal: number | null
  kgStart: number
  kgEnd: number
  deltaKg: number
  weeklyRateKg: number
  recentWeeklyRateKg: number | null
  avgSteps: number | null
  days10k: number
  dayToMorningR: number | null
  weeks: AnalysisWeekRow[]
  headline: string
  caveat: string
  actions: AnalysisAction[]
}

function eatenMeals(meals: Meal[]): Meal[] {
  return meals.filter((m) => !m.planned)
}

function kcalByDate(meals: Meal[], from: string, to: string): Map<string, number> {
  const map = new Map<string, number>()
  for (const m of eatenMeals(meals)) {
    if (m.date < from || m.date > to) continue
    map.set(m.date, (map.get(m.date) ?? 0) + (Number(m.totals?.kcal) || 0))
  }
  return map
}

function latestWeightByDate(
  weights: WeightEntry[],
  from: string,
  to: string,
): Map<string, number> {
  const sorted = [...weights]
    .filter((w) => w.date >= from && w.date <= to && w.kg >= 30 && w.kg <= 400)
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)
  const map = new Map<string, number>()
  for (const w of sorted) map.set(w.date, w.kg)
  return map
}

function signedKg(delta: number): string {
  if (Math.abs(delta) < 0.05) return '0 кг'
  const core = formatKg(Math.abs(delta))
  return delta > 0 ? `+${core} кг` : `−${core} кг`
}

function daysBetween(a: string, b: string): number {
  return Math.round(
    (Date.parse(`${b}T12:00:00`) - Date.parse(`${a}T12:00:00`)) / 86_400_000,
  )
}

function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length
  if (n < 8) return null
  const mx = xs.reduce((s, v) => s + v, 0) / n
  const my = ys.reduce((s, v) => s + v, 0) / n
  let num = 0
  let dx = 0
  let dy = 0
  for (let i = 0; i < n; i++) {
    const x = xs[i]! - mx
    const y = ys[i]! - my
    num += x * y
    dx += x * x
    dy += y * y
  }
  if (dx < 1e-9 || dy < 1e-9) return null
  return round2(num / Math.sqrt(dx * dy))
}

function mean(nums: number[]): number {
  return nums.reduce((s, v) => s + v, 0) / nums.length
}

function nextActivity(current: ActivityLevel): ActivityLevel | null {
  if (current === 'sedentary') return 'light'
  if (current === 'light') return 'moderate'
  return null
}

/**
 * Last 4 calendar weeks (Mon–Sun): intake vs scale, weekly tempo, actions.
 * Returns null until there are enough logged days and weigh-ins.
 */
export function buildFourWeekAnalysis(input: {
  data: AppData
  dailyKcalGoal?: number | null
  maintainKcal?: number | null
  targetKg?: number | null
  activity?: ActivityLevel | null
  today?: string
}): FourWeekAnalysis | null {
  const today = input.today ?? todayIso()
  const thisMonday = weekStartIso(today)
  const from = addDaysIso(thisMonday, -7 * (WEEK_COUNT - 1))
  const calendarDays = daysBetween(from, today) + 1
  const kcalMap = kcalByDate(input.data.meals, from, today)
  const weightMap = latestWeightByDate(input.data.weights, from, today)

  const loggedDates = [...kcalMap.entries()]
    .filter(([, kcal]) => kcal >= LOGGED_MIN_KCAL)
    .map(([d]) => d)
    .sort()
  const weightDates = [...weightMap.keys()].sort()
  if (loggedDates.length < MIN_LOGGED_DAYS || weightDates.length < MIN_WEIGH_INS) {
    return null
  }

  const firstW = weightDates[0]!
  const lastW = weightDates[weightDates.length - 1]!
  const kgStart = weightMap.get(firstW)!
  const kgEnd = weightMap.get(lastW)!
  const spanDays = Math.max(1, daysBetween(firstW, lastW))
  if (spanDays < MIN_SPAN_DAYS) return null

  const loggedKcal = loggedDates.map((d) => kcalMap.get(d)!)
  const avgKcal = Math.round(mean(loggedKcal))
  const deltaKg = round2(kgEnd - kgStart)
  const weeklyRateKg = round2((deltaKg / spanDays) * 7)

  const recentFrom = addDaysIso(today, -13)
  const recentW = weightDates.filter((d) => d >= recentFrom)
  let recentWeeklyRateKg: number | null = null
  if (recentW.length >= 4) {
    const a = recentW[0]!
    const b = recentW[recentW.length - 1]!
    const days = Math.max(1, daysBetween(a, b))
    recentWeeklyRateKg = round2(((weightMap.get(b)! - weightMap.get(a)!) / days) * 7)
  }

  const observedMaintainKcal = Math.round(avgKcal - (deltaKg * KCAL_PER_KG) / spanDays)

  const stepsInWindow = input.data.steps.filter(
    (s) => s.date >= from && s.date <= today && s.count > 0,
  )
  const avgSteps =
    stepsInWindow.length >= 7
      ? Math.round(mean(stepsInWindow.map((s) => s.count)))
      : null
  const days10k = stepsInWindow.filter((s) => s.count >= 10_000).length

  const pairsX: number[] = []
  const pairsY: number[] = []
  for (let i = 0; i < weightDates.length - 1; i++) {
    const d0 = weightDates[i]!
    const d1 = weightDates[i + 1]!
    const kcal = kcalMap.get(d0)
    if (kcal == null || kcal < LOGGED_MIN_KCAL) continue
    if (daysBetween(d0, d1) !== 1) continue
    pairsX.push(kcal)
    pairsY.push(weightMap.get(d1)! - weightMap.get(d0)!)
  }
  const dayToMorningR = pearson(pairsX, pairsY)

  const weeks: AnalysisWeekRow[] = []
  for (let i = 0; i < WEEK_COUNT; i++) {
    const start = addDaysIso(from, i * 7)
    const sunday = weekEndIso(start)
    const end = sunday > today ? today : sunday
    const weekLogged = loggedDates.filter((d) => d >= start && d <= end)
    const weekW = weightDates.filter((d) => d >= start && d <= end)
    const avg = weekLogged.length
      ? Math.round(mean(weekLogged.map((d) => kcalMap.get(d)!)))
      : null
    const w0 = weekW[0] ? weightMap.get(weekW[0])! : null
    const w1 = weekW.length ? weightMap.get(weekW[weekW.length - 1]!)! : null
    weeks.push({
      start,
      end: sunday,
      label: formatWeekRange(start),
      loggedDays: weekLogged.length,
      avgKcal: avg,
      kgStart: w0 != null ? round2(w0) : null,
      kgEnd: w1 != null ? round2(w1) : null,
      deltaKg: w0 != null && w1 != null ? round2(w1 - w0) : null,
    })
  }

  const goal = input.dailyKcalGoal != null && input.dailyKcalGoal > 0 ? input.dailyKcalGoal : null
  const maintain =
    input.maintainKcal != null && input.maintainKcal > 0 ? input.maintainKcal : null
  const incompleteShare = 1 - loggedDates.length / calendarDays
  const periodInWindow = input.data.periodStarts.some((p) => p.date >= from && p.date <= today)

  const firstHalf = (weeks[0]?.deltaKg ?? 0) + (weeks[1]?.deltaKg ?? 0)
  const secondHalf = (weeks[2]?.deltaKg ?? 0) + (weeks[3]?.deltaKg ?? 0)

  const actions: AnalysisAction[] = []

  if (dayToMorningR == null || Math.abs(dayToMorningR) < 0.35) {
    actions.push({
      id: 'daily-noise',
      kind: 'watch',
      title: 'Не равняйте утро с вчерашними калориями',
      detail:
        'За сутки жир почти не виден на весах. Вода, соль и цикл сильнее, чем ±300 ккал. Смотрите неделю.',
    })
  }

  const activity = input.activity ?? null
  const bump = activity ? nextActivity(activity) : null
  const stepsHighForSedentary = avgSteps != null && avgSteps >= 5000 && days10k >= 3
  const stepsHighForLight = avgSteps != null && avgSteps >= 8000 && days10k >= 4
  const formulaLow =
    observedMaintainKcal != null &&
    maintain != null &&
    observedMaintainKcal - maintain >= 200
  if (
    bump &&
    ((activity === 'sedentary' && (stepsHighForSedentary || formulaLow)) ||
      (activity === 'light' && stepsHighForLight && formulaLow))
  ) {
    actions.push({
      id: 'activity',
      kind: 'do',
      title: `Поставьте активность «${ACTIVITY_LABELS[bump]}»`,
      detail: `Сейчас в профиле «${ACTIVITY_LABELS[activity]}», а шаги и темп веса говорят, что поддержка выше формулы${maintain != null ? ` (~${maintain} ккал)` : ''}. Кольцо и прогноз будут честнее.`,
      go: 'profile',
    })
  }

  if (incompleteShare >= 0.18) {
    actions.push({
      id: 'incomplete',
      kind: 'do',
      title: 'Закрывайте дни целиком',
      detail: `Полных дней ${loggedDates.length} из ${calendarDays}. Дырки в дневнике выглядят как дефицит и путают разбор.`,
    })
  }

  if (goal != null && avgKcal > goal * 1.12) {
    actions.push({
      id: 'over-goal',
      kind: 'do',
      title: `Верните среднюю ближе к ${goal} ккал`,
      detail: `Сейчас ${avgKcal} ккал/день — выше цели. Имеет смысл не крутить формулу, а закрыть обычные дни.`,
    })
  } else if (
    goal != null &&
    Math.abs(avgKcal - goal) <= Math.max(80, goal * 0.08) &&
    deltaKg <= -0.4
  ) {
    actions.push({
      id: 'keep-goal',
      kind: 'keep',
      title: `Держите цель ${goal} ккал`,
      detail: `Средняя ${avgKcal} ккал почти как план, вес ${signedKg(deltaKg)}. Не поднимайте калории только потому, что неделя тише первой.`,
    })
  }

  if (firstHalf <= -1 && secondHalf > firstHalf + 0.5) {
    actions.push({
      id: 'slowing',
      kind: 'keep',
      title: 'Замедление после старта — нормально',
      detail:
        'Первые недели часто уходит вода и гликоген. Дальше темп ближе к жиру: меньше кг на тех же калориях.',
    })
  }

  if (periodInWindow) {
    actions.push({
      id: 'cycle',
      kind: 'watch',
      title: 'Вокруг цикла весы врут на 0,3–0,6 кг',
      detail:
        'В этом окне были месячные. Не режьте калории из‑за двух тяжёлых утр — смотрите ту же неделю через 5–7 дней.',
    })
  }

  const target = input.targetKg != null && input.targetKg > 0 ? input.targetKg : null
  const pace = recentWeeklyRateKg ?? weeklyRateKg
  if (target != null && kgEnd > target + 0.3 && pace < -0.12) {
    const weeksLeft = Math.max(1, Math.round((kgEnd - target) / -pace))
    actions.push({
      id: 'eta',
      kind: 'keep',
      title: `До цели ~${weeksLeft} нед. при текущем темпе`,
      detail: `Остаётся ${formatKg(round2(kgEnd - target))} кг. Темп последних недель ${signedKg(pace)}/нед. — если дневник полный и шаги не падают.`,
    })
  }

  const kindRank: Record<AnalysisActionKind, number> = { do: 0, keep: 1, watch: 2 }
  const picked = [...actions]
    .sort((a, b) => kindRank[a.kind] - kindRank[b.kind])
    .slice(0, 4)

  const vsGoal =
    goal != null ? `при цели ${goal}` : maintain != null ? `при поддержке ~${maintain}` : ''
  const headline = `За месяц ${signedKg(deltaKg)} · ${avgKcal} ккал/день${vsGoal ? ` ${vsGoal}` : ''}`
  const caveat =
    dayToMorningR != null && Math.abs(dayToMorningR) < 0.35
      ? 'Калории за день и вес на следующее утро почти не связаны — это не «съела больше → +200 г».'
      : 'Неделя надежнее утра: на весах в основном вода, не вчерашний ужин.'

  return {
    from,
    to: today,
    loggedDays: loggedDates.length,
    weighIns: weightDates.length,
    avgKcal,
    dailyKcalGoal: goal,
    maintainKcal: maintain,
    observedMaintainKcal,
    kgStart: round2(kgStart),
    kgEnd: round2(kgEnd),
    deltaKg,
    weeklyRateKg,
    recentWeeklyRateKg,
    avgSteps,
    days10k,
    dayToMorningR,
    weeks,
    headline,
    caveat,
    actions: picked,
  }
}
