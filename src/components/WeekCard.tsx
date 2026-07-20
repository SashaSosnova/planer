import { useEffect, useState } from 'react'
import type { WeekStats } from '../lib/dayStats'
import {
  getCachedWeekSummary,
  getWeekNutritionSummary,
  localWeekNutritionNote,
  weekSummaryFingerprint,
} from '../lib/weekSummaryLlm'
import { CalorieRing } from './CalorieRing'

type Props = {
  week: WeekStats
  maintainKcalGoal: number
}

export function WeekCard({ week, maintainKcalGoal }: Props) {
  const fingerprint = weekSummaryFingerprint(week)
  const cached = getCachedWeekSummary(week.weekStart, fingerprint)
  const [note, setNote] = useState(() => cached ?? localWeekNutritionNote(week))
  const [loadingNote, setLoadingNote] = useState(() => !cached)

  useEffect(() => {
    const existing = getCachedWeekSummary(week.weekStart, fingerprint)
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
  }, [week, fingerprint])

  const weightLabel =
    week.weightDelta == null
      ? '—'
      : `${week.weightDelta > 0 ? '+' : ''}${String(week.weightDelta).replace('.', ',')} кг`

  const dayCount = Math.max(week.days.length, 1)
  const avgKcal = week.totals.kcal / dayCount
  const avgProtein = week.totals.protein / dayCount
  const avgFat = week.totals.fat / dayCount
  const avgCarbs = week.totals.carbs / dayCount
  const dailyGoal = week.kcalGoal / dayCount

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
              <strong>{weightLabel}</strong>
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
