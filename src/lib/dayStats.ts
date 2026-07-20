import type { AppData, MacroSet, Meal } from '../types'
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
  noteText?: string
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
  mealSnippets: string[]
}

export function statsForDate(data: AppData, date: string): DayStats {
  const meals = data.meals
    .filter((m) => m.date === date)
    .sort((a, b) => a.createdAt - b.createdAt)
  const totals = meals.length ? sumMacros(meals.map((m) => m.totals)) : emptyMacros()
  const weight = data.weights.find((w) => w.date === date)
  const steps = data.steps.find((s) => s.date === date)
  const note = (data.dayNotes ?? []).find((n) => n.date === date)
  const noteText = note?.text.trim() ? note.text.trim() : undefined
  return {
    date,
    label: shortRuWeekday(date),
    meals,
    totals,
    vegGrams: vegGramsFromMeals(meals),
    approximate: meals.some((m) => m.isApproximate || m.eatingOut),
    weightKg: weight?.kg,
    steps: steps?.count,
    noteText,
    hasData:
      meals.length > 0 || weight != null || steps != null || noteText != null,
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

export function buildWeekStats(
  data: AppData,
  weekStart: string,
  dailyKcalGoal: number,
  /** If set, only days strictly before this ISO date (for the in-progress week). */
  untilDate?: string,
): WeekStats {
  const allDates = isoDatesInWeek(weekStart)
  const dates =
    untilDate != null ? allDates.filter((d) => d < untilDate) : allDates
  const days = dates.map((d) => statsForDate(data, d))
  const totals = sumMacros(days.map((d) => d.totals))
  const stepDays = days.filter((d) => d.steps != null && d.steps > 0)
  const avgSteps =
    stepDays.length > 0
      ? Math.round(stepDays.reduce((s, d) => s + (d.steps ?? 0), 0) / stepDays.length)
      : undefined
  const weightStart = weightNear(data, dates, true)
  const weightEnd = weightNear(data, dates, false)
  const weightDelta =
    weightStart != null && weightEnd != null
      ? Math.round((weightEnd - weightStart) * 10) / 10
      : undefined

  const mealSnippets = days.flatMap((d) =>
    d.meals.map((m) => `${d.date} ${m.mealType}: ${m.rawText} (${Math.round(m.totals.kcal)} ккал)`),
  )

  const dayCount = Math.max(dates.length, 1)
  return {
    weekStart,
    weekEnd: allDates[6]!,
    label: formatWeekRange(weekStart),
    days,
    totals,
    kcalGoal: dailyKcalGoal * dayCount,
    weightStart,
    weightEnd,
    weightDelta,
    avgSteps,
    mealSnippets,
  }
}

/**
 * Timeline for History / Today:
 * - recentDays: past days of the in-progress week (newest first), shown as days
 * - historyWeeks: finished weeks only (newest first), collapsed into week cards
 */
export function buildTodayTimeline(
  data: AppData,
  dailyKcalGoal: number,
  today = todayIso(),
): {
  today: DayStats
  recentDays: DayStats[]
  /** @deprecated alias of historyWeeks */
  completedWeeks: WeekStats[]
  historyWeeks: WeekStats[]
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
  for (const n of data.dayNotes ?? []) weekStarts.add(weekStartIso(n.date))

  const historyWeeks = [...weekStarts]
    .filter((ws) => isWeekComplete(ws, today))
    .sort((a, b) => (a < b ? 1 : -1))
    .map((ws) => buildWeekStats(data, ws, dailyKcalGoal))
    .filter((w) => w.days.some((d) => d.hasData))

  return {
    today: todayStats,
    recentDays,
    completedWeeks: historyWeeks,
    historyWeeks,
  }
}
