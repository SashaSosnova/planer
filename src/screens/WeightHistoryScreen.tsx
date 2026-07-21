import { useEffect, useMemo, useState } from 'react'
import { DateField } from '../components/DateField'
import { TrendChart, type ChartSeries } from '../components/TrendChart'
import { TrashIcon } from '../components/TrashIcon'
import { formatRuDate, todayIso } from '../lib/date'
import { forecastFromAppData } from '../lib/weightForecast'
import type { AppData } from '../types'

type Props = {
  data: AppData
  targetWeightKg: number | null
  maintainKcalGoal: number
  dailyKcalGoal: number
  cycleLengthDays: number
  periodLengthDays: number
  onBack: () => void
  onSave: (date: string, kg: number) => Promise<unknown>
  onDelete: (id: string) => Promise<unknown>
}

function num(v: string): number | undefined {
  const n = Number(v.replace(',', '.'))
  return Number.isFinite(n) ? n : undefined
}

export function WeightHistoryScreen({
  data,
  targetWeightKg,
  maintainKcalGoal,
  dailyKcalGoal,
  cycleLengthDays,
  periodLengthDays,
  onBack,
  onSave,
  onDelete,
}: Props) {
  const today = todayIso()
  const [logDate, setLogDate] = useState(today)
  const entry = data.weights.find((w) => w.date === logDate)
  const [kg, setKg] = useState(entry?.kg?.toString() ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setKg(entry?.kg?.toString() ?? '')
  }, [entry?.kg, logDate])

  const history = useMemo(
    () => [...data.weights].filter((w) => w.kg > 0).sort((a, b) => b.date.localeCompare(a.date)),
    [data.weights],
  )

  const forecast = useMemo(
    () =>
      forecastFromAppData(data, {
        targetKg: targetWeightKg,
        maintainKcal: maintainKcalGoal,
        dailyKcalGoal,
        cycleLengthDays,
        periodLengthDays,
        today,
      }),
    [
      data,
      targetWeightKg,
      maintainKcalGoal,
      dailyKcalGoal,
      cycleLengthDays,
      periodLengthDays,
      today,
    ],
  )

  const series = useMemo((): ChartSeries[] => {
    const points = [...history]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((w) => ({ date: w.date, value: w.kg }))
    return [{ id: 'weight', label: 'Вес', color: '#0f4c5c', points }]
  }, [history])

  const saveEntry = async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(logDate) || logDate > today) {
      setError('Дата не может быть в будущем')
      return
    }
    const kgVal = num(kg)
    if (kgVal == null || kgVal < 30) {
      setError('Укажите вес от 30 кг')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onSave(logDate, kgVal)
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
          Запись · {formatRuDate(logDate)}
        </h2>
        <label className="field">
          <span>Дата</span>
          <DateField
            value={logDate}
            max={today}
            onChange={(next) => setLogDate(next > today ? today : next)}
          />
        </label>
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
            onClick={() => void saveEntry()}
          >
            {busy ? '…' : 'OK'}
          </button>
        </div>
        {error && <p className="form-msg error">{error}</p>}
      </div>

      {forecast && (
        <div className="panel">
          <h2 className="subhead" style={{ marginTop: 0 }}>
            Прогноз
          </h2>
          <p className="muted small">{forecast.summary}</p>
          {forecast.notes.map((note) => (
            <p key={note} className="muted small cycle-weight-note">
              {note}
            </p>
          ))}
          {targetWeightKg == null && (
            <p className="muted small">Задайте целевой вес в профиле — появится срок до цели.</p>
          )}
        </div>
      )}

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
              <button
                type="button"
                className="link-btn metric-history-date"
                onClick={() => setLogDate(entry.date)}
              >
                {formatRuDate(entry.date)}
                {entry.date === today && <span className="badge ok">сегодня</span>}
              </button>
              <div className="metric-history-actions">
                <strong className="metric-history-value">{entry.kg} кг</strong>
                <button
                  type="button"
                  className="icon-btn sm danger"
                  aria-label={`Удалить вес за ${formatRuDate(entry.date)}`}
                  title="Удалить"
                  onClick={() => {
                    void onDelete(entry.id)
                    if (logDate === entry.date) setKg('')
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
