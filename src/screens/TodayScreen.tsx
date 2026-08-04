import { useEffect, useMemo, useRef, useState } from 'react'
import { CalorieRing } from '../components/CalorieRing'
import { DayScale } from '../components/DayScale'
import { PromptDialog } from '../components/PromptDialog'
import { cyclePhaseLabel, getCycleInfo } from '../lib/cycle'
import { formatRuDate, todayIso } from '../lib/date'
import { statsForDate } from '../lib/dayStats'
import { isHealthStepsSupported } from '../lib/healthSteps'
import { MEAL_TYPE_LABELS, mealPreviewText } from '../lib/labels'
import { VEG_GOAL_G } from '../lib/macroGoals'
import { calcSweetBudgetKcal } from '../lib/sweets'
import { AppsGridIcon } from '../components/AppsGridIcon'
import {
  CareMenuIcon,
  DiaryMenuIcon,
  HistoryMenuIcon,
  LibraryMenuIcon,
  MeasuresMenuIcon,
} from '../components/MoreMenuIcons'
import { mgDoseKeyForMealType, medTakenAt } from '../lib/medRoutine'
import { PlusIcon } from '../components/PlusIcon'
import { buildWeightProgress } from '../lib/weightProgress'
import type { AppData, MealType } from '../types'

type PromptKind = 'weight' | 'steps' | null

type Props = {
  data: AppData
  dailyKcalGoal: number
  maintainKcalGoal: number
  targetWeightKg?: number | null
  proteinGoal: number | null
  profileReady: boolean
  cycleLengthDays: number
  periodLengthDays: number
  onAddMeal: (opts?: { text?: string; mealType?: MealType }) => void
  onOpenMeal: (mealId: string) => void
  onOpenProfile: () => void
  onOpenCycle: () => void
  onOpenWeightHistory: () => void
  onOpenStepsHistory: () => void
  onOpenDiary: () => void
  onOpenHistory: () => void
  onOpenMeasures: () => void
  onOpenLibrary: () => void
  onOpenCare: () => void
  /** Register nested back handler; return unregister. */
  registerBackHandler?: (fn: () => boolean) => () => void
  /** When false (overlay open), Today does not own the back stack. */
  backEnabled?: boolean
  onSaveWeight: (date: string, kg: number) => Promise<unknown>
  onSaveSteps: (date: string, count: number) => Promise<unknown>
}

function num(v: string): number | undefined {
  const n = Number(v.replace(',', '.'))
  return Number.isFinite(n) ? n : undefined
}

export function TodayScreen({
  data,
  dailyKcalGoal,
  maintainKcalGoal,
  targetWeightKg,
  proteinGoal,
  profileReady,
  cycleLengthDays,
  periodLengthDays,
  onAddMeal,
  onOpenMeal,
  onOpenProfile,
  onOpenCycle,
  onOpenWeightHistory,
  onOpenStepsHistory,
  onOpenDiary,
  onOpenHistory,
  onOpenMeasures,
  onOpenLibrary,
  onOpenCare,
  registerBackHandler,
  backEnabled = true,
  onSaveWeight,
  onSaveSteps,
}: Props) {
  const date = todayIso()
  const weight = data.weights.find((w) => w.date === date)
  const steps = data.steps.find((s) => s.date === date)
  const medDay = (data.medDays ?? []).find((m) => m.date === date)

  const [prompt, setPrompt] = useState<PromptKind>(null)
  const [busy, setBusy] = useState(false)
  const [promptError, setPromptError] = useState<string | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const moreOpenRef = useRef(moreOpen)
  moreOpenRef.current = moreOpen
  const promptRef = useRef(prompt)
  promptRef.current = prompt
  const moreRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!registerBackHandler || !backEnabled) return
    return registerBackHandler(() => {
      if (promptRef.current) {
        setPrompt(null)
        setPromptError(null)
        return true
      }
      if (!moreOpenRef.current) return false
      setMoreOpen(false)
      return true
    })
  }, [registerBackHandler, backEnabled])

  useEffect(() => {
    if (!moreOpen) return
    const onPointerDown = (e: PointerEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [moreOpen])

  const runMore = (action: () => void) => {
    setMoreOpen(false)
    action()
  }

  const today = useMemo(() => statsForDate(data, date), [data, date])
  const sweetBudget = useMemo(
    () => calcSweetBudgetKcal(dailyKcalGoal),
    [dailyKcalGoal],
  )

  const weightProgress = useMemo(
    () =>
      buildWeightProgress({
        data,
        today: date,
        maintainKcal: maintainKcalGoal,
        dailyKcalGoal,
        targetKg: targetWeightKg,
        cycleLengthDays,
        periodLengthDays,
      }),
    [
      data,
      date,
      maintainKcalGoal,
      dailyKcalGoal,
      targetWeightKg,
      cycleLengthDays,
      periodLengthDays,
    ],
  )

  const cycle = useMemo(
    () => getCycleInfo(data.periodStarts, date, cycleLengthDays, periodLengthDays),
    [data.periodStarts, date, cycleLengthDays, periodLengthDays],
  )

  const openWeight = () => {
    if (weight) onOpenWeightHistory()
    else {
      setPromptError(null)
      setPrompt('weight')
    }
  }

  const openSteps = () => {
    if (steps || isHealthStepsSupported()) {
      onOpenStepsHistory()
      return
    }
    setPromptError(null)
    setPrompt('steps')
  }

  const confirmPrompt = async (raw: string) => {
    if (prompt === 'weight') {
      const kgVal = num(raw)
      if (kgVal == null || kgVal < 30) {
        setPromptError('Укажите вес от 30 кг')
        return
      }
      setBusy(true)
      setPromptError(null)
      try {
        await onSaveWeight(date, kgVal)
        setPrompt(null)
      } catch (err) {
        setPromptError(err instanceof Error ? err.message : 'Ошибка')
      } finally {
        setBusy(false)
      }
      return
    }

    if (prompt === 'steps') {
      const stepsVal = num(raw)
      if (stepsVal == null || stepsVal < 0) {
        setPromptError('Укажите шаги')
        return
      }
      setBusy(true)
      setPromptError(null)
      try {
        await onSaveSteps(date, Math.round(stepsVal))
        setPrompt(null)
      } catch (err) {
        setPromptError(err instanceof Error ? err.message : 'Ошибка')
      } finally {
        setBusy(false)
      }
    }
  }

  return (
    <section className="screen today-screen">
      <header className="screen-header today-header">
        <div>
          <p className="eyebrow">Сегодня</p>
          <h1>{formatRuDate(date)}</h1>
        </div>
        <div className="btn-row tight nowrap">
          <button
            type="button"
            className="icon-btn"
            onClick={onOpenDiary}
            aria-label="Дневник"
            title="Дневник"
          >
            <DiaryMenuIcon />
          </button>
          <div className="more-anchor" ref={moreRef}>
            <button
              type="button"
              className={`icon-btn${moreOpen ? ' active' : ''}`}
              onClick={() => setMoreOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={moreOpen}
              aria-label="Ещё"
              title="Ещё"
            >
              <AppsGridIcon size={24} />
            </button>
            {moreOpen && (
              <div className="more-popover" role="menu" aria-label="Ещё">
                <div className="more-grid">
                  <button
                    type="button"
                    role="menuitem"
                    className="more-grid-item"
                    onClick={() => runMore(onOpenHistory)}
                  >
                    <HistoryMenuIcon />
                    <span>История</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="more-grid-item"
                    onClick={() => runMore(onOpenCare)}
                  >
                    <CareMenuIcon />
                    <span>Уход</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="more-grid-item"
                    onClick={() => runMore(onOpenMeasures)}
                  >
                    <MeasuresMenuIcon />
                    <span>Обмеры</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="more-grid-item"
                    onClick={() => runMore(onOpenLibrary)}
                  >
                    <LibraryMenuIcon />
                    <span>Справочник</span>
                  </button>
                </div>
              </div>
            )}
          </div>
          <button
            type="button"
            className={`icon-btn profile-btn${profileReady ? '' : ' warn'}`}
            onClick={onOpenProfile}
            aria-label="Профиль и норма калорий"
            title="Профиль"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden
              style={{ width: 24, height: 24, display: 'block', flexShrink: 0 }}
            >
              <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.8" />
              <path
                d="M5 19.5c1.2-3.2 3.6-4.8 7-4.8s5.8 1.6 7 4.8"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </header>

      {!profileReady && (
        <p className="banner">
          Задайте рост, возраст и активность в профиле — норма калорий посчитается сама.
        </p>
      )}

      {(weightProgress || (cycle.phase !== 'unknown' && cycle.dayInCycle != null)) && (
        <div className="progress-card progress-card--compact">
          <div className="progress-card-top">
            {weightProgress ? (
              <strong className={`progress-card-delta ${weightProgress.tone}`}>
                {weightProgress.hero}
              </strong>
            ) : (
              <span className="progress-card-label">Цикл</span>
            )}
            {cycle.phase !== 'unknown' && cycle.dayInCycle != null && (
              <button
                type="button"
                className="progress-card-cycle"
                onClick={onOpenCycle}
              >
                день {cycle.dayInCycle} · {cyclePhaseLabel(cycle.phase)}
              </button>
            )}
          </div>
          {(weightProgress?.note || cycle.weightNote) && (
            <p className="muted small">
              {[cycle.weightNote, weightProgress?.note].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
      )}

      <div className="today-hero">
        <CalorieRing
          eaten={today.totals.kcal}
          goal={dailyKcalGoal}
          maintainGoal={maintainKcalGoal}
          size="md"
        />
        <div className="today-hero-side">
          <div className="today-meta-row">
            <button type="button" className="stat-chip compact" onClick={openWeight}>
              <span>Вес</span>
              <strong>{weight ? `${weight.kg} кг` : '—'}</strong>
            </button>
            <button type="button" className="stat-chip compact" onClick={openSteps}>
              <span>Шаги</span>
              <strong>{steps ? steps.count.toLocaleString('ru-RU') : '—'}</strong>
            </button>
          </div>
        </div>
      </div>

      <div className="day-scales-card">
        <div className="day-scales">
          {proteinGoal != null && (
            <DayScale
              label="Белки"
              current={today.totals.protein}
              goal={proteinGoal}
              unit="г"
              mode="toward"
            />
          )}
          <DayScale
            label="Овощи"
            current={today.vegGrams}
            goal={VEG_GOAL_G}
            unit="г"
            mode="toward"
          />
          <DayScale
            label="Сладкое"
            current={today.sweetKcal}
            goal={sweetBudget}
            unit="ккал"
            mode="budget"
          />
        </div>
      </div>

      <section className="meal-section" aria-label="Приёмы пищи">
        {today.meals.length > 0 ? (
          <ul className="meal-list">
            {today.meals.map((meal) => {
              const mgDose = mgDoseKeyForMealType(meal.mealType)
              const hasMg = mgDose ? Boolean(medTakenAt(medDay, mgDose)) : false
              const hasFe =
                meal.mealType === 'breakfast' && Boolean(medTakenAt(medDay, 'iron'))
              return (
                <li key={meal.id}>
                  <button
                    type="button"
                    className="meal-card meal-card-btn"
                    onClick={() => onOpenMeal(meal.id)}
                  >
                    <div className="meal-card-top">
                      <strong>
                        {MEAL_TYPE_LABELS[meal.mealType]}
                        {meal.eatingOut ? ' · вне дома' : ''}
                        {hasMg || hasFe ? (
                          <span className="meal-med-tags">
                            {hasMg ? ' · Mg' : ''}
                            {hasFe ? ' · Fe' : ''}
                          </span>
                        ) : null}
                      </strong>
                      <span>{Math.round(meal.totals.kcal)} ккал</span>
                    </div>
                    <p className="meal-preview">{mealPreviewText(meal)}</p>
                    <p className="meal-bju">
                      Б {Math.round(meal.totals.protein)} · Ж {Math.round(meal.totals.fat)} · У{' '}
                      {Math.round(meal.totals.carbs)}
                    </p>
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="muted small meal-section-empty">Пока пусто — нажмите +</p>
        )}
      </section>

      {!prompt && (
        <button
          type="button"
          className="meal-fab"
          onClick={() => onAddMeal()}
          aria-label="Добавить приём"
          title="Добавить приём"
        >
          <PlusIcon size={26} />
        </button>
      )}

      {prompt === 'weight' && (
        <PromptDialog
          title="Вес за сегодня"
          label="Сколько кг?"
          placeholder="например 63.8"
          inputMode="decimal"
          busy={busy}
          error={promptError}
          onCancel={() => setPrompt(null)}
          onConfirm={(v) => void confirmPrompt(v)}
        />
      )}

      {prompt === 'steps' && (
        <PromptDialog
          title="Шаги за сегодня"
          label="Сколько шагов?"
          placeholder="например 7000"
          inputMode="numeric"
          busy={busy}
          error={promptError}
          onCancel={() => setPrompt(null)}
          onConfirm={(v) => void confirmPrompt(v)}
        />
      )}
    </section>
  )
}
