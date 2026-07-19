type Props = {
  eaten: number
  goal: number
  size?: 'lg' | 'md' | 'sm'
  approximate?: boolean
  label?: string
}

type Zone = 'ok' | 'warn' | 'over'

function zoneFor(ratio: number): Zone {
  if (ratio > 1) return 'over'
  if (ratio >= 0.85) return 'warn'
  return 'ok'
}

export function CalorieRing({ eaten, goal, size = 'lg', approximate, label }: Props) {
  const safeGoal = goal > 0 ? goal : 1
  const ratio = eaten / safeGoal
  const zone = zoneFor(ratio)
  const pct = Math.round(ratio * 100)

  const dim = size === 'lg' ? 128 : size === 'md' ? 96 : 64
  const stroke = size === 'lg' ? 10 : size === 'md' ? 8 : 6
  const r = (dim - stroke) / 2
  const c = 2 * Math.PI * r
  const progress = Math.min(Math.max(ratio, 0), 1)
  const dash = c * progress
  const gap = c - dash

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
        <circle
          className="calorie-ring-progress"
          cx={dim / 2}
          cy={dim / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeDasharray={`${dash} ${gap}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${dim / 2} ${dim / 2})`}
        />
      </svg>
      <div className="calorie-ring-center">
        {label && <span className="calorie-ring-label">{label}</span>}
        <strong>
          {Math.round(eaten)}
          {approximate ? ' ≈' : ''}
        </strong>
        <span className="calorie-ring-goal">из {Math.round(safeGoal)}</span>
        {size !== 'sm' && <span className="calorie-ring-pct">{pct}%</span>}
      </div>
    </div>
  )
}
