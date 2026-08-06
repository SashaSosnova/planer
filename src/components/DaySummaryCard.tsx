import { CalorieRing } from './CalorieRing'
import type { DayStats } from '../lib/dayStats'

type Props = {
  day: DayStats
  dailyKcalGoal: number
  maintainKcalGoal: number
  onOpen?: () => void
}

export function DaySummaryCard({ day, dailyKcalGoal, maintainKcalGoal, onOpen }: Props) {
  const body = (
    <>
      <h3 className="day-summary-title">{day.label}</h3>
      <div className="day-summary-top">
        <CalorieRing
          eaten={day.totals.kcal}
          goal={dailyKcalGoal}
          maintainGoal={maintainKcalGoal}
          size="sm"
        />
        <div className="today-hero-side">
          <div className="today-meta-row">
            <div className="stat-chip compact static">
              <span>Вес</span>
              <strong>
                {day.weightKg != null ? `${String(day.weightKg).replace('.', ',')} кг` : '—'}
              </strong>
            </div>
            <div className="stat-chip compact static">
              <span>Шаги</span>
              <strong>
                {day.steps != null ? day.steps.toLocaleString('ru-RU') : '—'}
              </strong>
            </div>
          </div>
        </div>
      </div>
    </>
  )

  if (onOpen) {
    return (
      <button type="button" className="day-summary-card day-summary-card-btn" onClick={onOpen}>
        {body}
      </button>
    )
  }

  return <article className="day-summary-card">{body}</article>
}
