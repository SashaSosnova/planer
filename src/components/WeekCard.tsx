import { useEffect, useState } from 'react'
import type { WeekStats } from '../lib/dayStats'
import {
  getCachedWeekSummary,
  getWeekNutritionSummary,
  localWeekNutritionNote,
} from '../lib/weekSummaryLlm'
import { CalorieRing } from './CalorieRing'

type Props = {
  week: WeekStats
  maintainKcalGoal: number
}

export function WeekCard({ week, maintainKcalGoal }: Props) {
  const cached = getCachedWeekSummary(week.weekStart)
  const [note, setNote] = useState(() => cached ?? localWeekNutritionNote(week))
  const [loadingNote, setLoadingNote] = useState(() => !cached)

  useEffect(() => {
    const existing = getCachedWeekSummary(week.weekStart)
    if (existing) {
      setNote(existing)
      setLoadingNote(false)
      return
    }
    let cancelled = false
    setLoadingNote(true)
    void getWeekNutritionSummary(week)
      .then((text) => {
        if (!cancelled) setNote(text)
      })
      .finally(() => {
        if (!cancelled) setLoadingNote(false)
      })
    return () => {
      cancelled = true
    }
  }, [week.weekStart])

  const weightLabel =
    week.weightDelta == null
      ? '—'
      : `${week.weightDelta > 0 ? '+' : ''}${String(week.weightDelta).replace('.', ',')} кг`
  const weightTone =
    week.weightDelta == null
      ? undefined
      : week.weightDelta < 0
        ? 'down'
        : week.weightDelta > 0
          ? 'up'
          : 'flat'

  // Empty days (no meals) don't pull the average down — they "dropped out".
  const loggedDays = Math.max(week.days.filter((d) => d.meals.length > 0).length, 1)
  const avgKcal = week.totals.kcal / loggedDays
  const avgProtein = week.totals.protein / loggedDays
  const avgFat = week.totals.fat / loggedDays
  const avgCarbs = week.totals.carbs / loggedDays
  const dailyGoal = week.days.length > 0 ? week.kcalGoal / week.days.length : week.kcalGoal

  return (
    <article className="week-card">
      <h3 className="week-card-title">{week.label}</h3>
      <div className="week-card-top">
        <CalorieRing
          eaten={avgKcal}
          goal={dailyGoal}
          maintainGoal={maintainKcalGoal}
          size="md"
        />
        <div className="today-hero-side">
          <div className="today-meta-row">
            <div className="stat-chip compact static">
              <span>Вес</span>
              <strong className={weightTone ? `weight-delta ${weightTone}` : undefined}>
                {weightLabel}
              </strong>
            </div>
            <div className="stat-chip compact static">
              <span>Шаги</span>
              <strong>
                {week.avgSteps != null ? week.avgSteps.toLocaleString('ru-RU') : '—'}
              </strong>
            </div>
          </div>
          <p className="bju-line muted small">
            Белки {Math.round(avgProtein)} · Жиры {Math.round(avgFat)} · Углеводы{' '}
            {Math.round(avgCarbs)}
          </p>
        </div>
      </div>
      <p className={`week-note${loadingNote ? ' loading' : ''}`}>{note}</p>
    </article>
  )
}
