import type { DayStats } from './dayStats'

/** Soft one-line day snapshot. Empty days return null (nothing to show). */
export function dayBrief(day: DayStats, dailyKcalGoal: number): string | null {
  if (day.meals.length === 0) return null

  const kcal = Math.round(day.totals.kcal)
  const goal = dailyKcalGoal > 0 ? dailyKcalGoal : 0
  if (!(goal > 0)) return `${kcal} ккал`

  const ratio = kcal / goal
  if (ratio < 0.55) return `${kcal} ккал`
  if (ratio <= 1.1) return `${kcal} ккал · около цели`
  if (ratio <= 1.35) return `${kcal} ккал · чуть выше`
  return `${kcal} ккал · выше цели`
}
