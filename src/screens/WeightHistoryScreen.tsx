import { useEffect, useMemo, useState } from 'react'
import { TrendChart, type ChartSeries } from '../components/TrendChart'
import { formatRuDate, todayIso } from '../lib/date'
import type { AppData } from '../types'

type Props = {
  data: AppData
  onBack: () => void
  onSave: (date: string, kg: number) => Promise<unknown>
}

function num(v: string): number | undefined {
  const n = Number(v.replace(',', '.'))
  return Number.isFinite(n) ? n : undefined
}

export function WeightHistoryScreen({ data, onBack, onSave }: Props) {
  const date = todayIso()
  const today = data.weights.find((w) => w.date === date)
  const [kg, setKg] = useState(today?.kg?.toString() ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setKg(today?.kg?.toString() ?? '')
  }, [today?.kg])

  const history = useMemo(
    () => [...data.weights].filter((w) => w.kg > 0).sort((a, b) => b.date.localeCompare(a.date)),
    [data.weights],
  )

  const series = useMemo((): ChartSeries[] => {
    const points = [...history]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((w) => ({ date: w.date, value: w.kg }))
    return [{ id: 'weight', label: 'Вес', color: '#0f4c5c', points }]
  }, [history])

  const saveToday = async () => {
    const kgVal = num(kg)
    if (kgVal == null || kgVal < 30) {
      setError('Укажите вес от 30 кг')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onSave(date, kgVal)
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
        <h1>Вес</h1>
      </header>

      <div className="panel">
        <h2 className="subhead" style={{ marginTop: 0 }}>
          Сегодня · {formatRuDate(date)}
        </h2>
        <div className="day-log-edit">
          <input
            className="day-log-input"
            inputMode="decimal"
            value={kg}
            onChange={(e) => setKg(e.target.value)}
            placeholder="кг"
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

      {series[0] && series[0].points.length > 1 && (
        <div className="panel chart-panel">
          <h2 className="subhead" style={{ marginTop: 0 }}>
            Динамика
          </h2>
          <TrendChart series={series} unit="кг" height={120} minRange={3} />
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
              <strong className="metric-history-value">{entry.kg} кг</strong>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
