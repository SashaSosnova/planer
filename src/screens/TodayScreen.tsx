import { useEffect, useMemo, useState } from 'react'
import { CalorieRing } from '../components/CalorieRing'
import { MoodDialog } from '../components/MoodDialog'
import { PromptDialog } from '../components/PromptDialog'
import { formatRuDate, todayIso } from '../lib/date'
import { buildTodayTimeline, type WeekStats } from '../lib/dayStats'
import { isHealthStepsSupported } from '../lib/healthSteps'
import { MEAL_TYPE_LABELS } from '../lib/labels'
import { VEG_GOAL_G } from '../lib/macroGoals'
import { formatAvgMood, formatSleepHours, moodLabel } from '../lib/mood'
import {
  getWeekNutritionSummary,
  localWeekNutritionNote,
  weekFingerprint,
} from '../lib/weekSummaryLlm'
import { forecastFromAppData } from '../lib/weightForecast'
import type { AppData, MoodLevel } from '../types'

type PromptKind = 'weight' | 'steps' | 'sleep' | null

type Props = {
  data: AppData
  dailyKcalGoal: number
  maintainKcalGoal: number
  proteinGoal: number | null
  profileReady: boolean
  targetWeightKg: number | null
  cycleLengthDays: number
  periodLengthDays: number
  onAddMeal: () => void
  onOpenMeal: (mealId: string) => void
  onOpenProfile: () => void
  onOpenWeightHistory: () => void
  onOpenStepsHistory: () => void
  onOpenAchievements: () => void
  onSaveWeight: (date: string, kg: number) => Promise<unknown>
  onSaveSteps: (date: string, count: number) => Promise<unknown>
  onSaveCheckIn: (input: {
    date: string
    mood?: MoodLevel | null
    sleepHours?: number | null
  }) => Promise<unknown>
}

type MetaMetric = {
  label: string
  value: string
  mood?: boolean
  onClick?: () => void
}

function MetaStack({ metrics, static: isStatic }: { metrics: MetaMetric[]; static?: boolean }) {
  return (
    <div className="today-meta-stack">
      {metrics.map((m) => {
        const className = `meta-metric${m.mood ? ' meta-metric--mood' : ''}${isStatic ? ' static' : ''}`
        if (isStatic || !m.onClick) {
          return (
            <div key={m.label} className={className}>
              <span>{m.label}</span>
              <strong>{m.value}</strong>
            </div>
          )
        }
        return (
          <button key={m.label} type="button" className={className} onClick={m.onClick}>
            <span>{m.label}</span>
            <strong>{m.value}</strong>
          </button>
        )
      })}
    </div>
  )
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
      ? '—'
      : `${week.weightDelta > 0 ? '+' : ''}${String(week.weightDelta).replace('.', ',')} кг`

  const dayCount = 7
  const avgKcal = week.totals.kcal / dayCount
  const avgProtein = week.totals.protein / dayCount
  const avgFat = week.totals.fat / dayCount
  const avgCarbs = week.totals.carbs / dayCount
  const dailyGoal = week.kcalGoal / dayCount

  return (
    <article className="week-card">
      <h3 className="week-card-title">{week.label}</h3>
      <div className="week-card-top">
        <CalorieRing
          eaten={avgKcal}
          goal={dailyGoal}
          maintainGoal={maintainKcalGoal}
          size="md"
        />
        <MetaStack
          static
          metrics={[
            { label: 'Вес', value: weightLabel },
            {
              label: 'Шаги',
              value:
                week.avgSteps != null ? week.avgSteps.toLocaleString('ru-RU') : '—',
            },
            { label: 'Сон', value: formatSleepHours(week.avgSleepHours) },
            { label: 'Настроение', value: formatAvgMood(week.avgMood), mood: true },
          ]}
        />
      </div>
      <p className="bju-line muted small week-card-macros">
        Белки {Math.round(avgProtein)} · Жиры {Math.round(avgFat)} · Углеводы{' '}
        {Math.round(avgCarbs)}
      </p>
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
  targetWeightKg,
  cycleLengthDays,
  periodLengthDays,
  onAddMeal,
  onOpenMeal,
  onOpenProfile,
  onOpenWeightHistory,
  onOpenStepsHistory,
  onOpenAchievements,
  onSaveWeight,
  onSaveSteps,
  onSaveCheckIn,
}: Props) {
  const date = todayIso()
  const weight = data.weights.find((w) => w.date === date)
  const steps = data.steps.find((s) => s.date === date)

  const [prompt, setPrompt] = useState<PromptKind>(null)
  const [moodOpen, setMoodOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [promptError, setPromptError] = useState<string | null>(null)

  const { today, recentDays, completedWeeks } = useMemo(
    () => buildTodayTimeline(data, dailyKcalGoal, date),
    [data, dailyKcalGoal, date],
  )

  const forecast = useMemo(
    () =>
      forecastFromAppData(data, {
        targetKg: targetWeightKg,
        maintainKcal: maintainKcalGoal,
        cycleLengthDays,
        periodLengthDays,
        today: date,
      }),
    [data, targetWeightKg, maintainKcalGoal, cycleLengthDays, periodLengthDays, date],
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

  const openSleep = () => {
    setPromptError(null)
    setPrompt('sleep')
  }

  const selectMood = async (mood: MoodLevel | null) => {
    setBusy(true)
    try {
      await onSaveCheckIn({ date, mood })
      setMoodOpen(false)
    } catch {
      /* keep dialog open */
    } finally {
      setBusy(false)
    }
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
      return
    }

    if (prompt === 'sleep') {
      const hours = num(raw)
      if (hours == null || hours < 0 || hours > 16) {
        setPromptError('Укажите часы сна от 0 до 16')
        return
      }
      setBusy(true)
      setPromptError(null)
      try {
        await onSaveCheckIn({ date, sleepHours: Math.round(hours * 2) / 2 })
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
        <div className="btn-row tight nowrap">
          <button
            type="button"
            className="icon-btn"
            onClick={onOpenAchievements}
            aria-label="Достижения"
            title="Достижения"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M8 4h8v2.2c0 2.4-1.6 4.4-4 4.8-2.4-.4-4-2.4-4-4.8V4Z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
              <path
                d="M12 11v3M8 20h8M9.5 17h5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
              <path
                d="M6 6H4.5A1.5 1.5 0 0 0 3 7.5V8a3 3 0 0 0 3 3M18 6h1.5A1.5 1.5 0 0 1 21 7.5V8a3 3 0 0 1-3 3"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
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

      {forecast && (
        <div className="progress-card">
          <div className="progress-card-top">
            <span>Прогресс</span>
            <strong>
              {forecast.currentKg.toFixed(1).replace('.', ',')}
              {forecast.targetKg != null
                ? ` → ${forecast.targetKg.toFixed(1).replace('.', ',')} кг`
                : ' кг'}
            </strong>
          </div>
          <p className="muted small">{forecast.summary}</p>
          {forecast.targetKg == null && (
            <p className="muted small">Цель по весу можно задать в профиле.</p>
          )}
          {forecast.notes.map((note) => (
            <p key={note} className="muted small cycle-weight-note">
              {note}
            </p>
          ))}
        </div>
      )}

      <div className="today-hero">
        <div className="today-hero-top">
          <CalorieRing
            eaten={today.totals.kcal}
            goal={dailyKcalGoal}
            maintainGoal={maintainKcalGoal}
            size="md"
          />
          <MetaStack
            metrics={[
              {
                label: 'Вес',
                value: weight ? `${weight.kg} кг` : '—',
                onClick: openWeight,
              },
              {
                label: 'Шаги',
                value: steps ? steps.count.toLocaleString('ru-RU') : '—',
                onClick: openSteps,
              },
              {
                label: 'Сон',
                value: formatSleepHours(today.sleepHours),
                onClick: openSleep,
              },
              {
                label: 'Настроение',
                value: moodLabel(today.mood),
                mood: true,
                onClick: () => setMoodOpen(true),
              },
            ]}
          />
        </div>
        <p className="today-hero-macros bju-line muted small">
          Белки {Math.round(today.totals.protein)}
          {proteinGoal != null ? ` / ${proteinGoal}` : ''} · Жиры{' '}
          {Math.round(today.totals.fat)} · Углеводы {Math.round(today.totals.carbs)}
          {' · '}
          Овощи {today.vegGrams} / {VEG_GOAL_G} г
        </p>
      </div>

      <div className="section-head" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="primary-btn section-cta" onClick={onAddMeal}>
          Добавить приём
        </button>
      </div>

      {today.meals.length === 0 ? (
        <p className="muted">Пока пусто — добавьте первый приём за сегодня.</p>
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
                <strong className="day-summary-title">{day.label}</strong>
                <div className="day-summary-top">
                  <CalorieRing
                    eaten={day.totals.kcal}
                    goal={dailyKcalGoal}
                    maintainGoal={maintainKcalGoal}
                    size="md"
                  />
                  <MetaStack
                    static
                    metrics={[
                      {
                        label: 'Вес',
                        value:
                          day.weightKg != null
                            ? `${String(day.weightKg).replace('.', ',')} кг`
                            : '—',
                      },
                      {
                        label: 'Шаги',
                        value:
                          day.steps != null
                            ? day.steps.toLocaleString('ru-RU')
                            : '—',
                      },
                      { label: 'Сон', value: formatSleepHours(day.sleepHours) },
                      {
                        label: 'Настроение',
                        value: moodLabel(day.mood),
                        mood: true,
                      },
                    ]}
                  />
                </div>
                <p className="bju-line muted small day-summary-macros">
                  Белки {Math.round(day.totals.protein)} · Жиры{' '}
                  {Math.round(day.totals.fat)} · Углеводы {Math.round(day.totals.carbs)}
                </p>
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

      {prompt === 'sleep' && (
        <PromptDialog
          title="Сон прошлой ночью"
          label="Сколько часов?"
          placeholder="например 7.5"
          inputMode="decimal"
          initialValue={today.sleepHours?.toString() ?? ''}
          busy={busy}
          error={promptError}
          onCancel={() => setPrompt(null)}
          onConfirm={(v) => void confirmPrompt(v)}
        />
      )}

      {moodOpen && (
        <MoodDialog
          current={today.mood}
          busy={busy}
          onCancel={() => setMoodOpen(false)}
          onSelect={(mood) => void selectMood(mood)}
        />
      )}
    </section>
  )
}
