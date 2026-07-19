import { useMemo, useState } from 'react'
import { PromptDialog } from '../components/PromptDialog'
import {
  ACTIVITY_LABELS,
  GOAL_MODE_LABELS,
  calcDailyKcalGoal,
  type ActivityLevel,
  type BodyProfile,
  type GoalMode,
  type Sex,
} from '../lib/calorieGoal'
import {
  DEFAULT_CYCLE_LENGTH,
  DEFAULT_PERIOD_LENGTH,
  cyclePhaseLabel,
  getCycleInfo,
  latestPeriodStart,
} from '../lib/cycle'
import { addDaysIso, formatRuDate, todayIso } from '../lib/date'
import { calcProteinGoal, VEG_GOAL_G } from '../lib/macroGoals'
import { loadSettings } from '../lib/settings'
import type { AppData, MeasurementEntry } from '../types'
import { MeasuresPanel } from './MeasuresScreen'

const SEX_LABELS: Record<Sex, string> = {
  female: 'Женский',
  male: 'Мужской',
}

type Props = {
  data: AppData
  onBack: () => void
  onSaveProfile: (profile: BodyProfile, weightKg: number) => { dailyKcalGoal: number }
  onSaveTargets: (input: {
    targetWeightKg?: number | null
    cycleLengthDays?: number
    periodLengthDays?: number
  }) => unknown
  onSaveMeasurement: (
    input: Omit<MeasurementEntry, 'id' | 'createdAt'> & { id?: string },
  ) => Promise<unknown>
  onSavePeriodStart: (date: string) => Promise<unknown>
  onRemovePeriodStart: (id: string) => Promise<unknown>
}

function latestWeight(data: AppData): number | undefined {
  const sorted = [...data.weights].sort((a, b) => b.date.localeCompare(a.date))
  return sorted[0]?.kg
}

export function ProfileScreen({
  data,
  onBack,
  onSaveProfile,
  onSaveTargets,
  onSaveMeasurement,
  onSavePeriodStart,
  onRemovePeriodStart,
}: Props) {
  const saved = loadSettings()
  const savedProfile = saved.profile
  const weightKg = latestWeight(data)
  const today = todayIso()
  const lastPeriod = latestPeriodStart(data.periodStarts)

  const [editing, setEditing] = useState(!savedProfile)
  const [sex, setSex] = useState<Sex>(savedProfile?.sex ?? 'female')
  const [age, setAge] = useState(savedProfile?.age?.toString() ?? '')
  const [heightCm, setHeightCm] = useState(savedProfile?.heightCm?.toString() ?? '')
  const [activity, setActivity] = useState<ActivityLevel>(savedProfile?.activity ?? 'light')
  const [goalMode, setGoalMode] = useState<GoalMode>(savedProfile?.goalMode ?? 'mild')
  const [error, setError] = useState<string | null>(null)

  const [targetKg, setTargetKg] = useState(
    saved.targetWeightKg != null ? String(saved.targetWeightKg) : '',
  )
  const [savedTargetKg, setSavedTargetKg] = useState<number | null>(saved.targetWeightKg)
  const [editingTarget, setEditingTarget] = useState(saved.targetWeightKg == null)
  const [targetError, setTargetError] = useState<string | null>(null)

  const [cycleLen, setCycleLen] = useState(String(saved.cycleLengthDays || DEFAULT_CYCLE_LENGTH))
  const [periodLen, setPeriodLen] = useState(
    String(saved.periodLengthDays || DEFAULT_PERIOD_LENGTH),
  )
  const [savedCycleLen, setSavedCycleLen] = useState(
    saved.cycleLengthDays || DEFAULT_CYCLE_LENGTH,
  )
  const [savedPeriodLen, setSavedPeriodLen] = useState(
    saved.periodLengthDays || DEFAULT_PERIOD_LENGTH,
  )
  const [cycleConfigured, setCycleConfigured] = useState(Boolean(saved.cycleConfigured))
  const [editingCycle, setEditingCycle] = useState(!saved.cycleConfigured)
  const [cycleError, setCycleError] = useState<string | null>(null)
  const [periodPromptOpen, setPeriodPromptOpen] = useState(false)
  const [periodBusy, setPeriodBusy] = useState(false)
  const [periodError, setPeriodError] = useState<string | null>(null)

  const cycle = useMemo(
    () => getCycleInfo(data.periodStarts, today, savedCycleLen, savedPeriodLen),
    [data.periodStarts, today, savedCycleLen, savedPeriodLen],
  )

  const previewGoal = useMemo(() => {
    const ageN = Number(age.replace(',', '.'))
    const h = Number(heightCm.replace(',', '.'))
    if (!Number.isFinite(ageN) || !Number.isFinite(h) || weightKg == null) return null
    return calcDailyKcalGoal(
      {
        sex,
        age: Math.round(ageN),
        heightCm: Math.round(h),
        activity,
        goalMode,
      },
      weightKg,
    )
  }, [sex, age, heightCm, activity, goalMode, weightKg])

  const liveGoal =
    savedProfile && weightKg != null
      ? calcDailyKcalGoal(savedProfile, weightKg)
      : saved.dailyKcalGoal

  const proteinGoal = weightKg != null ? calcProteinGoal(weightKg) : null

  const removeLastPeriod = async () => {
    if (!lastPeriod) return
    setPeriodBusy(true)
    try {
      await onRemovePeriodStart(lastPeriod.id)
    } finally {
      setPeriodBusy(false)
    }
  }

  const confirmPeriodStart = async (raw: string) => {
    const startDate = raw.trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      setPeriodError('Выберите дату')
      return
    }
    if (startDate > today) {
      setPeriodError('Дата не может быть в будущем')
      return
    }
    if (startDate < addDaysIso(today, -120)) {
      setPeriodError('Укажите дату за последние 4 месяца')
      return
    }
    setPeriodBusy(true)
    setPeriodError(null)
    try {
      const prev = latestPeriodStart(data.periodStarts)
      if (prev && prev.date !== startDate) {
        await onRemovePeriodStart(prev.id)
      }
      await onSavePeriodStart(startDate)
      setPeriodPromptOpen(false)
    } catch (err) {
      setPeriodError(err instanceof Error ? err.message : 'Ошибка')
    } finally {
      setPeriodBusy(false)
    }
  }

  const save = () => {
    const ageN = Number(age.replace(',', '.'))
    const h = Number(heightCm.replace(',', '.'))
    if (!Number.isFinite(ageN) || ageN < 14 || ageN > 100) {
      setError('Укажите возраст')
      return
    }
    if (!Number.isFinite(h) || h < 120 || h > 230) {
      setError('Укажите рост в см')
      return
    }
    if (weightKg == null || weightKg < 30) {
      setError('Сначала укажите вес на экране «Сегодня»')
      return
    }
    onSaveProfile(
      {
        sex,
        age: Math.round(ageN),
        heightCm: Math.round(h),
        activity,
        goalMode,
      },
      weightKg,
    )
    setError(null)
    setEditing(false)
  }

  const cancelEdit = () => {
    if (!savedProfile) return
    setSex(savedProfile.sex)
    setAge(savedProfile.age.toString())
    setHeightCm(savedProfile.heightCm.toString())
    setActivity(savedProfile.activity)
    setGoalMode(savedProfile.goalMode)
    setError(null)
    setEditing(false)
  }

  return (
    <section className="screen">
      <header className="screen-header">
        <button type="button" className="link-btn" onClick={onBack}>
          ← Назад
        </button>
        <h1>Профиль</h1>
        <p className="muted">Норма калорий, параметры и обмеры</p>
      </header>

      {savedTargetKg != null && !editingTarget ? (
        <div className="panel">
          <div className="profile-summary">
            <div className="profile-summary-text">
              <strong>Цель {savedTargetKg} кг</strong>
              <p className="muted small">
                {weightKg != null
                  ? `Сейчас ${weightKg} кг · для прогноза и срока до цели`
                  : 'Для прогноза и срока до цели'}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="ghost-btn"
            onClick={() => {
              setTargetKg(String(savedTargetKg))
              setTargetError(null)
              setEditingTarget(true)
            }}
          >
            Изменить цель
          </button>
        </div>
      ) : (
        <div className="panel">
          <h2 className="subhead" style={{ marginTop: 0 }}>
            Целевой вес
          </h2>
          <p className="muted small">Нужен для прогноза и срока до цели.</p>
          <label className="field">
            <span>Целевой вес, кг</span>
            <input
              inputMode="decimal"
              value={targetKg}
              onChange={(e) => setTargetKg(e.target.value)}
              placeholder="например 60"
            />
          </label>
          <div className="btn-row">
            <button
              type="button"
              className="primary-btn"
              onClick={() => {
                const t = Number(targetKg.replace(',', '.'))
                if (!Number.isFinite(t) || t < 30 || t > 400) {
                  setTargetError('Целевой вес от 30 до 400 кг')
                  return
                }
                const nextTarget = Math.round(t * 10) / 10
                onSaveTargets({ targetWeightKg: nextTarget })
                setSavedTargetKg(nextTarget)
                setTargetError(null)
                setEditingTarget(false)
              }}
            >
              Сохранить
            </button>
            {savedTargetKg != null && (
              <button
                type="button"
                className="ghost-btn"
                onClick={() => {
                  setTargetKg(String(savedTargetKg))
                  setTargetError(null)
                  setEditingTarget(false)
                }}
              >
                Отмена
              </button>
            )}
          </div>
          {targetError && <p className="form-msg error">{targetError}</p>}
        </div>
      )}

      {cycleConfigured && !editingCycle ? (
        <div className="panel">
          <div className="profile-summary">
            <div className="profile-summary-text">
              <strong>
                Цикл {savedCycleLen} дн. · месячные {savedPeriodLen} дн.
              </strong>
              <p className="muted small">
                {cycle.phase === 'unknown'
                  ? 'Начало месячных ещё не указано'
                  : `${cyclePhaseLabel(cycle.phase)}${
                      cycle.dayInCycle != null ? ` · день ${cycle.dayInCycle}` : ''
                    }`}
              </p>
              {cycle.weightNote && (
                <p className="muted small cycle-weight-note">{cycle.weightNote}</p>
              )}
              {lastPeriod && (
                <p className="muted small">
                  Последние начались {formatRuDate(lastPeriod.date)}
                  {cycle.daysUntilPeriod != null && cycle.daysUntilPeriod > 0
                    ? ` · до следующих ≈ ${cycle.daysUntilPeriod} дн.`
                    : ''}
                </p>
              )}
            </div>
          </div>
          <div className="btn-row tight">
            <button
              type="button"
              className="primary-btn"
              disabled={periodBusy}
              onClick={() => {
                setPeriodError(null)
                setPeriodPromptOpen(true)
              }}
            >
              {lastPeriod ? 'Изменить дату начала' : 'Указать начало месячных'}
            </button>
            {lastPeriod && (
              <button
                type="button"
                className="ghost-btn"
                disabled={periodBusy}
                onClick={() => void removeLastPeriod()}
              >
                Сбросить
              </button>
            )}
          </div>
          <button
            type="button"
            className="ghost-btn"
            onClick={() => {
              setCycleLen(String(savedCycleLen))
              setPeriodLen(String(savedPeriodLen))
              setCycleError(null)
              setEditingCycle(true)
            }}
          >
            Изменить длину цикла
          </button>
        </div>
      ) : (
        <div className="panel">
          <h2 className="subhead" style={{ marginTop: 0 }}>
            Цикл
          </h2>
          <p className="muted small">
            Помогает понять скачки веса из‑за воды. После сохранения можно указать дату
            начала месячных.
          </p>
          <div className="form-grid">
            <label className="field">
              <span>Длина цикла, дни</span>
              <input
                inputMode="numeric"
                value={cycleLen}
                onChange={(e) => setCycleLen(e.target.value)}
                placeholder="28"
              />
            </label>
            <label className="field">
              <span>Длина месячных, дни</span>
              <input
                inputMode="numeric"
                value={periodLen}
                onChange={(e) => setPeriodLen(e.target.value)}
                placeholder="5"
              />
            </label>
          </div>
          <div className="btn-row">
            <button
              type="button"
              className="primary-btn"
              onClick={() => {
                const c = Number(cycleLen.replace(',', '.'))
                const p = Number(periodLen.replace(',', '.'))
                if (!Number.isFinite(c) || c < 21 || c > 45) {
                  setCycleError('Цикл обычно 21–45 дней')
                  return
                }
                if (!Number.isFinite(p) || p < 2 || p > 10) {
                  setCycleError('Месячные обычно 2–10 дней')
                  return
                }
                const nextCycle = Math.round(c)
                const nextPeriod = Math.round(p)
                onSaveTargets({
                  cycleLengthDays: nextCycle,
                  periodLengthDays: nextPeriod,
                })
                setSavedCycleLen(nextCycle)
                setSavedPeriodLen(nextPeriod)
                setCycleConfigured(true)
                setCycleError(null)
                setEditingCycle(false)
              }}
            >
              Сохранить
            </button>
            {cycleConfigured && (
              <button
                type="button"
                className="ghost-btn"
                onClick={() => {
                  setCycleLen(String(savedCycleLen))
                  setPeriodLen(String(savedPeriodLen))
                  setCycleError(null)
                  setEditingCycle(false)
                }}
              >
                Отмена
              </button>
            )}
          </div>
          {cycleError && <p className="form-msg error">{cycleError}</p>}
        </div>
      )}

      {savedProfile && !editing ? (
        <div className="panel">
          <div className="profile-summary">
            <div className="profile-summary-text">
              <strong>{liveGoal} ккал/день</strong>
              <p className="muted small">
                {[
                  weightKg != null ? `${weightKg} кг` : null,
                  savedTargetKg != null ? `цель ${savedTargetKg} кг` : null,
                  proteinGoal != null ? `белок ${proteinGoal} г` : null,
                  `овощи ${VEG_GOAL_G} г`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              <p className="muted small">
                {SEX_LABELS[savedProfile.sex]} · {savedProfile.age} лет ·{' '}
                {savedProfile.heightCm} см · {ACTIVITY_LABELS[savedProfile.activity]} ·{' '}
                {GOAL_MODE_LABELS[savedProfile.goalMode]}
              </p>
            </div>
          </div>
          <button type="button" className="ghost-btn" onClick={() => setEditing(true)}>
            Изменить параметры
          </button>
        </div>
      ) : (
        <div className="panel">
          <div className="form-grid">
            <label className="field">
              <span>Пол</span>
              <select value={sex} onChange={(e) => setSex(e.target.value as Sex)}>
                <option value="female">Женский</option>
                <option value="male">Мужской</option>
              </select>
            </label>
            <label className="field">
              <span>Возраст</span>
              <input
                inputMode="numeric"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="лет"
              />
            </label>
            <label className="field">
              <span>Рост, см</span>
              <input
                inputMode="decimal"
                value={heightCm}
                onChange={(e) => setHeightCm(e.target.value)}
                placeholder="см"
              />
            </label>
            <label className="field">
              <span>Активность</span>
              <select
                value={activity}
                onChange={(e) => setActivity(e.target.value as ActivityLevel)}
              >
                {(Object.keys(ACTIVITY_LABELS) as ActivityLevel[]).map((key) => (
                  <option key={key} value={key}>
                    {ACTIVITY_LABELS[key]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="field">
            <span>Цель</span>
            <select value={goalMode} onChange={(e) => setGoalMode(e.target.value as GoalMode)}>
              {(Object.keys(GOAL_MODE_LABELS) as GoalMode[]).map((key) => (
                <option key={key} value={key}>
                  {GOAL_MODE_LABELS[key]}
                </option>
              ))}
            </select>
          </label>

          {previewGoal != null && (
            <p className="profile-goal-preview">
              Новая норма: <strong>{previewGoal} ккал/день</strong>
              {proteinGoal != null ? ` · белок ${proteinGoal} г` : ''}
              {` · овощи ${VEG_GOAL_G} г`}
            </p>
          )}

          <div className="btn-row">
            <button type="button" className="primary-btn" onClick={save}>
              Сохранить
            </button>
            {savedProfile && (
              <button type="button" className="ghost-btn" onClick={cancelEdit}>
                Отмена
              </button>
            )}
          </div>
          {error && <p className="form-msg error">{error}</p>}
        </div>
      )}

      <MeasuresPanel data={data} onSave={onSaveMeasurement} />

      {periodPromptOpen && (
        <PromptDialog
          title="Начало месячных"
          label="Когда начались последние?"
          type="date"
          min={addDaysIso(today, -120)}
          max={today}
          initialValue={lastPeriod?.date ?? today}
          hint="Можно указать прошедшую дату — цикл посчитается сразу."
          busy={periodBusy}
          error={periodError}
          onCancel={() => setPeriodPromptOpen(false)}
          onConfirm={(v) => void confirmPeriodStart(v)}
        />
      )}
    </section>
  )
}
