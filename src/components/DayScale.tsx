type Zone = 'low' | 'ok' | 'warn' | 'over'

type Props = {
  label: string
  current: number
  goal: number
  unit: string
  /** `toward` = more is better (protein, veg); `budget` = stay under (sweets) */
  mode?: 'toward' | 'budget'
}

export function scaleZone(
  current: number,
  goal: number,
  mode: 'toward' | 'budget',
): Zone {
  const g = goal > 0 ? goal : 1
  if (mode === 'budget') {
    if (current > g * 1.15) return 'over'
    if (current > g) return 'warn'
    return 'ok'
  }
  if (current >= g) return 'ok'
  if (current >= g * 0.7) return 'low'
  return 'low'
}

export function DayScale({
  label,
  current,
  goal,
  unit,
  mode = 'toward',
}: Props) {
  const safeGoal = goal > 0 ? goal : 1
  const zone = scaleZone(current, safeGoal, mode)
  const pct = Math.min(100, Math.round((current / safeGoal) * 100))
  const cur = Math.round(current)
  const g = Math.round(safeGoal)

  return (
    <div className={`day-scale zone-${zone} mode-${mode}`}>
      <div className="day-scale-row">
        <span className="day-scale-label">{label}</span>
        <strong className="day-scale-value">
          {cur} / {g} {unit}
        </strong>
      </div>
      <div
        className="day-scale-track"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={g}
        aria-valuenow={cur}
      >
        <div className="day-scale-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
