import { useEffect, useMemo, useRef, useState } from 'react'
import { CalorieRing } from '../components/CalorieRing'
import { DayScale } from '../components/DayScale'
import { PromptDialog } from '../components/PromptDialog'
import { addDaysIso, formatRuDate, todayIso } from '../lib/date'
import { statsForDate } from '../lib/dayStats'
import { isHealthStepsSupported } from '../lib/healthSteps'
import { MEAL_TYPE_LABELS, mealPreviewText } from '../lib/labels'
import {
  formatMealClock,
  groupDayMealsForList,
} from '../lib/mealDraft'
import { formatKg, round2 } from '../lib/nutrition'
import { PlusIcon } from '../components/PlusIcon'
import { buildFourWeekAnalysis } from '../lib/fourWeekAnalysis'
import type { ActivityLevel } from '../lib/calorieGoal'
import type { AppData, MealType } from '../types'

type PromptKind = 'weight' | 'steps' | null

type Props = {
  data: AppData
  dailyKcalGoal: number
  maintainKcalGoal: number
  targetWeightKg?: number | null
  activity?: ActivityLevel | null
  proteinGoal: number | null
  vegGoalG: number
  sweetGoalKcal: number
  profileReady: boolean
  onAddMeal: (opts?: { text?: string; mealType?: MealType; date?: string }) => void
  onOpenMeal: (mealId: string) => void
  onOpenProfile: () => void
  onOpenWeightHistory: () => void
  onOpenStepsHistory: () => void
  onOpenHistory: () => void
  onOpenMeasures: () => void
  onOpenLibrary: () => void
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

function deltaSincePreviousWeighIn(
  weights: { date: string; kg: number }[],
  date: string,
): number | null {
  const current = weights.find((w) => w.date === date)
  if (!current) return null
  let previous: { date: string; kg: number } | null = null
  for (const entry of weights) {
    if (entry.date >= date) continue
    if (!previous || entry.date > previous.date) previous = entry
  }
  if (!previous) return null
  return round2(current.kg - previous.kg)
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
  activity,
  proteinGoal,
  vegGoalG,
  sweetGoalKcal,
  profileReady,
  onAddMeal,
  onOpenMeal,
  onOpenProfile,
  onOpenWeightHistory,
  onOpenStepsHistory,
  onOpenHistory,
  onOpenMeasures,
  onOpenLibrary,
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

  const [menuOpen, setMenuOpen] = useState(false)
  const menuOpenRef = useRef(false)
  menuOpenRef.current = menuOpen
  const menuRef = useRef<HTMLDivElement>(null)
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
    if (!menuOpen) return
    const onPointer = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  useEffect(() => {
    if (!registerBackHandler || !backEnabled) return
    return registerBackHandler(() => {
      if (menuOpenRef.current) {
        setMenuOpen(false)
        return true
      }
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
  const weightDelta = deltaSincePreviousWeighIn(data.weights, date)

  const fourWeek = useMemo(
    () =>
      buildFourWeekAnalysis({
        data,
        dailyKcalGoal,
        maintainKcal: maintainKcalGoal,
        targetKg: targetWeightKg,
        activity,
        today: date,
      }),
    [data, dailyKcalGoal, maintainKcalGoal, targetWeightKg, activity, date],
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
        <div className="today-menu-row">
          <div className="today-menu-cluster" ref={menuRef}>
          <button
            type="button"
            className="today-tool-btn"
            aria-label="Меню"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <svg viewBox="0 0 24 24" aria-hidden>
              <circle cx="12" cy="5" r="1.7" fill="currentColor" />
              <circle cx="12" cy="12" r="1.7" fill="currentColor" />
              <circle cx="12" cy="19" r="1.7" fill="currentColor" />
            </svg>
          </button>
          {menuOpen && (
            <div className="today-text-menu" role="menu">
              <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onOpenHistory() }}>
                История
              </button>
              <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onOpenMeasures() }}>
                Обмеры
              </button>
              <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onOpenLibrary() }}>
                Каталог
              </button>
              <button
                type="button"
                role="menuitem"
                className={profileReady ? undefined : 'warn'}
                onClick={() => { setMenuOpen(false); onOpenProfile() }}
              >
                Профиль
              </button>
            </div>
          )}
          </div>
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

      {fourWeek && (
        <button
          type="button"
          className="analysis-teaser"
          onClick={onOpenHistory}
        >
          <span className="analysis-teaser-label">Итоги за месяц</span>
          <span className="analysis-teaser-text">{fourWeek.headline}</span>
        </button>
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
              {weightDelta != null && (
                <span
                  className={`stat-chip-delta ${
                    weightDelta > 0.005 ? 'up' : weightDelta < -0.005 ? 'down' : 'flat'
                  }`}
                >
                  {weightDelta > 0.005
                    ? `+${formatKg(weightDelta)}`
                    : weightDelta < -0.005
                      ? `−${formatKg(Math.abs(weightDelta))}`
                      : '0'}
                </span>
              )}
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
            goal={vegGoalG}
            unit="г"
            mode="toward"
          />
          <DayScale
            label="Сладкое"
            current={dayStats.sweetKcal}
            goal={sweetGoalKcal}
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
                        </strong>
                        <span>
                          {group.isApproximate ? '≈ ' : ''}
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
                                  {mealPreviewText(meal) || '—'}
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
                      </strong>
                      <span>
                        {meal.isApproximate ? '≈ ' : ''}
                        {Math.round(meal.totals.kcal)} ккал
                      </span>
                    </div>
                    <p className="meal-preview">
                      {mealPreviewText(meal)}
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
