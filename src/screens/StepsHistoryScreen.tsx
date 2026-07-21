import { useEffect, useMemo, useState } from 'react'
import { DateField } from '../components/DateField'
import { TrendChart, type ChartSeries } from '../components/TrendChart'
import { formatRuDate, todayIso } from '../lib/date'
import {
  checkHealthStepsAvailable,
  isHealthStepsSupported,
  openHealthConnectSettings,
  syncStepsFromHealth,
} from '../lib/healthSteps'
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
  const today = todayIso()
  const [logDate, setLogDate] = useState(today)
  const entry = data.steps.find((s) => s.date === logDate)
  const [count, setCount] = useState(entry?.count?.toString() ?? '')
  const [busy, setBusy] = useState(false)
  const [syncBusy, setSyncBusy] = useState(false)
  const [showSync, setShowSync] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)
  const healthSupported = isHealthStepsSupported()

  useEffect(() => {
    setCount(entry?.count?.toString() ?? '')
  }, [entry?.count, logDate])

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

  const saveEntry = async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(logDate) || logDate > today) {
      setError('Дата не может быть в будущем')
      return
    }
    const stepsVal = num(count)
    if (stepsVal == null || stepsVal < 0) {
      setError('Укажите шаги')
      return
    }
    setBusy(true)
    setError(null)
    setSyncMsg(null)
    try {
      await onSave(logDate, Math.round(stepsVal))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка')
    } finally {
      setBusy(false)
    }
  }

  const importFromWatch = async () => {
    setSyncBusy(true)
    setError(null)
    setSyncMsg(null)
    try {
      const available = await checkHealthStepsAvailable()
      if (!available.ok) {
        setError(available.reason)
        return
      }
      const result = await syncStepsFromHealth(onSave, { daysBack: 30 })
      if (result.todayCount != null) {
        setCount(String(result.todayCount))
      }
      setSyncMsg(
        result.updated > 0
          ? `Импортировано дней: ${result.updated}`
          : 'В Health Connect нет шагов за выбранный период. Проверьте синхронизацию Samsung Health → Health Connect.',
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка импорта')
    } finally {
      setSyncBusy(false)
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
        <div className="section-head" style={{ marginBottom: 4 }}>
          <h2 className="subhead" style={{ marginTop: 0 }}>
            Запись · {formatRuDate(logDate)}
          </h2>
          {healthSupported && (
            <button
              type="button"
              className="link-btn"
              onClick={() => setShowSync((v) => !v)}
              aria-expanded={showSync}
            >
              {showSync ? 'Скрыть' : 'С часов'}
            </button>
          )}
        </div>
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
            inputMode="numeric"
            value={count}
            onChange={(e) => setCount(e.target.value)}
            placeholder="шаги"
          />
          <button
            type="button"
            className="primary-btn day-log-ok"
            disabled={busy || syncBusy}
            onClick={() => void saveEntry()}
          >
            {busy ? '…' : 'OK'}
          </button>
        </div>
        {error && <p className="form-msg error">{error}</p>}
        {healthSupported && showSync && (
          <div className="steps-sync-block">
            <p className="muted small" style={{ marginTop: 0 }}>
              Galaxy Watch → Samsung Health → Health Connect → Planer. Один раз
              разрешите доступ к шагам.
            </p>
            <div className="btn-row">
              <button
                type="button"
                className="primary-btn"
                disabled={syncBusy || busy}
                onClick={() => void importFromWatch()}
              >
                {syncBusy ? 'Импорт…' : 'Импорт из Health Connect'}
              </button>
              <button
                type="button"
                className="ghost-btn"
                disabled={syncBusy}
                onClick={() => void openHealthConnectSettings()}
              >
                Настройки
              </button>
            </div>
            {syncMsg && <p className="form-msg">{syncMsg}</p>}
          </div>
        )}
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
              <button
                type="button"
                className="link-btn metric-history-date"
                onClick={() => setLogDate(entry.date)}
              >
                {formatRuDate(entry.date)}
                {entry.date === today && <span className="badge ok">сегодня</span>}
              </button>
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
