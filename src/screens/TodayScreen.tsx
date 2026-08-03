import { useEffect, useMemo, useRef, useState } from 'react'
import { CalorieRing } from '../components/CalorieRing'
import { PromptDialog } from '../components/PromptDialog'
import { cyclePhaseLabel, getCycleInfo } from '../lib/cycle'
import { cycleInsightsFromAppData } from '../lib/cycleCalorieInsights'
import { dayPromptForDate } from '../lib/dayPrompts'
import { formatRuDate, todayIso } from '../lib/date'
import { statsForDate } from '../lib/dayStats'
import { isHealthStepsSupported } from '../lib/healthSteps'
import { MEAL_TYPE_LABELS, mealPreviewText } from '../lib/labels'
import { VEG_GOAL_G } from '../lib/macroGoals'
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
import { DAY_NOTE_MAX } from '../lib/sanitize'
import { buildWeightCheckin } from '../lib/weightCheckin'
import type { AppData, DayNote, MealType } from '../types'

type PromptKind = 'weight' | 'steps' | null

type Props = {
  data: AppData
  dailyKcalGoal: number
  maintainKcalGoal: number
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
  onSaveDayNote: (input: {
    date: string
    text: string
    question?: string
  }) => Promise<DayNote | null>
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
  onSaveDayNote,
}: Props) {
  const date = todayIso()
  const weight = data.weights.find((w) => w.date === date)
  const steps = data.steps.find((s) => s.date === date)
  const medDay = (data.medDays ?? []).find((m) => m.date === date)
  const savedNote = (data.dayNotes ?? []).find((n) => n.date === date)?.text ?? ''

  const [prompt, setPrompt] = useState<PromptKind>(null)
  const [busy, setBusy] = useState(false)
  const [promptError, setPromptError] = useState<string | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const [noteDraft, setNoteDraft] = useState(savedNote)
  const [noteSaving, setNoteSaving] = useState(false)
  const [noteFocused, setNoteFocused] = useState(false)
  const moreOpenRef = useRef(moreOpen)
  moreOpenRef.current = moreOpen
  const promptRef = useRef(prompt)
  promptRef.current = prompt
  const moreRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setNoteDraft(savedNote)
  }, [savedNote, date])

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

  const weightCheckin = useMemo(
    () =>
      buildWeightCheckin({
        weights: data.weights,
        meals: data.meals,
        dailyKcalGoal,
      }),
    [data.weights, data.meals, dailyKcalGoal],
  )

  const cycle = useMemo(
    () => getCycleInfo(data.periodStarts, date, cycleLengthDays, periodLengthDays),
    [data.periodStarts, date, cycleLengthDays, periodLengthDays],
  )
  const cycleInsights = useMemo(
    () =>
      cycleInsightsFromAppData(data, dailyKcalGoal, {
        cycleLengthDays,
        periodLengthDays,
        today: date,
      }),
    [data, dailyKcalGoal, cycleLengthDays, periodLengthDays, date],
  )
  const cycleTip = cycleInsights.tip

  const dayPrompt = useMemo(() => dayPromptForDate(date), [date])
  const noteAnswered = Boolean(savedNote.trim())
  const noteDirty = noteDraft.trim() !== savedNote.trim()

  const saveNote = async () => {
    if (!noteDirty || noteSaving) return
    const text = noteDraft.trim()
    if (!text) return
    setNoteSaving(true)
    try {
      await onSaveDayNote({
        date,
        text,
        question: dayPrompt.question,
      })
    } finally {
      setNoteSaving(false)
    }
  }

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
                    onClick={() => runMore(onOpenDiary)}
                  >
                    <DiaryMenuIcon />
                    <span>Дневник</span>
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

      {weightCheckin && (
        <div className="progress-card">
          <div className="progress-card-top">
            <span>Прогресс</span>
            <strong className={`progress-card-delta ${weightCheckin.tone}`}>
              {weightCheckin.hero}
            </strong>
          </div>
          <p className="muted small">{weightCheckin.note}</p>
        </div>
      )}

      {cycle.phase !== 'unknown' && cycle.dayInCycle != null && (
        <button type="button" className="progress-card progress-card-btn" onClick={onOpenCycle}>
          <div className="progress-card-top">
            <span>Цикл</span>
            <span className="progress-card-value">
              день {cycle.dayInCycle} из {cycleLengthDays} · {cyclePhaseLabel(cycle.phase)}
            </span>
          </div>
          {cycleTip && <p className="muted small">{cycleTip}</p>}
        </button>
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

      {!noteAnswered && (
        <div className="day-note-block">
          <p className="day-note-question">{dayPrompt.question}</p>
          <textarea
            className="day-note-input fixed"
            value={noteDraft}
            maxLength={DAY_NOTE_MAX}
            rows={2}
            placeholder="Ответ…"
            aria-label={dayPrompt.question}
            disabled={noteSaving}
            onChange={(e) => setNoteDraft(e.target.value.slice(0, DAY_NOTE_MAX))}
            onFocus={() => setNoteFocused(true)}
            onBlur={() => {
              setNoteFocused(false)
              void saveNote()
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                ;(e.target as HTMLTextAreaElement).blur()
              }
            }}
          />
          {noteFocused && noteDraft.trim() && (
            <div className="day-note-actions">
              <button
                type="button"
                className="primary-btn"
                disabled={noteSaving || !noteDirty}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void saveNote()}
              >
                {noteSaving ? 'Сохраняю…' : 'Отправить'}
              </button>
            </div>
          )}
        </div>
      )}

      <section className="meal-section" aria-label="Приёмы пищи">
        {today.meals.length > 0 ? (
          <ul className="meal-list">
            {today.meals.map((meal) => {
              const mgDose = mgDoseKeyForMealType(meal.mealType)
              const hasMg = mgDose ? Boolean(medTakenAt(medDay, mgDose)) : false
              const hasFe = mgDose ? Boolean(medTakenAt(medDay, 'iron')) : false
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
