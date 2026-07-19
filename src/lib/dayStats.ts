import type { AppData, MacroSet, Meal, MoodLevel } from '../types'
import { emptyMacros, sumMacros } from './nutrition'
import { todayIso } from './date'
import { vegGramsFromMeals } from './vegetables'
import {
  formatWeekRange,
  isWeekComplete,
  isoDatesInWeek,
  shortRuWeekday,
  weekStartIso,
} from './week'

export type DayStats = {
  date: string
  label: string
  meals: Meal[]
  totals: MacroSet
  /** Grams of vegetable-like items (auto-detected by name). */
  vegGrams: number
  approximate: boolean
  weightKg?: number
  steps?: number
  mood?: MoodLevel
  sleepHours?: number
  hasData: boolean
}

export type WeekStats = {
  weekStart: string
  weekEnd: string
  label: string
  days: DayStats[]
  totals: MacroSet
  kcalGoal: number
  weightStart?: number
  weightEnd?: number
  weightDelta?: number
  avgSteps?: number
  /** Average mood 1–5 over days with a check-in */
  avgMood?: number
  /** Average sleep hours over days with a check-in */
  avgSleepHours?: number
  mealSnippets: string[]
}

function avgOf(values: number[]): number | undefined {
  if (values.length === 0) return undefined
  return Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10
}

export function statsForDate(data: AppData, date: string): DayStats {
  const meals = data.meals
    .filter((m) => m.date === date)
    .sort((a, b) => a.createdAt - b.createdAt)
  const totals = meals.length ? sumMacros(meals.map((m) => m.totals)) : emptyMacros()
  const weight = data.weights.find((w) => w.date === date)
  const steps = data.steps.find((s) => s.date === date)
  const checkIn = data.checkIns.find((c) => c.date === date)
  return {
    date,
    label: shortRuWeekday(date),
    meals,
    totals,
    vegGrams: vegGramsFromMeals(meals),
    approximate: meals.some((m) => m.isApproximate || m.eatingOut),
    weightKg: weight?.kg,
    steps: steps?.count,
    mood: checkIn?.mood,
    sleepHours: checkIn?.sleepHours,
    hasData:
      meals.length > 0 ||
      weight != null ||
      steps != null ||
      checkIn?.mood != null ||
      checkIn?.sleepHours != null,
  }
}

function weightNear(data: AppData, dates: string[], fromStart: boolean): number | undefined {
  const ordered = fromStart ? dates : [...dates].reverse()
  for (const d of ordered) {
    const w = data.weights.find((x) => x.date === d)
    if (w) return w.kg
  }
  return undefined
}

export function buildWeekStats(data: AppData, weekStart: string, dailyKcalGoal: number): WeekStats {
  const dates = isoDatesInWeek(weekStart)
  const days = dates.map((d) => statsForDate(data, d))
  const totals = sumMacros(days.map((d) => d.totals))
  const stepDays = days.filter((d) => d.steps != null && d.steps > 0)
  const avgSteps =
    stepDays.length > 0
      ? Math.round(stepDays.reduce((s, d) => s + (d.steps ?? 0), 0) / stepDays.length)
      : undefined
  const avgMood = avgOf(days.filter((d) => d.mood != null).map((d) => d.mood!))
  const avgSleepHours = avgOf(
    days.filter((d) => d.sleepHours != null).map((d) => d.sleepHours!),
  )
  const weightStart = weightNear(data, dates, true)
  const weightEnd = weightNear(data, dates, false)
  const weightDelta =
    weightStart != null && weightEnd != null
      ? Math.round((weightEnd - weightStart) * 10) / 10
      : undefined

  const mealSnippets = days.flatMap((d) =>
    d.meals.map((m) => `${d.date} ${m.mealType}: ${m.rawText} (${Math.round(m.totals.kcal)} ккал)`),
  )

  return {
    weekStart,
    weekEnd: dates[6]!,
    label: formatWeekRange(weekStart),
    days,
    totals,
    kcalGoal: dailyKcalGoal * 7,
    weightStart,
    weightEnd,
    weightDelta,
    avgSteps,
    avgMood,
    avgSleepHours,
    mealSnippets,
  }
}

/** Current week days before today (newest first), then completed weeks (newest first). */
export function buildTodayTimeline(
  data: AppData,
  dailyKcalGoal: number,
  today = todayIso(),
): {
  today: DayStats
  recentDays: DayStats[]
  completedWeeks: WeekStats[]
} {
  const todayStats = statsForDate(data, today)
  const currentWeekStart = weekStartIso(today)
  const currentDates = isoDatesInWeek(currentWeekStart)
  const recentDays = currentDates
    .filter((d) => d < today)
    .map((d) => statsForDate(data, d))
    .filter((d) => d.hasData)
    .reverse()

  const weekStarts = new Set<string>()
  for (const m of data.meals) weekStarts.add(weekStartIso(m.date))
  for (const w of data.weights) weekStarts.add(weekStartIso(w.date))
  for (const s of data.steps) weekStarts.add(weekStartIso(s.date))
  for (const c of data.checkIns) weekStarts.add(weekStartIso(c.date))

  const completedWeeks = [...weekStarts]
    .filter((ws) => isWeekComplete(ws, today))
    .sort((a, b) => (a < b ? 1 : -1))
    .map((ws) => buildWeekStats(data, ws, dailyKcalGoal))
    .filter((w) => w.days.some((d) => d.hasData))

  return { today: todayStats, recentDays, completedWeeks }
}
