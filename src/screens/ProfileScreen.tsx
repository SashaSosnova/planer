import { useEffect, useMemo, useRef, useState } from 'react'
import type { User } from 'firebase/auth'
import { AccountPanel } from '../components/AccountPanel'
import { CycleCalendar } from '../components/CycleCalendar'
import { SettingsIcon } from '../components/SettingsIcon'
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
  averageCycleLength,
  cyclePhaseLabel,
  getCycleInfo,
  latestPeriodStart,
} from '../lib/cycle'
import { formatRuDate, todayIso } from '../lib/date'
import { calcProteinGoal, VEG_GOAL_G } from '../lib/macroGoals'
import type { AppSettings } from '../lib/settings'
import type { AppData } from '../types'

const SEX_LABELS: Record<Sex, string> = {
  female: 'Женский',
  male: 'Мужской',
}

type Props = {
  data: AppData
  user: User | null
  settings: AppSettings
  onBack: () => void
  onSaveProfile: (profile: BodyProfile, weightKg: number) => { dailyKcalGoal: number }
  onSaveTargets: (input: {
    targetWeightKg?: number | null
    cycleLengthDays?: number
    periodLengthDays?: number
  }) => unknown
  onSavePeriodStart: (date: string) => Promise<unknown>
  onRemovePeriodStart: (id: string) => Promise<unknown>
  /** Open with calendar already expanded (e.g. from Today cycle card). */
  initialCycleCalOpen?: boolean
  onImportDiary?: (
    raw: unknown,
    onProgress?: (msg: string) => void,
  ) => Promise<{ meals: number; weights: number }>
  registerBackHandler?: (fn: () => boolean) => () => void
}

function latestWeight(data: AppData): number | undefined {
  const sorted = [...data.weights].sort((a, b) => b.date.localeCompare(a.date))
  return sorted[0]?.kg
}

export function ProfileScreen({
  data,
  user,
  settings,
  onBack,
  onSaveProfile,
  onSaveTargets,
  onSavePeriodStart,
  onRemovePeriodStart,
  initialCycleCalOpen = false,
  onImportDiary,
  registerBackHandler,
}: Props) {
  const savedProfile = settings.profile
  const weightKg = latestWeight(data)
  const today = todayIso()
  const historyMin = `${today.slice(0, 4)}-01-01`
  const lastPeriod = latestPeriodStart(data.periodStarts)

  const [editing, setEditing] = useState(!savedProfile)
  const [sex, setSex] = useState<Sex>(savedProfile?.sex ?? 'female')
  const [age, setAge] = useState(savedProfile?.age?.toString() ?? '')
  const [heightCm, setHeightCm] = useState(savedProfile?.heightCm?.toString() ?? '')
  const [activity, setActivity] = useState<ActivityLevel>(savedProfile?.activity ?? 'light')
  const [goalMode, setGoalMode] = useState<GoalMode>(savedProfile?.goalMode ?? 'mild')
  const [error, setError] = useState<string | null>(null)

  const [targetKg, setTargetKg] = useState(
    settings.targetWeightKg != null ? String(settings.targetWeightKg) : '',
  )
  const [savedTargetKg, setSavedTargetKg] = useState<number | null>(settings.targetWeightKg)
  const [editingTarget, setEditingTarget] = useState(settings.targetWeightKg == null)
  const [targetError, setTargetError] = useState<string | null>(null)

  const [cycleLen, setCycleLen] = useState(String(settings.cycleLengthDays || DEFAULT_CYCLE_LENGTH))
  const [periodLen, setPeriodLen] = useState(
    String(settings.periodLengthDays || DEFAULT_PERIOD_LENGTH),
  )
  const [savedCycleLen, setSavedCycleLen] = useState(
    settings.cycleLengthDays || DEFAULT_CYCLE_LENGTH,
  )
  const [savedPeriodLen, setSavedPeriodLen] = useState(
    settings.periodLengthDays || DEFAULT_PERIOD_LENGTH,
  )
  const [cycleError, setCycleError] = useState<string | null>(null)
  const [cycleMsg, setCycleMsg] = useState<string | null>(null)
  const [cycleSettingsOpen, setCycleSettingsOpen] = useState(false)
  const [cycleCalOpen, setCycleCalOpen] = useState(initialCycleCalOpen)
  const [periodBusy, setPeriodBusy] = useState(false)
  const [periodError, setPeriodError] = useState<string | null>(null)
  const [calMonth, setCalMonth] = useState(() => {
    const [y, m] = today.split('-').map(Number)
    return new Date(y!, (m ?? 1) - 1, 1)
  })
  const cycleCalOpenRef = useRef(cycleCalOpen)
  cycleCalOpenRef.current = cycleCalOpen
  const cycleSettingsOpenRef = useRef(cycleSettingsOpen)
  cycleSettingsOpenRef.current = cycleSettingsOpen

  const suggestedCycleLen = useMemo(
    () => averageCycleLength(data.periodStarts),
    [data.periodStarts],
  )
  const lengthsDirty =
    Number(cycleLen.replace(',', '.')) !== savedCycleLen ||
    Number(periodLen.replace(',', '.')) !== savedPeriodLen

  useEffect(() => {
    const p = settings.profile
    setEditing(!p)
    setSex(p?.sex ?? 'female')
    setAge(p?.age?.toString() ?? '')
    setHeightCm(p?.heightCm?.toString() ?? '')
    setActivity(p?.activity ?? 'light')
    setGoalMode(p?.goalMode ?? 'mild')
    setError(null)
    setTargetKg(settings.targetWeightKg != null ? String(settings.targetWeightKg) : '')
    setSavedTargetKg(settings.targetWeightKg)
    setEditingTarget(settings.targetWeightKg == null)
    setTargetError(null)
    setCycleLen(String(settings.cycleLengthDays || DEFAULT_CYCLE_LENGTH))
    setPeriodLen(String(settings.periodLengthDays || DEFAULT_PERIOD_LENGTH))
    setSavedCycleLen(settings.cycleLengthDays || DEFAULT_CYCLE_LENGTH)
    setSavedPeriodLen(settings.periodLengthDays || DEFAULT_PERIOD_LENGTH)
    setCycleError(null)
  }, [settings])

  useEffect(() => {
    if (!registerBackHandler) return
    return registerBackHandler(() => {
      if (cycleCalOpenRef.current) {
        setCycleCalOpen(false)
        return true
      }
      if (cycleSettingsOpenRef.current) {
        setCycleSettingsOpen(false)
        return true
      }
      return false
    })
  }, [registerBackHandler])

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
      : settings.dailyKcalGoal

  const proteinGoal = weightKg != null ? calcProteinGoal(weightKg) : null

  const saveCycleLengths = (): boolean => {
    const c = Number(cycleLen.replace(',', '.'))
    const p = Number(periodLen.replace(',', '.'))
    if (!Number.isFinite(c) || c < 21 || c > 45) {
      setCycleError('Цикл обычно 21–45 дней')
      return false
    }
    if (!Number.isFinite(p) || p < 2 || p > 10) {
      setCycleError('Месячные обычно 2–10 дней')
      return false
    }
    const nextCycle = Math.round(c)
    const nextPeriod = Math.round(p)
    onSaveTargets({
      cycleLengthDays: nextCycle,
      periodLengthDays: nextPeriod,
    })
    setSavedCycleLen(nextCycle)
    setSavedPeriodLen(nextPeriod)
    setCycleError(null)
    setCycleMsg(null)
    return true
  }

  const applySuggestedCycleLen = () => {
    if (suggestedCycleLen == null) return
    onSaveTargets({ cycleLengthDays: suggestedCycleLen })
    setSavedCycleLen(suggestedCycleLen)
    setCycleLen(String(suggestedCycleLen))
    setCycleMsg(`Длина цикла обновлена: ${suggestedCycleLen} дн.`)
  }

  const togglePeriodDate = async (iso: string) => {
    if (iso > today || iso < historyMin) return
    const existing = data.periodStarts.find((p) => p.date === iso)
    setPeriodBusy(true)
    setPeriodError(null)
    setCycleMsg(null)
    try {
      if (existing) {
        await onRemovePeriodStart(existing.id)
        setCycleMsg(`Снято: ${formatRuDate(iso)}`)
      } else {
        await onSavePeriodStart(iso)
        setCycleMsg(`Начало: ${formatRuDate(iso)}`)
      }
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
        <p className="muted">Аккаунт, норма и параметры</p>
      </header>

      <AccountPanel user={user} onImportDiary={onImportDiary} />

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

      <div className="panel cycle-panel">
        <div className="profile-summary">
          <div className="profile-summary-text">
            <strong>Цикл</strong>
            <p className="muted small">
              {cycle.phase === 'unknown'
                ? 'Начало месячных ещё не отмечено'
                : `${cyclePhaseLabel(cycle.phase)}${
                    cycle.dayInCycle != null ? ` · день ${cycle.dayInCycle} из ${savedCycleLen}` : ''
                  }`}
            </p>
            {cycle.weightNote && (
              <p className="muted small cycle-weight-note">{cycle.weightNote}</p>
            )}
            {lastPeriod && cycle.phase !== 'unknown' && (
              <p className="muted small">
                Последние с {formatRuDate(lastPeriod.date)}
                {cycle.daysUntilPeriod != null && cycle.daysUntilPeriod > 0
                  ? ` · до следующих ≈ ${cycle.daysUntilPeriod} дн.`
                  : ''}
              </p>
            )}
          </div>
          <button
            type="button"
            className={`icon-btn sm${cycleSettingsOpen ? ' active' : ''}`}
            aria-label="Настройки цикла"
            aria-expanded={cycleSettingsOpen}
            onClick={() => {
              setCycleSettingsOpen((v) => !v)
              setCycleLen(String(savedCycleLen))
              setPeriodLen(String(savedPeriodLen))
              setCycleError(null)
              setCycleMsg(null)
            }}
          >
            <SettingsIcon size={18} />
          </button>
        </div>

        {cycleSettingsOpen && (
          <div className="cycle-settings">
            <div className="form-grid compact">
              <label className="field">
                <span>Длина цикла</span>
                <input
                  inputMode="numeric"
                  value={cycleLen}
                  onChange={(e) => {
                    setCycleLen(e.target.value)
                    setCycleError(null)
                  }}
                  placeholder="28"
                />
              </label>
              <label className="field">
                <span>Месячные, дни</span>
                <input
                  inputMode="numeric"
                  value={periodLen}
                  onChange={(e) => {
                    setPeriodLen(e.target.value)
                    setCycleError(null)
                  }}
                  placeholder="5"
                />
              </label>
            </div>
            {lengthsDirty && (
              <div className="btn-row tight">
                <button
                  type="button"
                  className="primary-btn"
                  onClick={() => {
                    if (saveCycleLengths()) setCycleSettingsOpen(false)
                  }}
                >
                  Сохранить
                </button>
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => {
                    setCycleLen(String(savedCycleLen))
                    setPeriodLen(String(savedPeriodLen))
                    setCycleError(null)
                    setCycleSettingsOpen(false)
                  }}
                >
                  Отмена
                </button>
              </div>
            )}
            {cycleError && <p className="form-msg error">{cycleError}</p>}
            {cycleMsg && <p className="form-msg">{cycleMsg}</p>}
            {suggestedCycleLen != null && Math.abs(suggestedCycleLen - savedCycleLen) >= 2 && (
              <div className="btn-row tight">
                <p className="muted small" style={{ margin: 0, flex: 1 }}>
                  По датам средняя длина ≈ {suggestedCycleLen} дн.
                </p>
                <button type="button" className="ghost-btn" onClick={applySuggestedCycleLen}>
                  Применить
                </button>
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          className="ghost-btn"
          aria-expanded={cycleCalOpen}
          onClick={() => {
            setCycleCalOpen((v) => !v)
            setPeriodError(null)
            if (!cycleCalOpen) setCycleMsg(null)
          }}
        >
          {cycleCalOpen ? 'Скрыть календарь' : 'Календарь месячных'}
        </button>

        {cycleCalOpen && (
          <div className="cycle-cal-expand">
            <CycleCalendar
              month={calMonth}
              periodStarts={data.periodStarts}
              periodLengthDays={savedPeriodLen}
              today={today}
              minDate={historyMin}
              maxDate={today}
              busy={periodBusy}
              onMonthChange={setCalMonth}
              onToggleDate={(iso) => void togglePeriodDate(iso)}
            />
            <p className="muted small cycle-cal-hint">
              Тап — начало месячных; красным {savedPeriodLen}{' '}
              {savedPeriodLen === 1 ? 'день' : savedPeriodLen < 5 ? 'дня' : 'дней'}. Ещё раз по
              первому дню — снять.
            </p>
            {periodError && <p className="form-msg error">{periodError}</p>}
            {!cycleSettingsOpen && cycleMsg && <p className="form-msg">{cycleMsg}</p>}
          </div>
        )}
      </div>

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
    </section>
  )
}
