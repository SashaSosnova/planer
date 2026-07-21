import { useMemo, useState } from 'react'
import { ChartIcon, TrendChart, type ChartSeries } from '../components/TrendChart'
import { TrashIcon } from '../components/TrashIcon'
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
  onDelete: (id: string) => Promise<unknown>
}

function num(v: string): number | undefined {
  const n = Number(v.replace(',', '.'))
  if (!Number.isFinite(n) || n < 0) return undefined
  return n
}

type ScreenProps = Props & {
  onBack: () => void
}

/** Full-screen measurements — opened from «Ещё». */
export function MeasuresScreen({ data, onSave, onDelete, onBack }: ScreenProps) {
  return (
    <section className="screen">
      <header className="screen-header">
        <button type="button" className="link-btn" onClick={onBack}>
          ← Назад
        </button>
        <h1>Обмеры</h1>
        <p className="muted">Раз в неделю или реже</p>
      </header>
      <MeasuresPanel data={data} onSave={onSave} onDelete={onDelete} />
    </section>
  )
}

function emptyDraft(): Record<MeasureKey, string> {
  return Object.fromEntries(MEASURE_FIELDS.map(({ key }) => [key, ''])) as Record<
    MeasureKey,
    string
  >
}

/** Body measurements content (screen chrome is outside). */
export function MeasuresPanel({ data, onSave, onDelete }: Props) {
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

  const remove = async (id: string, isToday: boolean) => {
    setBusy(true)
    setError(null)
    try {
      await onDelete(id)
      if (isToday) {
        setDraft(emptyDraft())
        setEditing(true)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="panel-stack">
      <div className="section-head" style={{ justifyContent: 'flex-end' }}>
        <button
          type="button"
          className={`icon-btn${showChart ? ' active' : ''}`}
          onClick={() => setShowChart((v) => !v)}
          aria-label="График обмеров"
        >
          <ChartIcon />
        </button>
      </div>

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
          <div className="btn-row">
            <button type="button" className="ghost-btn" onClick={() => setEditing(true)}>
              Изменить
            </button>
            <button
              type="button"
              className="icon-btn danger"
              disabled={busy}
              onClick={() => void remove(measure.id, true)}
              aria-label="Удалить обмеры за сегодня"
              title="Удалить"
            >
              <TrashIcon size={18} />
            </button>
          </div>
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
        </div>
      )}
      {error && <p className="form-msg error">{error}</p>}

      {past.length > 0 && (
        <div className="panel">
          <h2 className="subhead" style={{ marginTop: 0 }}>
            История
          </h2>
          <ul className="measure-history">
            {past.map((m) => (
              <li key={m.id}>
                <div className="measure-history-main">
                  <span className="measure-history-date">{formatRuDate(m.date)}</span>
                  <span className="muted small">{formatMeasure(m)}</span>
                </div>
                <button
                  type="button"
                  className="icon-btn sm danger"
                  disabled={busy}
                  aria-label={`Удалить обмеры за ${formatRuDate(m.date)}`}
                  title="Удалить"
                  onClick={() => void remove(m.id, false)}
                >
                  <TrashIcon size={18} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
