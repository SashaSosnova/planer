import { useEffect, useMemo } from 'react'
import { FourWeekAnalysisCard } from '../components/FourWeekAnalysisCard'
import { DaySummaryCard } from '../components/DaySummaryCard'
import { WeekCard } from '../components/WeekCard'
import type { ActivityLevel } from '../lib/calorieGoal'
import { todayIso } from '../lib/date'
import { buildTodayTimeline } from '../lib/dayStats'
import { buildFourWeekAnalysis } from '../lib/fourWeekAnalysis'
import {
  getCachedWeekSummary,
  getWeekNutritionSummary,
} from '../lib/weekSummaryLlm'
import type { AppData } from '../types'

type Props = {
  data: AppData
  dailyKcalGoal: number
  maintainKcalGoal: number
  targetWeightKg?: number | null
  activity?: ActivityLevel | null
  onBack: () => void
  onOpenDay: (date: string) => void
  onOpenMeal: (mealId: string) => void
  onAddMeal: (date: string) => void
  onOpenProfile?: () => void
}

export function HistoryScreen({
  data,
  dailyKcalGoal,
  maintainKcalGoal,
  targetWeightKg,
  activity,
  onBack,
  onOpenDay,
  onOpenMeal,
  onAddMeal,
  onOpenProfile,
}: Props) {
  const { recentDays, historyWeeks } = useMemo(
    () => buildTodayTimeline(data, dailyKcalGoal, todayIso()),
    [data, dailyKcalGoal],
  )
  const fourWeek = useMemo(
    () =>
      buildFourWeekAnalysis({
        data,
        dailyKcalGoal,
        maintainKcal: maintainKcalGoal,
        targetKg: targetWeightKg,
        activity,
      }),
    [data, dailyKcalGoal, maintainKcalGoal, targetWeightKg, activity],
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

      {empty && !fourWeek ? (
        <p className="muted">Пока пусто</p>
      ) : (
        <>
          {fourWeek && (
            <FourWeekAnalysisCard analysis={fourWeek} onOpenProfile={onOpenProfile} />
          )}
          <div className="week-list">
            {recentDays.map((day) => (
              <DaySummaryCard
                key={day.date}
                day={day}
                dailyKcalGoal={dailyKcalGoal}
                maintainKcalGoal={maintainKcalGoal}
                onOpen={() => onOpenDay(day.date)}
              />
            ))}
            {historyWeeks.map((week) => (
              <WeekCard
                key={week.weekStart}
                week={week}
                maintainKcalGoal={maintainKcalGoal}
                onOpenDay={onOpenDay}
                onOpenMeal={onOpenMeal}
                onAddMeal={onAddMeal}
              />
            ))}
          </div>
        </>
      )}
    </section>
  )
}
