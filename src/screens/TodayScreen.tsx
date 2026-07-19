import { useEffect, useMemo, useState } from 'react'
import { CalorieRing } from '../components/CalorieRing'
import { MeasureTapeIcon } from '../components/MeasureTapeIcon'
import { ChartIcon, TrendChart, type ChartSeries } from '../components/TrendChart'
import { PencilIcon } from '../components/PencilIcon'
import { formatRuDate, todayIso } from '../lib/date'
import { buildTodayTimeline, type WeekStats } from '../lib/dayStats'
import { MEAL_TYPE_LABELS } from '../lib/labels'
import {
  getWeekNutritionSummary,
  localWeekNutritionNote,
  weekFingerprint,
} from '../lib/weekSummaryLlm'
import type { AppData } from '../types'

type ChartKind = 'weight' | 'steps' | null

const STEPS_GOAL = 7000

type Props = {
  data: AppData
  dailyKcalGoal: number
  profileReady: boolean
  onAddMeal: () => void
  onOpenMeal: (mealId: string) => void
  onOpenProfile: () => void
  onOpenMeasures: () => void
  onSaveWeight: (date: string, kg: number) => Promise<unknown>
  onSaveSteps: (date: string, count: number) => Promise<unknown>
}

function WeekCard({ week }: { week: WeekStats }) {
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
          size="md"
          approximate={week.days.some((d) => d.approximate)}
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
  profileReady,
  onAddMeal,
  onOpenMeal,
  onOpenProfile,
  onOpenMeasures,
  onSaveWeight,
  onSaveSteps,
}: Props) {
  const date = todayIso()
  const weight = data.weights.find((w) => w.date === date)
  const steps = data.steps.find((s) => s.date === date)

  const [editingWeight, setEditingWeight] = useState(!weight)
  const [editingSteps, setEditingSteps] = useState(!steps)
  const [kg, setKg] = useState(weight?.kg?.toString() ?? '')
  const [stepCount, setStepCount] = useState(steps?.count?.toString() ?? '')
  const [busy, setBusy] = useState<'weight' | 'steps' | null>(null)
  const [chartKind, setChartKind] = useState<ChartKind>(null)
  const [bodyError, setBodyError] = useState<string | null>(null)

  useEffect(() => {
    setKg(weight?.kg?.toString() ?? '')
    setStepCount(steps?.count?.toString() ?? '')
    setEditingWeight(!weight)
    setEditingSteps(!steps)
  }, [weight, steps])

  const { today, recentDays, completedWeeks } = useMemo(
    () => buildTodayTimeline(data, dailyKcalGoal, date),
    [data, dailyKcalGoal, date],
  )

  const chartSeries = useMemo((): {
    title: string
    unit: string
    series: ChartSeries[]
    variant?: 'line' | 'bar'
    goal?: number
  } | null => {
    if (chartKind === 'weight') {
      const points = [...data.weights]
        .filter((w) => w.kg > 0)
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((w) => ({ date: w.date, value: w.kg }))
      return {
        title: 'Вес',
        unit: 'кг',
        series: [{ id: 'weight', label: 'Вес', color: '#0f4c5c', points }],
      }
    }
    if (chartKind === 'steps') {
      const points = [...data.steps]
        .filter((s) => s.count > 0)
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((s) => ({ date: s.date, value: s.count }))
      return {
        title: 'Шаги',
        unit: 'шагов',
        variant: 'bar',
        goal: STEPS_GOAL,
        series: [{ id: 'steps', label: 'Шаги', color: '#2f7d4c', points }],
      }
    }
    return null
  }, [chartKind, data.weights, data.steps])

  const saveWeight = async () => {
    const kgVal = num(kg)
    if (kgVal == null || kgVal < 30) {
      setBodyError('Укажите вес')
      return
    }
    setBusy('weight')
    setBodyError(null)
    try {
      await onSaveWeight(date, kgVal)
      setEditingWeight(false)
    } catch (err) {
      setBodyError(err instanceof Error ? err.message : 'Ошибка')
    } finally {
      setBusy(null)
    }
  }

  const saveSteps = async () => {
    const stepsVal = num(stepCount)
    if (stepsVal == null || stepsVal < 0) {
      setBodyError('Укажите шаги')
      return
    }
    setBusy('steps')
    setBodyError(null)
    try {
      await onSaveSteps(date, Math.round(stepsVal))
      setEditingSteps(false)
    } catch (err) {
      setBodyError(err instanceof Error ? err.message : 'Ошибка')
    } finally {
      setBusy(null)
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
            className="icon-btn"
            onClick={onOpenMeasures}
            aria-label="Обмеры"
            title="Обмеры"
          >
            <MeasureTapeIcon />
          </button>
          <button
            type="button"
            className={`icon-btn profile-btn${profileReady ? '' : ' warn'}`}
            onClick={onOpenProfile}
            aria-label="Профиль и норма калорий"
            title="Профиль"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
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
          size="md"
          approximate={today.approximate}
        />
        <div className="today-hero-side">
          <div className="day-log-grid today-body-grid">
            <div className="panel day-log-card">
              <div className="day-log-head">
                <span className="muted small">Вес</span>
                <div className="btn-row tight">
                  <button
                    type="button"
                    className={`icon-btn sm${chartKind === 'weight' ? ' active' : ''}`}
                    onClick={() => setChartKind((k) => (k === 'weight' ? null : 'weight'))}
                    aria-label="График веса"
                  >
                    <ChartIcon size={14} />
                  </button>
                  {!editingWeight && weight && (
                    <button
                      type="button"
                      className="icon-btn sm"
                      onClick={() => {
                        setKg(String(weight.kg))
                        setEditingWeight(true)
                      }}
                      aria-label="Изменить вес"
                    >
                      <PencilIcon size={14} />
                    </button>
                  )}
                </div>
              </div>
              {!editingWeight && weight ? (
                <strong className="day-log-value">{weight.kg} кг</strong>
              ) : (
                <div className="day-log-edit">
                  <input
                    className="day-log-input"
                    inputMode="decimal"
                    value={kg}
                    onChange={(e) => setKg(e.target.value)}
                    placeholder="62.4"
                  />
                  <button
                    type="button"
                    className="primary-btn day-log-ok"
                    disabled={busy != null}
                    onClick={() => void saveWeight()}
                  >
                    OK
                  </button>
                  {weight && (
                    <button
                      type="button"
                      className="ghost-btn day-log-ok"
                      onClick={() => {
                        setKg(String(weight.kg))
                        setEditingWeight(false)
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="panel day-log-card">
              <div className="day-log-head">
                <span className="muted small">Шаги</span>
                <div className="btn-row tight">
                  <button
                    type="button"
                    className={`icon-btn sm${chartKind === 'steps' ? ' active' : ''}`}
                    onClick={() => setChartKind((k) => (k === 'steps' ? null : 'steps'))}
                    aria-label="График шагов"
                  >
                    <ChartIcon size={14} />
                  </button>
                  {!editingSteps && steps && (
                    <button
                      type="button"
                      className="icon-btn sm"
                      onClick={() => {
                        setStepCount(String(steps.count))
                        setEditingSteps(true)
                      }}
                      aria-label="Изменить шаги"
                    >
                      <PencilIcon size={14} />
                    </button>
                  )}
                </div>
              </div>
              {!editingSteps && steps ? (
                <strong className="day-log-value">{steps.count.toLocaleString('ru-RU')}</strong>
              ) : (
                <div className="day-log-edit">
                  <input
                    className="day-log-input"
                    inputMode="numeric"
                    value={stepCount}
                    onChange={(e) => setStepCount(e.target.value)}
                    placeholder="8000"
                  />
                  <button
                    type="button"
                    className="primary-btn day-log-ok"
                    disabled={busy != null}
                    onClick={() => void saveSteps()}
                  >
                    OK
                  </button>
                  {steps && (
                    <button
                      type="button"
                      className="ghost-btn day-log-ok"
                      onClick={() => {
                        setStepCount(String(steps.count))
                        setEditingSteps(false)
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
          <p className="bju-line muted small">
            Белки {today.totals.protein}
            {today.approximate ? ' ≈' : ''} · Жиры {today.totals.fat} · Углеводы{' '}
            {today.totals.carbs}
          </p>
        </div>
      </div>

      {bodyError && <p className="form-msg error">{bodyError}</p>}

      {chartSeries && (
        <div className="panel chart-panel">
          <div className="section-head">
            <h2 className="subhead" style={{ marginTop: 0 }}>
              {chartSeries.title}
            </h2>
            <button type="button" className="link-btn" onClick={() => setChartKind(null)}>
              Закрыть
            </button>
          </div>
          <TrendChart
            series={chartSeries.series}
            unit={chartSeries.unit}
            height={108}
            minRange={chartSeries.unit === 'кг' ? 3 : undefined}
            variant={chartSeries.variant}
            goal={chartSeries.goal}
          />
        </div>
      )}

      <div className="section-head">
        <h2>Приёмы пищи</h2>
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
                  <span>
                    {Math.round(meal.totals.kcal)} ккал
                    {meal.isApproximate || meal.eatingOut ? ' ≈' : ''}
                  </span>
                </div>
                <p className="meal-preview">{meal.rawText}</p>
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
                  size="sm"
                  approximate={day.approximate}
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
              <WeekCard key={week.weekStart} week={week} />
            ))}
          </div>
        </>
      )}
    </section>
  )
}
