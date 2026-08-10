type Props = {
  eaten: number
  goal: number
  /**
   * Kcal from planned meals only.
   * Purple arc/number = eaten + planned (day total if plan is eaten).
   */
  planned?: number
  /** Maintain-weight kcal; yellow between goal and this, red above. */
  maintainGoal?: number
  size?: 'lg' | 'md' | 'sm'
  label?: string
}

type Zone = 'ok' | 'warn' | 'over'

export function zoneFor(eaten: number, goal: number, maintainGoal?: number): Zone {
  const safeGoal = goal > 0 ? goal : 1
  const redAt = maintainGoal != null && maintainGoal > safeGoal ? maintainGoal : safeGoal
  if (eaten > redAt) return 'over'
  if (eaten > safeGoal) return 'warn'
  return 'ok'
}

export function CalorieRing({
  eaten,
  goal,
  planned = 0,
  maintainGoal,
  size = 'lg',
  label,
}: Props) {
  const safeGoal = goal > 0 ? goal : 1
  const withPlan = eaten + Math.max(planned, 0)
  const ratio = eaten / safeGoal
  const withPlanRatio = withPlan / safeGoal
  const zone = zoneFor(eaten, safeGoal, maintainGoal)
  const pct = Math.round(ratio * 100)
  const showPlanned = planned > 0

  const dim = size === 'lg' ? 128 : size === 'md' ? 112 : 64
  const stroke = size === 'lg' ? 10 : size === 'md' ? 9 : 6
  const r = (dim - stroke) / 2
  const c = 2 * Math.PI * r
  const eatenProgress = Math.min(Math.max(ratio, 0), 1)
  const withPlanProgress = Math.min(Math.max(withPlanRatio, 0), 1)
  const eatenDash = c * eatenProgress
  const eatenGap = c - eatenDash
  const plannedDash = c * withPlanProgress
  const plannedGap = c - plannedDash

  return (
    <div className={`calorie-ring size-${size} zone-${zone}`}>
      <svg width={dim} height={dim} viewBox={`0 0 ${dim} ${dim}`} aria-hidden>
        <circle
          className="calorie-ring-track"
          cx={dim / 2}
          cy={dim / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
        />
        {showPlanned && (
          <circle
            className="calorie-ring-planned"
            cx={dim / 2}
            cy={dim / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            strokeDasharray={`${plannedDash} ${plannedGap}`}
            strokeLinecap="round"
            transform={`rotate(-90 ${dim / 2} ${dim / 2})`}
          />
        )}
        <circle
          className="calorie-ring-progress"
          cx={dim / 2}
          cy={dim / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeDasharray={`${eatenDash} ${eatenGap}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${dim / 2} ${dim / 2})`}
        />
      </svg>
      <div className="calorie-ring-center">
        {label && <span className="calorie-ring-label">{label}</span>}
        <strong className="calorie-ring-eaten">{Math.round(eaten)}</strong>
        {showPlanned && size !== 'sm' && (
          <span className="calorie-ring-planned-kcal">{Math.round(withPlan)}</span>
        )}
        <span className="calorie-ring-goal">из {Math.round(safeGoal)}</span>
        {size !== 'sm' && <span className="calorie-ring-pct">{pct}%</span>}
      </div>
    </div>
  )
}
