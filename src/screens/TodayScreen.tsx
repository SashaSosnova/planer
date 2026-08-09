import { useEffect, useMemo, useRef, useState } from 'react'
import { CalorieRing } from '../components/CalorieRing'
import { DayScale } from '../components/DayScale'
import { PromptDialog } from '../components/PromptDialog'
import { cyclePhaseLabel, getCycleInfo } from '../lib/cycle'
import { addDaysIso, formatRuDate, todayIso } from '../lib/date'
import { statsForDate } from '../lib/dayStats'
import { isHealthStepsSupported } from '../lib/healthSteps'
import { MEAL_TYPE_LABELS, mealPreviewText } from '../lib/labels'
import {
  formatMealClock,
  groupDayMealsForList,
  truncateMealPreview,
} from '../lib/mealDraft'
import { formatKg } from '../lib/nutrition'
import { VEG_GOAL_G } from '../lib/macroGoals'
import { calcSweetBudgetKcal } from '../lib/sweets'
import { NavGlyph } from '../components/NavGlyph'
import { mgDoseKeyForMealType, medTakenAt } from '../lib/medRoutine'
import { PlusIcon } from '../components/PlusIcon'
import { buildWeightProgress } from '../lib/weightProgress'
import type { AppData, Meal, MealType } from '../types'

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
  onAddMeal: (opts?: { text?: string; mealType?: MealType; date?: string }) => void
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
  /** Jump to this date when set (e.g. from History); clear via onFocusDateConsumed. */
  focusDate?: string | null
  onFocusDateConsumed?: () => void
  /** Register nested back handler; return unregister. */
  registerBackHandler?: (fn: () => boolean) => () => void
  /** When false (overlay open), Today does not own the back stack. */
  backEnabled?: boolean
  onSaveWeight: (date: string, kg: number) => Promise<unknown>
  onSaveSteps: (date: string, count: number) => Promise<unknown>
}

function formatMealBju(totals: { protein: number; fat: number; carbs: number }): string {
  return `Б ${Math.round(totals.protein)} · Ж ${Math.round(totals.fat)} · У ${Math.round(totals.carbs)}`
}

function mealMedTags(
  meal: Meal,
  medDay: AppData['medDays'][number] | undefined,
): { hasMg: boolean; hasFe: boolean } {
  const mgDose = mgDoseKeyForMealType(meal.mealType)
  return {
    hasMg: mgDose ? Boolean(medTakenAt(medDay, mgDose)) : false,
    hasFe: meal.mealType === 'breakfast' && Boolean(medTakenAt(medDay, 'iron')),
  }
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
  focusDate,
  onFocusDateConsumed,
  registerBackHandler,
  backEnabled = true,
  onSaveWeight,
  onSaveSteps,
}: Props) {
  const today = todayIso()
  const [date, setDate] = useState(today)
  const isToday = date === today
  const weight = data.weights.find((w) => w.date === date)
  const steps = data.steps.find((s) => s.date === date)
  const medDay = (data.medDays ?? []).find((m) => m.date === date)

  const [prompt, setPrompt] = useState<PromptKind>(null)
  const [busy, setBusy] = useState(false)
  const [promptError, setPromptError] = useState<string | null>(null)
  const promptRef = useRef(prompt)
  promptRef.current = prompt
  const dateRef = useRef(date)
  dateRef.current = date

  useEffect(() => {
    if (!focusDate) return
    const next = focusDate > todayIso() ? todayIso() : focusDate
    setDate(next)
    onFocusDateConsumed?.()
  }, [focusDate, onFocusDateConsumed])

  useEffect(() => {
    if (!registerBackHandler || !backEnabled) return
    return registerBackHandler(() => {
      if (promptRef.current) {
        setPrompt(null)
        setPromptError(null)
        return true
      }
      if (dateRef.current < todayIso()) {
        setDate(todayIso())
        return true
      }
      return false
    })
  }, [registerBackHandler, backEnabled])

  const shiftDay = (delta: number) => {
    setDate((d) => {
      const next = addDaysIso(d, delta)
      const max = todayIso()
      return next > max ? max : next
    })
  }

  const dayStats = useMemo(() => statsForDate(data, date), [data, date])
  const mealGroups = useMemo(
    () => groupDayMealsForList(dayStats.meals),
    [dayStats.meals],
  )
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
        <div className="today-menu-row" role="toolbar" aria-label="Меню">
          <button type="button" className="today-nav-item" onClick={onOpenDiary}>
            <span className="today-nav-icon">
              <NavGlyph name="diary" label="Дневник" />
            </span>
            <span className="today-nav-label">Дневник</span>
          </button>
          <button type="button" className="today-nav-item" onClick={onOpenHistory}>
            <span className="today-nav-icon">
              <NavGlyph name="history" label="История" />
            </span>
            <span className="today-nav-label">История</span>
          </button>
          <button type="button" className="today-nav-item" onClick={onOpenCare}>
            <span className="today-nav-icon">
              <NavGlyph name="care" label="Уход" />
            </span>
            <span className="today-nav-label">Уход</span>
          </button>
          <button type="button" className="today-nav-item" onClick={onOpenMeasures}>
            <span className="today-nav-icon">
              <NavGlyph name="measures" label="Обмеры" />
            </span>
            <span className="today-nav-label">Обмеры</span>
          </button>
          <button type="button" className="today-nav-item" onClick={onOpenLibrary}>
            <span className="today-nav-icon">
              <NavGlyph name="library" label="Каталог" />
            </span>
            <span className="today-nav-label">Каталог</span>
          </button>
          <button
            type="button"
            className={`today-nav-item${profileReady ? '' : ' warn'}`}
            onClick={onOpenProfile}
            aria-label="Профиль и норма калорий"
          >
            <span className="today-nav-icon">
              <NavGlyph name="profile" label="Профиль" />
            </span>
            <span className="today-nav-label">Профиль</span>
          </button>
        </div>
        <div className="today-date-nav">
          <button
            type="button"
            className="link-btn today-date-shift"
            onClick={() => shiftDay(-1)}
            aria-label="Предыдущий день"
          >
            ←
          </button>
          <h1>{formatRuDate(date)}</h1>
          <button
            type="button"
            className="link-btn today-date-shift"
            onClick={() => shiftDay(1)}
            aria-label="Следующий день"
            disabled={isToday}
          >
            →
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
          eaten={dayStats.totals.kcal}
          goal={dailyKcalGoal}
          maintainGoal={maintainKcalGoal}
          size="md"
        />
        <div className="today-hero-side">
          <div className="today-meta-row">
            <button type="button" className="stat-chip compact" onClick={openWeight}>
              <span>Вес</span>
              <strong>{weight ? `${formatKg(weight.kg)} кг` : '—'}</strong>
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
              current={dayStats.totals.protein}
              goal={proteinGoal}
              unit="г"
              mode="toward"
            />
          )}
          <DayScale
            label="Овощи"
            current={dayStats.vegGrams}
            goal={VEG_GOAL_G}
            unit="г"
            mode="toward"
          />
          <DayScale
            label="Сладкое"
            current={dayStats.sweetKcal}
            goal={sweetBudget}
            unit="ккал"
            mode="budget"
          />
        </div>
      </div>

      <section className="meal-section" aria-label="Приёмы пищи">
        {mealGroups.length > 0 ? (
          <ul className="meal-list">
            {mealGroups.map((group) => {
              if (group.kind === 'snacks') {
                const title =
                  group.meals.length > 1 ? 'Перекусы' : MEAL_TYPE_LABELS.snack
                return (
                  <li key="snacks">
                    <div className="meal-card meal-snack-card">
                      <div className="meal-card-top">
                        <strong>
                          {title}
                          {group.eatingOut ? ' · вне дома' : ''}
                        </strong>
                        <span>
                          {group.isApproximate || group.eatingOut ? '≈ ' : ''}
                          {Math.round(group.totals.kcal)} ккал
                        </span>
                      </div>
                      <ul className="meal-snack-entries">
                        {group.meals.map((meal) => {
                          const time = formatMealClock(meal.createdAt)
                          return (
                            <li key={meal.id}>
                              <button
                                type="button"
                                className="meal-snack-entry"
                                onClick={() => onOpenMeal(meal.id)}
                              >
                                <span className="meal-snack-entry-body">
                                  {truncateMealPreview(mealPreviewText(meal)) || '—'}
                                  {meal.eatingOut ? ' · вне дома' : ''}
                                  {meal.isApproximate ? ' ≈' : ''}
                                </span>
                                {time ? (
                                  <span className="meal-time">{time}</span>
                                ) : null}
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                      <div className="meal-card-foot">
                        <p className="meal-bju">{formatMealBju(group.totals)}</p>
                      </div>
                    </div>
                  </li>
                )
              }

              const meal = group.meal
              const { hasMg, hasFe } = mealMedTags(meal, medDay)
              const time = formatMealClock(meal.createdAt)
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
                      <span>
                        {meal.isApproximate ? '≈ ' : ''}
                        {Math.round(meal.totals.kcal)} ккал
                      </span>
                    </div>
                    <p className="meal-preview">
                      {truncateMealPreview(mealPreviewText(meal))}
                    </p>
                    <div className="meal-card-foot">
                      <p className="meal-bju">{formatMealBju(meal.totals)}</p>
                      {time ? <span className="meal-time">{time}</span> : null}
                    </div>
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
          onClick={() => onAddMeal({ date })}
          aria-label="Добавить приём"
          title="Добавить приём"
        >
          <PlusIcon size={26} />
        </button>
      )}

      {prompt === 'weight' && (
        <PromptDialog
          title={isToday ? 'Вес за сегодня' : `Вес · ${formatRuDate(date)}`}
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
          title={isToday ? 'Шаги за сегодня' : `Шаги · ${formatRuDate(date)}`}
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
