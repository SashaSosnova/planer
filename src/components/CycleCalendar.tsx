import { useMemo } from 'react'
import { menstrualDateSet } from '../lib/cycle'
import { toIsoDate } from '../lib/date'
import type { PeriodStart } from '../types'

const WEEKDAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'] as const

const MONTH_TITLE = new Intl.DateTimeFormat('ru-RU', {
  month: 'long',
  year: 'numeric',
})

type Props = {
  /** First day of the visible month (local date). */
  month: Date
  periodStarts: PeriodStart[]
  periodLengthDays: number
  today: string
  minDate: string
  maxDate: string
  busy?: boolean
  onMonthChange: (month: Date) => void
  /** Toggle: add start on empty day, remove if day is already a start. */
  onToggleDate: (iso: string) => void
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function shiftMonth(d: Date, delta: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + delta, 1)
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function CycleCalendar({
  month,
  periodStarts,
  periodLengthDays,
  today,
  minDate,
  maxDate,
  busy,
  onMonthChange,
  onToggleDate,
}: Props) {
  const view = startOfMonth(month)
  const startIds = useMemo(() => {
    const map = new Map<string, string>()
    for (const s of periodStarts) map.set(s.date, s.id)
    return map
  }, [periodStarts])
  const menstrual = useMemo(
    () => menstrualDateSet(periodStarts, periodLengthDays),
    [periodStarts, periodLengthDays],
  )

  const minMonth = startOfMonth(
    (() => {
      const [y, m] = minDate.split('-').map(Number)
      return new Date(y!, (m ?? 1) - 1, 1)
    })(),
  )
  const maxMonth = startOfMonth(
    (() => {
      const [y, m] = maxDate.split('-').map(Number)
      return new Date(y!, (m ?? 1) - 1, 1)
    })(),
  )
  const canPrev = monthKey(view) > monthKey(minMonth)
  const canNext = monthKey(view) < monthKey(maxMonth)

  const cells = useMemo(() => {
    const year = view.getFullYear()
    const mon = view.getMonth()
    const daysInMonth = new Date(year, mon + 1, 0).getDate()
    // Monday-first: Sun=0 → 6, Mon=1 → 0, …
    const firstWeekday = (new Date(year, mon, 1).getDay() + 6) % 7
    const out: Array<{ iso: string | null; day: number | null }> = []
    for (let i = 0; i < firstWeekday; i++) out.push({ iso: null, day: null })
    for (let day = 1; day <= daysInMonth; day++) {
      out.push({ iso: toIsoDate(new Date(year, mon, day)), day })
    }
    while (out.length % 7 !== 0) out.push({ iso: null, day: null })
    return out
  }, [view])

  const title = MONTH_TITLE.format(view)
  const titleCased = title.charAt(0).toUpperCase() + title.slice(1)

  return (
    <div className="cycle-cal">
      <div className="cycle-cal-nav">
        <button
          type="button"
          className="ghost-btn cycle-cal-nav-btn"
          disabled={!canPrev || busy}
          aria-label="Предыдущий месяц"
          onClick={() => onMonthChange(shiftMonth(view, -1))}
        >
          ‹
        </button>
        <strong className="cycle-cal-title">{titleCased}</strong>
        <button
          type="button"
          className="ghost-btn cycle-cal-nav-btn"
          disabled={!canNext || busy}
          aria-label="Следующий месяц"
          onClick={() => onMonthChange(shiftMonth(view, 1))}
        >
          ›
        </button>
      </div>

      <div className="cycle-cal-weekdays" aria-hidden>
        {WEEKDAYS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>

      <div className="cycle-cal-grid">
        {cells.map((cell, idx) => {
          if (!cell.iso || cell.day == null) {
            return <span key={`e-${idx}`} className="cycle-cal-cell empty" />
          }
          const iso = cell.iso
          const isStart = startIds.has(iso)
          const isPeriod = menstrual.has(iso)
          const isToday = iso === today
          const disabled = busy || iso < minDate || iso > maxDate
          const className = [
            'cycle-cal-cell',
            isPeriod ? 'period' : '',
            isStart ? 'period-start' : '',
            isToday ? 'today' : '',
            disabled ? 'disabled' : '',
          ]
            .filter(Boolean)
            .join(' ')

          return (
            <button
              key={iso}
              type="button"
              className={className}
              disabled={disabled}
              aria-label={
                isStart
                  ? `${cell.day}, начало месячных — нажмите чтобы снять`
                  : `${cell.day}, отметить начало месячных`
              }
              onClick={() => onToggleDate(iso)}
            >
              {cell.day}
            </button>
          )
        })}
      </div>
    </div>
  )
}
