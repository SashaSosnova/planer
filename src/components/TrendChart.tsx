export type ChartPoint = {
  date: string
  value: number
}

export type ChartSeries = {
  id: string
  label: string
  color: string
  points: ChartPoint[]
}

type Props = {
  series: ChartSeries[]
  unit?: string
  height?: number
  /** Minimum Y-axis span — keeps slow weight trends from looking dramatic */
  minRange?: number
  /** `bar` — daily columns (used for steps) */
  variant?: 'line' | 'bar'
  /** Horizontal goal/norm line; bars below = yellow, at/above = green */
  goal?: number
}

const BAR_BELOW = '#d4a017'
const BAR_ABOVE = '#2f7d4c'
const GOAL_COLOR = '#2b6cb0'

function shortDate(iso: string): string {
  const [, m, d] = iso.split('-')
  if (!m || !d) return iso
  return `${Number(d)}.${m}`
}

function formatAxis(v: number, unit: string): string {
  if (unit === 'шагов') {
    if (v >= 1000) return `${Math.round(v / 100) / 10}k`.replace('.0k', 'k')
    return String(Math.round(v))
  }
  return String(Math.round(v * 10) / 10)
}

export function TrendChart({
  series,
  unit = '',
  height = 110,
  minRange,
  variant = 'line',
  goal,
}: Props) {
  const allPoints = series.flatMap((s) => s.points)
  if (allPoints.length === 0) {
    return <p className="muted small">Пока мало данных для графика.</p>
  }

  const dates = [...new Set(allPoints.map((p) => p.date))].sort()
  const values = allPoints.map((p) => p.value)
  const isBar = variant === 'bar'

  let minV = isBar ? 0 : Math.min(...values)
  let maxV = Math.max(...values, goal ?? -Infinity)
  if (!Number.isFinite(maxV)) maxV = Math.max(...values)

  const span = maxV - minV
  const needed = minRange ?? (unit === 'кг' ? 3 : unit === 'см' ? 4 : 0)
  if (!isBar && needed > 0 && span < needed) {
    const mid = (minV + maxV) / 2
    minV = mid - needed / 2
    maxV = mid + needed / 2
  }
  const pad = span === 0 && needed === 0 ? Math.max(1, Math.abs(minV) * 0.05 || 1) : (maxV - minV) * 0.08
  const y0 = isBar ? 0 : minV - pad
  const y1 = maxV + pad

  const W = 360
  const H = height
  const padL = isBar ? 28 : 22
  const padR = 2
  const padT = 4
  const padB = 16
  const plotW = W - padL - padR
  const plotH = H - padT - padB

  const xAt = (i: number, n: number) =>
    padL + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW)
  const yAt = (v: number) => padT + plotH - ((v - y0) / (y1 - y0 || 1)) * plotH

  const gridYs = isBar && goal != null ? [0, goal, y1] : [y0, (y0 + y1) / 2, y1]
  const barSlot = plotW / Math.max(dates.length, 1)
  const barW = Math.max(2, Math.min(14, barSlot * 0.62))

  const primary = series[0]
  const barPoints = primary
    ? [...primary.points].sort((a, b) => a.date.localeCompare(b.date))
    : []

  return (
    <div className="trend-chart">
      <svg viewBox={`0 0 ${W} ${H}`} className="trend-chart-svg" role="img">
        {gridYs.map((v, idx) => (
          <g key={`${v}-${idx}`}>
            <line
              x1={padL}
              x2={W - padR}
              y1={yAt(v)}
              y2={yAt(v)}
              className="trend-grid"
            />
            <text x={padL - 4} y={yAt(v) + 3} className="trend-axis" textAnchor="end">
              {formatAxis(v, unit)}
            </text>
          </g>
        ))}

        {isBar && goal != null && (
          <line
            x1={padL}
            x2={W - padR}
            y1={yAt(goal)}
            y2={yAt(goal)}
            stroke={GOAL_COLOR}
            strokeWidth="1.6"
            strokeDasharray="4 3"
          />
        )}

        {isBar
          ? barPoints.map((p) => {
              const di = dates.indexOf(p.date)
              const cx = xAt(di >= 0 ? di : 0, dates.length)
              const y = yAt(p.value)
              const yBase = yAt(0)
              const h = Math.max(1, yBase - y)
              const fill = p.value >= (goal ?? 0) ? BAR_ABOVE : BAR_BELOW
              return (
                <rect
                  key={p.date}
                  x={cx - barW / 2}
                  y={y}
                  width={barW}
                  height={h}
                  rx="1.5"
                  fill={fill}
                />
              )
            })
          : series.map((s) => {
              const sorted = [...s.points].sort((a, b) => a.date.localeCompare(b.date))
              if (sorted.length === 0) return null
              const path = sorted
                .map((p, i) => {
                  const di = dates.indexOf(p.date)
                  const x = xAt(di >= 0 ? di : i, dates.length)
                  const y = yAt(p.value)
                  return `${i === 0 ? 'M' : 'L'}${x},${y}`
                })
                .join(' ')
              return (
                <g key={s.id}>
                  <path
                    d={path}
                    fill="none"
                    stroke={s.color}
                    strokeWidth="1.8"
                    strokeLinejoin="round"
                  />
                  {sorted.map((p) => {
                    const di = dates.indexOf(p.date)
                    const x = xAt(di >= 0 ? di : 0, dates.length)
                    const y = yAt(p.value)
                    return <circle key={`${s.id}-${p.date}`} cx={x} cy={y} r="2.2" fill={s.color} />
                  })}
                </g>
              )
            })}

        {dates.map((d, i) => {
          const show =
            dates.length <= 5 ||
            i === 0 ||
            i === dates.length - 1 ||
            i % Math.ceil(dates.length / 4) === 0
          if (!show) return null
          return (
            <text
              key={d}
              x={xAt(i, dates.length)}
              y={H - 4}
              className="trend-axis"
              textAnchor="middle"
            >
              {shortDate(d)}
            </text>
          )
        })}
      </svg>

      {!isBar && series.length > 1 && (
        <ul className="trend-legend">
          {series.map((s) => (
            <li key={s.id}>
              <span className="trend-dot" style={{ background: s.color }} />
              {s.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function ChartIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      style={{ width: size, height: size, display: 'block', flexShrink: 0 }}
    >
      <path
        d="M4 19V5M4 19h16"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M7 14l3.5-4 3 2.5L18 7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
