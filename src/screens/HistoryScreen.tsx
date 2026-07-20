import { useEffect, useMemo } from 'react'
import { DaySummaryCard } from '../components/DaySummaryCard'
import { WeekCard } from '../components/WeekCard'
import { todayIso } from '../lib/date'
import { buildTodayTimeline } from '../lib/dayStats'
import {
  getCachedWeekSummary,
  getWeekNutritionSummary,
} from '../lib/weekSummaryLlm'
import type { AppData } from '../types'

type Props = {
  data: AppData
  dailyKcalGoal: number
  maintainKcalGoal: number
  onBack: () => void
}

export function HistoryScreen({
  data,
  dailyKcalGoal,
  maintainKcalGoal,
  onBack,
}: Props) {
  const { recentDays, historyWeeks } = useMemo(
    () => buildTodayTimeline(data, dailyKcalGoal, todayIso()),
    [data, dailyKcalGoal],
  )

  // Freeze LLM reports once when a week first appears as completed — not on every revisit.
  useEffect(() => {
    for (const week of historyWeeks) {
      if (getCachedWeekSummary(week.weekStart)) continue
      void getWeekNutritionSummary(week)
    }
  }, [historyWeeks])

  const empty = recentDays.length === 0 && historyWeeks.length === 0

  return (
    <section className="screen">
      <header className="screen-header">
        <button type="button" className="link-btn" onClick={onBack}>
          ← Назад
        </button>
        <h1>История</h1>
      </header>

      {empty ? (
        <p className="muted">Пока пусто</p>
      ) : (
        <div className="week-list">
          {recentDays.map((day) => (
            <DaySummaryCard
              key={day.date}
              day={day}
              dailyKcalGoal={dailyKcalGoal}
              maintainKcalGoal={maintainKcalGoal}
            />
          ))}
          {historyWeeks.map((week) => (
            <WeekCard
              key={week.weekStart}
              week={week}
              maintainKcalGoal={maintainKcalGoal}
            />
          ))}
        </div>
      )}
    </section>
  )
}
