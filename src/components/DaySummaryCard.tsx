import { CalorieRing } from './CalorieRing'
import { dayBrief } from '../lib/dayBrief'
import type { DayStats } from '../lib/dayStats'

type Props = {
  day: DayStats
  dailyKcalGoal: number
  maintainKcalGoal: number
}

export function DaySummaryCard({ day, dailyKcalGoal, maintainKcalGoal }: Props) {
  const brief = dayBrief(day, dailyKcalGoal)
  const note = day.noteText

  return (
    <article className="day-summary-card">
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
          <p className="bju-line muted small">
            Белки {Math.round(day.totals.protein)} · Жиры {Math.round(day.totals.fat)} · Углеводы{' '}
            {Math.round(day.totals.carbs)}
          </p>
        </div>
      </div>
      {brief && <p className="muted small">{brief}</p>}
      {note && <p className="day-summary-note">{note}</p>}
    </article>
  )
}
