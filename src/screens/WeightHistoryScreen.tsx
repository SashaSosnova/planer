import { useEffect, useMemo, useRef, useState } from 'react'
import { TrendChart, type ChartSeries } from '../components/TrendChart'
import { TrashIcon } from '../components/TrashIcon'
import { addDaysIso, formatRuDate, todayIso } from '../lib/date'
import { formatKg } from '../lib/nutrition'
import type { AppData, WeightEntry } from '../types'

type Props = {
  data: AppData
  onBack: () => void
  onSave: (date: string, kg: number) => Promise<unknown>
  onDelete: (id: string) => Promise<unknown>
}

/** Chart window in days (including today). `null` = all history. */
type ChartRangeDays = 7 | 30 | 90 | null

const CHART_RANGES: { days: ChartRangeDays; label: string }[] = [
  { days: 7, label: '7 дн' },
  { days: 30, label: '30 дн' },
  { days: 90, label: '90 дн' },
  { days: null, label: 'Всё' },
]

function num(v: string): number | undefined {
  const n = Number(v.replace(',', '.'))
  return Number.isFinite(n) ? n : undefined
}

export function WeightHistoryScreen({ data, onBack, onSave, onDelete }: Props) {
  const today = todayIso()
  const [chartRange, setChartRange] = useState<ChartRangeDays>(7)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draftKg, setDraftKg] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!editingId) return
    const el = inputRef.current
    if (!el) return
    el.focus()
    el.select()
  }, [editingId])

  const history = useMemo(
    () => [...data.weights].filter((w) => w.kg > 0).sort((a, b) => b.date.localeCompare(a.date)),
    [data.weights],
  )

  const series = useMemo((): ChartSeries[] => {
    const from = chartRange == null ? null : addDaysIso(today, -(chartRange - 1))
    const points = [...history]
      .filter((w) => from == null || w.date >= from)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((w) => ({ date: w.date, value: w.kg }))
    return [{ id: 'weight', label: 'Вес', color: '#7d5f9c', points }]
  }, [history, chartRange, today])

  const startEdit = (entry: WeightEntry) => {
    setEditingId(entry.id)
    setDraftKg(String(entry.kg).replace('.', ','))
    setError(null)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setDraftKg('')
    setError(null)
  }

  const commitEdit = async (entry: WeightEntry) => {
    const kgVal = num(draftKg)
    if (kgVal == null || kgVal < 30 || kgVal > 400) {
      setError('Укажите вес от 30 до 400 кг')
      return
    }
    if (kgVal === entry.kg) {
      cancelEdit()
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onSave(entry.date, kgVal)
      cancelEdit()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка')
    } finally {
      setBusy(false)
    }
  }

  const chartPoints = series[0]?.points.length ?? 0

  return (
    <section className="screen">
      <header className="screen-header">
        <button type="button" className="link-btn" onClick={onBack}>
          ← Назад
        </button>
        <h1>Вес</h1>
      </header>

      {history.length > 0 && (
        <div className="panel chart-panel">
          <h2 className="subhead" style={{ marginTop: 0 }}>
            Динамика
          </h2>
          <div className="place-chip-row chart-range-row" role="group" aria-label="Период графика">
            {CHART_RANGES.map(({ days, label }) => (
              <button
                key={label}
                type="button"
                className={`place-chip sm${chartRange === days ? ' active' : ''}`}
                aria-pressed={chartRange === days}
                onClick={() => setChartRange(days)}
              >
                {label}
              </button>
            ))}
          </div>
          {chartPoints > 1 ? (
            <TrendChart
              series={series}
              unit="кг"
              height={120}
              minRange={chartRange != null && chartRange <= 7 ? 1.5 : 3}
            />
          ) : (
            <p className="muted small">
              {chartPoints === 1
                ? 'За этот период одна точка — выберите больший диапазон.'
                : 'За этот период нет записей веса.'}
            </p>
          )}
        </div>
      )}

      <div className="section-head">
        <h2>Записи</h2>
      </div>
      {error && <p className="form-msg error">{error}</p>}
      {history.length === 0 ? (
        <p className="muted">Пока нет записей. Добавьте вес на экране «Сегодня».</p>
      ) : (
        <ul className="simple-list metric-history">
          {history.map((entry) => (
            <li key={entry.id}>
              <span className="metric-history-date">
                {formatRuDate(entry.date)}
                {entry.date === today && <span className="badge ok">сегодня</span>}
              </span>
              <div className="metric-history-actions">
                {editingId === entry.id ? (
                  <span className="metric-history-edit">
                    <input
                      ref={inputRef}
                      className="metric-history-input"
                      inputMode="decimal"
                      value={draftKg}
                      disabled={busy}
                      aria-label={`Вес за ${formatRuDate(entry.date)}`}
                      onChange={(e) => setDraftKg(e.target.value)}
                      onBlur={() => {
                        if (!busy) void commitEdit(entry)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          void commitEdit(entry)
                        } else if (e.key === 'Escape') {
                          e.preventDefault()
                          cancelEdit()
                        }
                      }}
                    />
                    <span className="metric-history-unit">кг</span>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="metric-history-value-btn"
                    onClick={() => startEdit(entry)}
                    aria-label={`Изменить вес за ${formatRuDate(entry.date)}`}
                  >
                    <strong className="metric-history-value">{formatKg(entry.kg)} кг</strong>
                  </button>
                )}
                <button
                  type="button"
                  className="icon-btn sm danger"
                  aria-label={`Удалить вес за ${formatRuDate(entry.date)}`}
                  title="Удалить"
                  disabled={busy}
                  onClick={() => {
                    if (editingId === entry.id) cancelEdit()
                    void onDelete(entry.id)
                  }}
                >
                  <TrashIcon size={18} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
