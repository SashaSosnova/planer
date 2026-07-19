import { useEffect, useMemo, useState } from 'react'
import { CalorieRing } from '../components/CalorieRing'
import { PromptDialog } from '../components/PromptDialog'
import { formatRuDate, todayIso } from '../lib/date'
import { buildTodayTimeline, type WeekStats } from '../lib/dayStats'
import { isHealthStepsSupported } from '../lib/healthSteps'
import { MEAL_TYPE_LABELS } from '../lib/labels'
import { VEG_GOAL_G } from '../lib/macroGoals'
import {
  getWeekNutritionSummary,
  localWeekNutritionNote,
  weekFingerprint,
} from '../lib/weekSummaryLlm'
import type { AppData } from '../types'

type PromptKind = 'weight' | 'steps' | null

type Props = {
  data: AppData
  dailyKcalGoal: number
  maintainKcalGoal: number
  proteinGoal: number | null
  profileReady: boolean
  onAddMeal: () => void
  onOpenMeal: (mealId: string) => void
  onOpenProfile: () => void
  onOpenWeightHistory: () => void
  onOpenStepsHistory: () => void
  onSaveWeight: (date: string, kg: number) => Promise<unknown>
  onSaveSteps: (date: string, count: number) => Promise<unknown>
}

function WeekCard({
  week,
  maintainKcalGoal,
}: {
  week: WeekStats
  maintainKcalGoal: number
}) {
  const fingerprint = weekFingerprint(week)
  const [note, setNote] = useState(() => localWeekNutritionNote(week))
  const [loadingNote, setLoadingNote] = useState(false)

  useEffect(() => {
    let cancelled = false
    setNote(localWeekNutritionNote(week))
    setLoadingNote(true)
    void getWeekNutritionSummary(week)
      .then((text) => {
        if (!cancelled) setNote(text)
      })
      .finally(() => {
        if (!cancelled) setLoadingNote(false)
      })
    return () => {
      cancelled = true
    }
  }, [week, week.weekStart, fingerprint])

  const weightLabel =
    week.weightDelta == null
      ? 'нет данных'
      : `${week.weightDelta > 0 ? '+' : ''}${week.weightDelta} кг`

  const dayCount = 7
  const avgKcal = week.totals.kcal / dayCount
  const avgProtein = week.totals.protein / dayCount
  const avgFat = week.totals.fat / dayCount
  const avgCarbs = week.totals.carbs / dayCount
  const dailyGoal = week.kcalGoal / dayCount

  return (
    <article className="week-card">
      <div className="week-card-main">
        <CalorieRing
          eaten={avgKcal}
          goal={dailyGoal}
          maintainGoal={maintainKcalGoal}
          size="md"
        />
        <div className="week-card-side">
          <h3>{week.label}</h3>
          <div className="today-meta-row">
            <div className="stat-chip compact static">
              <span>Вес</span>
              <strong>{weightLabel}</strong>
            </div>
            <div className="stat-chip compact static">
              <span>Шаги</span>
              <strong>
                {week.avgSteps != null ? week.avgSteps.toLocaleString('ru-RU') : '—'}
              </strong>
            </div>
          </div>
          <p className="bju-line muted small">
            Белки {Math.round(avgProtein)} · Жиры {Math.round(avgFat)} · Углеводы{' '}
            {Math.round(avgCarbs)}
          </p>
        </div>
      </div>

      <p className={`week-note${loadingNote ? ' loading' : ''}`}>{note}</p>
    </article>
  )
}

function num(v: string): number | undefined {
  const n = Number(v.replace(',', '.'))
  return Number.isFinite(n) ? n : undefined
}

export function TodayScreen({
  data,
  dailyKcalGoal,
  maintainKcalGoal,
  proteinGoal,
  profileReady,
  onAddMeal,
  onOpenMeal,
  onOpenProfile,
  onOpenWeightHistory,
  onOpenStepsHistory,
  onSaveWeight,
  onSaveSteps,
}: Props) {
  const date = todayIso()
  const weight = data.weights.find((w) => w.date === date)
  const steps = data.steps.find((s) => s.date === date)

  const [prompt, setPrompt] = useState<PromptKind>(null)
  const [busy, setBusy] = useState(false)
  const [promptError, setPromptError] = useState<string | null>(null)

  const { today, recentDays, completedWeeks } = useMemo(
    () => buildTodayTimeline(data, dailyKcalGoal, date),
    [data, dailyKcalGoal, date],
  )

  const openWeight = () => {
    if (weight) onOpenWeightHistory()
    else {
      setPromptError(null)
      setPrompt('weight')
    }
  }

  const openSteps = () => {
    // On Android, open the steps screen so Health Connect import is one tap away.
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
    <section className="screen">
      <header className="screen-header today-header">
        <div>
          <p className="eyebrow">Сегодня</p>
          <h1>{formatRuDate(date)}</h1>
        </div>
        <div className="btn-row tight">
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
              <strong>
                {steps ? steps.count.toLocaleString('ru-RU') : '—'}
              </strong>
            </button>
          </div>
          <p className="bju-line muted small">
            Белки {Math.round(today.totals.protein)}
            {proteinGoal != null ? ` / ${proteinGoal}` : ''} · Жиры{' '}
            {Math.round(today.totals.fat)} · Углеводы {Math.round(today.totals.carbs)}
          </p>
          <p className="bju-line muted small">
            Овощи {today.vegGrams} / {VEG_GOAL_G} г
          </p>
        </div>
      </div>

      <div className="section-head" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="link-btn" onClick={onAddMeal}>
          Добавить
        </button>
      </div>

      {today.meals.length === 0 ? (
        <p className="muted">Пока пусто — нажмите «Добавить».</p>
      ) : (
        <ul className="meal-list">
          {today.meals.map((meal) => (
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
                  </strong>
                  <span>{Math.round(meal.totals.kcal)} ккал</span>
                </div>
                <p className="meal-preview">{meal.rawText}</p>
                <p className="meal-bju">
                  Б {Math.round(meal.totals.protein)} · Ж {Math.round(meal.totals.fat)} · У{' '}
                  {Math.round(meal.totals.carbs)}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}

      {recentDays.length > 0 && (
        <>
          <div className="section-head">
            <h2>Эта неделя</h2>
          </div>
          <ul className="day-summary-list">
            {recentDays.map((day) => (
              <li key={day.date} className="day-summary-card">
                <CalorieRing
                  eaten={day.totals.kcal}
                  goal={dailyKcalGoal}
                  maintainGoal={maintainKcalGoal}
                  size="sm"
                />
                <div className="day-summary-body">
                  <strong>{day.label}</strong>
                  <p className="muted small">
                    Б {Math.round(day.totals.protein)} · Ж {Math.round(day.totals.fat)} · У{' '}
                    {Math.round(day.totals.carbs)}
                  </p>
                  <p className="muted small">
                    {day.weightKg != null ? `${day.weightKg} кг` : 'вес —'}
                    {' · '}
                    {day.steps != null
                      ? `${day.steps.toLocaleString('ru-RU')} шагов`
                      : 'шаги —'}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {completedWeeks.length > 0 && (
        <>
          <div className="section-head">
            <h2>Прошлые недели</h2>
          </div>
          <div className="week-list">
            {completedWeeks.map((week) => (
              <WeekCard
                key={week.weekStart}
                week={week}
                maintainKcalGoal={maintainKcalGoal}
              />
            ))}
          </div>
        </>
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
