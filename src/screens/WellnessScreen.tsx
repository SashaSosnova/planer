import { useMemo, useState } from 'react'
import { PromptDialog } from '../components/PromptDialog'
import { cyclePhaseLabel, getCycleInfo, latestPeriodStart } from '../lib/cycle'
import { addDaysIso, formatRuDate, todayIso } from '../lib/date'
import {
  checkHealthSleepAvailable,
  isHealthSleepSupported,
  syncSleepFromHealth,
} from '../lib/healthSleep'
import { openHealthConnectSettings } from '../lib/healthSteps'
import { MOOD_OPTIONS } from '../lib/mood'
import type { AppData, MoodLevel } from '../types'

type PromptKind = 'sleep' | 'period' | null

type Props = {
  data: AppData
  cycleLengthDays: number
  periodLengthDays: number
  onBack: () => void
  onSaveCheckIn: (input: {
    date: string
    mood?: MoodLevel | null
    sleepHours?: number | null
  }) => Promise<unknown>
  onSavePeriodStart: (date: string) => Promise<unknown>
  onRemovePeriodStart: (id: string) => Promise<unknown>
}

function num(v: string): number | undefined {
  const n = Number(v.replace(',', '.'))
  return Number.isFinite(n) ? n : undefined
}

export function WellnessScreen({
  data,
  cycleLengthDays,
  periodLengthDays,
  onBack,
  onSaveCheckIn,
  onSavePeriodStart,
  onRemovePeriodStart,
}: Props) {
  const date = todayIso()
  const checkIn = data.checkIns.find((c) => c.date === date)
  const lastPeriod = latestPeriodStart(data.periodStarts)
  const healthSleep = isHealthSleepSupported()

  const [prompt, setPrompt] = useState<PromptKind>(null)
  const [busy, setBusy] = useState(false)
  const [promptError, setPromptError] = useState<string | null>(null)
  const [periodBusy, setPeriodBusy] = useState(false)
  const [sleepSyncBusy, setSleepSyncBusy] = useState(false)
  const [sleepSyncMsg, setSleepSyncMsg] = useState<string | null>(null)

  const cycle = useMemo(
    () => getCycleInfo(data.periodStarts, date, cycleLengthDays, periodLengthDays),
    [data.periodStarts, date, cycleLengthDays, periodLengthDays],
  )

  const setMood = async (mood: MoodLevel) => {
    const next = checkIn?.mood === mood ? null : mood
    try {
      await onSaveCheckIn({ date, mood: next })
    } catch {
      /* ignore */
    }
  }

  const removeLastPeriod = async () => {
    if (!lastPeriod) return
    setPeriodBusy(true)
    try {
      await onRemovePeriodStart(lastPeriod.id)
    } finally {
      setPeriodBusy(false)
    }
  }

  const importSleepFromWatch = async () => {
    setSleepSyncBusy(true)
    setSleepSyncMsg(null)
    try {
      const available = await checkHealthSleepAvailable()
      if (!available.ok) {
        setSleepSyncMsg(available.reason)
        return
      }
      const result = await syncSleepFromHealth(
        async (d, hours) => {
          await onSaveCheckIn({ date: d, sleepHours: hours })
        },
        { daysBack: 14 },
      )
      setSleepSyncMsg(
        result.updated > 0
          ? `Сон импортирован: ${result.updated} дн.${
              result.todayHours != null
                ? ` · сегодня ${String(result.todayHours).replace('.', ',')} ч`
                : ''
            }`
          : 'В Health Connect нет сна за период. Проверьте Samsung Health → Health Connect (сон).',
      )
    } catch (err) {
      setSleepSyncMsg(err instanceof Error ? err.message : 'Ошибка импорта сна')
    } finally {
      setSleepSyncBusy(false)
    }
  }

  const confirmPrompt = async (raw: string) => {
    if (prompt === 'sleep') {
      const hours = num(raw)
      if (hours == null || hours < 0 || hours > 16) {
        setPromptError('Укажите часы сна от 0 до 16')
        return
      }
      setBusy(true)
      setPromptError(null)
      try {
        await onSaveCheckIn({ date, sleepHours: hours })
        setPrompt(null)
      } catch (err) {
        setPromptError(err instanceof Error ? err.message : 'Ошибка')
      } finally {
        setBusy(false)
      }
      return
    }

    if (prompt === 'period') {
      const startDate = raw.trim()
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
        setPromptError('Выберите дату')
        return
      }
      if (startDate > date) {
        setPromptError('Дата не может быть в будущем')
        return
      }
      if (startDate < addDaysIso(date, -120)) {
        setPromptError('Укажите дату за последние 4 месяца')
        return
      }
      setBusy(true)
      setPromptError(null)
      try {
        const prev = latestPeriodStart(data.periodStarts)
        if (prev && prev.date !== startDate) {
          await onRemovePeriodStart(prev.id)
        }
        await onSavePeriodStart(startDate)
        setPrompt(null)
      } catch (err) {
        setPromptError(err instanceof Error ? err.message : 'Ошибка')
      } finally {
        setBusy(false)
      }
    }
  }

  return (
    <section className="screen">
      <header className="screen-header">
        <button type="button" className="link-btn" onClick={onBack}>
          ← Назад
        </button>
        <h1>Самочувствие</h1>
        <p className="muted">Настроение, сон и цикл · {formatRuDate(date)}</p>
      </header>

      <div className="panel">
        <h2 className="subhead" style={{ marginTop: 0 }}>
          Настроение
        </h2>
        <div className="mood-row" role="group" aria-label="Настроение">
          {MOOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`mood-chip${checkIn?.mood === opt.value ? ' active' : ''}`}
              onClick={() => void setMood(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="panel">
        <h2 className="subhead" style={{ marginTop: 0 }}>
          Сон
        </h2>
        <p className="muted small">Сколько спали прошлой ночью</p>
        <button
          type="button"
          className="stat-chip"
          onClick={() => {
            setPromptError(null)
            setPrompt('sleep')
          }}
        >
          <span>Часы сна</span>
          <strong>
            {checkIn?.sleepHours != null
              ? `${String(checkIn.sleepHours).replace('.', ',')} ч`
              : '—'}
          </strong>
        </button>
        {healthSleep && (
          <div className="btn-row tight">
            <button
              type="button"
              className="ghost-btn"
              disabled={sleepSyncBusy}
              onClick={() => void importSleepFromWatch()}
            >
              {sleepSyncBusy ? 'Импорт…' : 'Сон с часов'}
            </button>
            <button
              type="button"
              className="link-btn"
              disabled={sleepSyncBusy}
              onClick={() => void openHealthConnectSettings()}
            >
              Health Connect
            </button>
          </div>
        )}
        {sleepSyncMsg && <p className="muted small">{sleepSyncMsg}</p>}
      </div>

      <div className="panel">
        <h2 className="subhead" style={{ marginTop: 0 }}>
          Цикл
        </h2>
        <p className="muted small">
          Помогает понять скачки веса. Длину цикла можно задать в профиле.
        </p>
        <div className="stat-chip static">
          <span>Сейчас</span>
          <strong>
            {cycle.phase === 'unknown'
              ? 'не задан'
              : `${cyclePhaseLabel(cycle.phase)}${
                  cycle.dayInCycle != null ? ` · день ${cycle.dayInCycle}` : ''
                }`}
          </strong>
        </div>
        {cycle.weightNote && <p className="muted small cycle-weight-note">{cycle.weightNote}</p>}
        <div className="btn-row tight">
          <button
            type="button"
            className="primary-btn"
            disabled={periodBusy || busy}
            onClick={() => {
              setPromptError(null)
              setPrompt('period')
            }}
          >
            {lastPeriod ? 'Изменить дату начала' : 'Указать начало месячных'}
          </button>
          {lastPeriod && (
            <button
              type="button"
              className="ghost-btn"
              disabled={periodBusy || busy}
              onClick={() => void removeLastPeriod()}
            >
              Сбросить
            </button>
          )}
        </div>
        {lastPeriod && (
          <p className="muted small">
            Последние начались {formatRuDate(lastPeriod.date)}
            {cycle.daysUntilPeriod != null && cycle.daysUntilPeriod > 0
              ? ` · до следующих ≈ ${cycle.daysUntilPeriod} дн.`
              : ''}
          </p>
        )}
      </div>

      {prompt === 'sleep' && (
        <PromptDialog
          title="Сон прошлой ночью"
          label="Сколько часов?"
          placeholder="например 7.5"
          inputMode="decimal"
          initialValue={checkIn?.sleepHours?.toString() ?? ''}
          busy={busy}
          error={promptError}
          onCancel={() => setPrompt(null)}
          onConfirm={(v) => void confirmPrompt(v)}
        />
      )}

      {prompt === 'period' && (
        <PromptDialog
          title="Начало месячных"
          label="Когда начались последние?"
          type="date"
          min={addDaysIso(date, -120)}
          max={date}
          initialValue={lastPeriod?.date ?? date}
          hint="Можно указать прошедшую дату — цикл посчитается сразу."
          busy={busy}
          error={promptError}
          onCancel={() => setPrompt(null)}
          onConfirm={(v) => void confirmPrompt(v)}
        />
      )}
    </section>
  )
}
