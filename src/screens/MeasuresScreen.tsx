import { useMemo, useState } from 'react'
import { ChartIcon, TrendChart, type ChartSeries } from '../components/TrendChart'
import { formatRuDate, todayIso } from '../lib/date'
import {
  MEASURE_COLORS,
  MEASURE_FIELDS,
  formatMeasure,
  measureFilled,
  type MeasureKey,
} from '../lib/measures'
import type { AppData, MeasurementEntry } from '../types'

type Props = {
  data: AppData
  onSave: (input: Omit<MeasurementEntry, 'id' | 'createdAt'> & { id?: string }) => Promise<unknown>
}

function num(v: string): number | undefined {
  const n = Number(v.replace(',', '.'))
  if (!Number.isFinite(n) || n < 0) return undefined
  return n
}

/** Body measurements block — used inside Profile. */
export function MeasuresPanel({ data, onSave }: Props) {
  const date = todayIso()
  const measure = data.measurements.find((m) => m.date === date)
  const [editing, setEditing] = useState(!measureFilled(measure))
  const [showChart, setShowChart] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<Record<MeasureKey, string>>(() =>
    Object.fromEntries(
      MEASURE_FIELDS.map(({ key }) => [key, measure?.[key]?.toString() ?? '']),
    ) as Record<MeasureKey, string>,
  )

  const history = useMemo(
    () =>
      [...data.measurements]
        .filter(measureFilled)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [data.measurements],
  )

  const past = useMemo(
    () => history.filter((m) => m.date !== date),
    [history, date],
  )

  const series = useMemo((): ChartSeries[] => {
    const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date))
    return MEASURE_FIELDS.map(({ key, label }) => ({
      id: key,
      label,
      color: MEASURE_COLORS[key],
      points: sorted
        .filter((m) => m[key] != null)
        .map((m) => ({ date: m.date, value: m[key] as number })),
    })).filter((s) => s.points.length > 0)
  }, [history])

  const save = async () => {
    const payload = {
      date,
      chest: num(draft.chest),
      waist: num(draft.waist),
      belly: num(draft.belly),
      hips: num(draft.hips),
      thigh: num(draft.thigh),
      bicep: num(draft.bicep),
    }
    if (!MEASURE_FIELDS.some(({ key }) => payload[key] != null)) {
      setError('Заполните хотя бы один обмер')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onSave(payload)
      setEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="panel-stack">
      <div className="section-head">
        <h2 className="subhead" style={{ margin: 0 }}>
          Обмеры
        </h2>
        <button
          type="button"
          className={`icon-btn${showChart ? ' active' : ''}`}
          onClick={() => setShowChart((v) => !v)}
          aria-label="График обмеров"
        >
          <ChartIcon />
        </button>
      </div>
      <p className="muted small" style={{ margin: '-4px 0 0' }}>
        Раз в неделю или реже
      </p>

      {showChart && (
        <div className="panel chart-panel">
          <TrendChart series={series} unit="см" height={108} minRange={4} />
        </div>
      )}

      {!editing && measureFilled(measure) && measure ? (
        <div className="panel">
          <p className="measure-line">
            <span className="muted small">{formatMeasure(measure)}</span>
          </p>
          <button type="button" className="ghost-btn" onClick={() => setEditing(true)}>
            Изменить
          </button>
        </div>
      ) : (
        <div className="panel">
          <div className="form-grid three compact">
            {MEASURE_FIELDS.map(({ key, label }) => (
              <label key={key} className="field">
                <span>{label}</span>
                <input
                  inputMode="decimal"
                  maxLength={5}
                  value={draft[key]}
                  onChange={(e) => setDraft((prev) => ({ ...prev, [key]: e.target.value }))}
                />
              </label>
            ))}
          </div>
          <div className="btn-row">
            <button
              type="button"
              className="primary-btn"
              disabled={busy}
              onClick={() => void save()}
            >
              {busy ? '…' : 'Сохранить'}
            </button>
            {measureFilled(measure) && (
              <button type="button" className="ghost-btn" onClick={() => setEditing(false)}>
                Отмена
              </button>
            )}
          </div>
          {error && <p className="form-msg error">{error}</p>}
        </div>
      )}

      {past.length > 0 && (
        <div className="panel">
          <h2 className="subhead" style={{ marginTop: 0 }}>
            История
          </h2>
          <ul className="measure-history">
            {past.map((m) => (
              <li key={m.id}>
                <span className="measure-history-date">{formatRuDate(m.date)}</span>
                <span className="muted small">{formatMeasure(m)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
