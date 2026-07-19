import { useEffect, useMemo, useState } from 'react'
import { TrendChart, type ChartSeries } from '../components/TrendChart'
import { formatRuDate, todayIso } from '../lib/date'
import type { AppData } from '../types'

const STEPS_GOAL = 7000

type Props = {
  data: AppData
  onBack: () => void
  onSave: (date: string, count: number) => Promise<unknown>
}

function num(v: string): number | undefined {
  const n = Number(v.replace(',', '.'))
  return Number.isFinite(n) ? n : undefined
}

export function StepsHistoryScreen({ data, onBack, onSave }: Props) {
  const date = todayIso()
  const today = data.steps.find((s) => s.date === date)
  const [count, setCount] = useState(today?.count?.toString() ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setCount(today?.count?.toString() ?? '')
  }, [today?.count])

  const history = useMemo(
    () =>
      [...data.steps].filter((s) => s.count >= 0).sort((a, b) => b.date.localeCompare(a.date)),
    [data.steps],
  )

  const series = useMemo((): ChartSeries[] => {
    const points = [...history]
      .filter((s) => s.count > 0)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((s) => ({ date: s.date, value: s.count }))
    return [{ id: 'steps', label: 'Шаги', color: '#2f7d4c', points }]
  }, [history])

  const saveToday = async () => {
    const stepsVal = num(count)
    if (stepsVal == null || stepsVal < 0) {
      setError('Укажите шаги')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onSave(date, Math.round(stepsVal))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="screen">
      <header className="screen-header">
        <button type="button" className="link-btn" onClick={onBack}>
          ← Назад
        </button>
        <h1>Шаги</h1>
      </header>

      <div className="panel">
        <h2 className="subhead" style={{ marginTop: 0 }}>
          Сегодня · {formatRuDate(date)}
        </h2>
        <div className="day-log-edit">
          <input
            className="day-log-input"
            inputMode="numeric"
            value={count}
            onChange={(e) => setCount(e.target.value)}
            placeholder="шаги"
          />
          <button
            type="button"
            className="primary-btn day-log-ok"
            disabled={busy}
            onClick={() => void saveToday()}
          >
            {busy ? '…' : 'OK'}
          </button>
        </div>
        {error && <p className="form-msg error">{error}</p>}
      </div>

      {series[0] && series[0].points.length > 0 && (
        <div className="panel chart-panel">
          <h2 className="subhead" style={{ marginTop: 0 }}>
            Динамика
          </h2>
          <TrendChart
            series={series}
            unit="шагов"
            height={120}
            variant="bar"
            goal={STEPS_GOAL}
          />
        </div>
      )}

      <div className="section-head">
        <h2>Записи</h2>
      </div>
      {history.length === 0 ? (
        <p className="muted">Пока нет записей.</p>
      ) : (
        <ul className="simple-list metric-history">
          {history.map((entry) => (
            <li key={entry.id}>
              <div>
                <strong>{formatRuDate(entry.date)}</strong>
                {entry.date === date && <span className="badge ok">сегодня</span>}
              </div>
              <strong className="metric-history-value">
                {entry.count.toLocaleString('ru-RU')}
              </strong>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
