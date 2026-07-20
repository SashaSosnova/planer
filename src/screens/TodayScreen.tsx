import { useEffect, useMemo, useRef, useState } from 'react'
import { CalorieRing } from '../components/CalorieRing'
import { PromptDialog } from '../components/PromptDialog'
import { dayBrief } from '../lib/dayBrief'
import { dayPromptForDate } from '../lib/dayPrompts'
import { formatRuDate, todayIso } from '../lib/date'
import { statsForDate } from '../lib/dayStats'
import { isHealthStepsSupported } from '../lib/healthSteps'
import { MEAL_TYPE_LABELS } from '../lib/labels'
import { VEG_GOAL_G } from '../lib/macroGoals'
import { LikeIcon, DislikeIcon } from '../components/VoteIcons'
import {
  formatIdeaMacros,
  mealSlotForHour,
  mealSuggestions,
  slotKcalBudget,
  type MealSlot,
  type MealSuggestion,
} from '../lib/mealSuggestions'
import { getMealIdeas } from '../lib/mealSuggestionsLlm'
import { DAY_NOTE_MAX } from '../lib/sanitize'
import type { TastePrefs } from '../lib/settings'
import { forecastFromAppData } from '../lib/weightForecast'
import type { AppData, DayNote } from '../types'

const ADVICE_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack']

type PromptKind = 'weight' | 'steps' | null

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
  onOpenDiary: () => void
  onOpenHistory: () => void
  onOpenMeasures: () => void
  onOpenTastes: () => void
  /** Register nested back handler; return unregister. */
  registerBackHandler?: (fn: () => boolean) => () => void
  /** When false (overlay open), Today does not own the back stack. */
  backEnabled?: boolean
  tastePrefs: TastePrefs
  onRateMealIdea: (title: string, vote: 'like' | 'dislike') => void
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
  targetWeightKg,
  cycleLengthDays,
  periodLengthDays,
  onAddMeal,
  onOpenMeal,
  onOpenProfile,
  onOpenWeightHistory,
  onOpenStepsHistory,
  onOpenAchievements,
  onOpenDiary,
  onOpenHistory,
  onOpenMeasures,
  onOpenTastes,
  registerBackHandler,
  backEnabled = true,
  tastePrefs,
  onRateMealIdea,
  onSaveWeight,
  onSaveSteps,
  onSaveDayNote,
}: Props) {
  const date = todayIso()
  const weight = data.weights.find((w) => w.date === date)
  const steps = data.steps.find((s) => s.date === date)
  const savedNote = (data.dayNotes ?? []).find((n) => n.date === date)?.text ?? ''

  const [prompt, setPrompt] = useState<PromptKind>(null)
  const [busy, setBusy] = useState(false)
  const [promptError, setPromptError] = useState<string | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const [noteDraft, setNoteDraft] = useState(savedNote)
  const [noteSaving, setNoteSaving] = useState(false)
  const [adviceOpen, setAdviceOpen] = useState(false)
  const [adviceSlot, setAdviceSlot] = useState<MealSlot>(() =>
    mealSlotForHour(new Date().getHours()),
  )
  const [suggestions, setSuggestions] = useState<MealSuggestion[]>([])
  const [ideasLoading, setIdeasLoading] = useState(false)
  const [openIdea, setOpenIdea] = useState<MealSuggestion | null>(null)
  const moreOpenRef = useRef(moreOpen)
  moreOpenRef.current = moreOpen
  const adviceOpenRef = useRef(adviceOpen)
  adviceOpenRef.current = adviceOpen
  const openIdeaRef = useRef(openIdea)
  openIdeaRef.current = openIdea
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
      if (openIdeaRef.current) {
        setOpenIdea(null)
        return true
      }
      if (adviceOpenRef.current) {
        setAdviceOpen(false)
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

  const likedSet = useMemo(
    () => new Set(tastePrefs.likes.map((x) => x.trim().toLowerCase())),
    [tastePrefs.likes],
  )

  useEffect(() => {
    if (!adviceOpen) return
    let cancelled = false
    const eaten = today.totals.kcal
    const budget = slotKcalBudget(dailyKcalGoal, eaten, adviceSlot)
    const local = mealSuggestions(new Date(), tastePrefs, 3, adviceSlot, budget?.maxKcal)
    setSuggestions(local)
    setIdeasLoading(true)
    void getMealIdeas({
      data,
      prefs: tastePrefs,
      slot: adviceSlot,
      kcalGoal: dailyKcalGoal,
    })
      .then((list) => {
        if (!cancelled) setSuggestions(list)
      })
      .finally(() => {
        if (!cancelled) setIdeasLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [adviceOpen, adviceSlot, data, tastePrefs, dailyKcalGoal, today.totals.kcal])

  const todayBrief = useMemo(() => dayBrief(today, dailyKcalGoal), [today, dailyKcalGoal])
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
    <section className="screen">
      <header className="screen-header today-header">
        <div>
          <p className="eyebrow">Сегодня</p>
          <h1>{formatRuDate(date)}</h1>
        </div>
        <div className="btn-row tight nowrap">
          <div className="more-anchor" ref={moreRef}>
            <button
              type="button"
              className={`text-btn${moreOpen ? ' active' : ''}`}
              onClick={() => setMoreOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={moreOpen}
            >
              Ещё
            </button>
            {moreOpen && (
              <div className="more-popover" role="menu" aria-label="Ещё">
                <button
                  type="button"
                  role="menuitem"
                  className="more-sheet-item"
                  onClick={() => runMore(onOpenDiary)}
                >
                  Дневник
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="more-sheet-item"
                  onClick={() => runMore(onOpenHistory)}
                >
                  История
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="more-sheet-item"
                  onClick={() => runMore(onOpenMeasures)}
                >
                  Обмеры
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="more-sheet-item"
                  onClick={() => runMore(onOpenTastes)}
                >
                  Вкусы
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="more-sheet-item quiet"
                  onClick={() => runMore(onOpenAchievements)}
                >
                  Достижения
                </button>
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
            onBlur={() => void saveNote()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                ;(e.target as HTMLTextAreaElement).blur()
              }
            }}
          />
        </div>
      )}

      {todayBrief && <p className="day-brief muted small">{todayBrief}</p>}

      <div className="section-head meal-actions">
        <button
          type="button"
          className={`ghost-btn section-cta${adviceOpen ? ' active-soft' : ''}`}
          onClick={() => setAdviceOpen((v) => !v)}
        >
          {adviceOpen ? 'Скрыть совет' : 'Нужен совет'}
        </button>
        <button type="button" className="primary-btn section-cta" onClick={onAddMeal}>
          Добавить приём
        </button>
      </div>

      {adviceOpen && (
        <div className="meal-advice">
          <div className="meal-type-chips" role="group" aria-label="На какой приём совет">
            {ADVICE_SLOTS.map((slot) => (
              <button
                key={slot}
                type="button"
                className={`meal-type-chip${adviceSlot === slot ? ' active' : ''}`}
                onClick={() => setAdviceSlot(slot)}
              >
                {MEAL_TYPE_LABELS[slot]}
              </button>
            ))}
          </div>
          {ideasLoading && suggestions.length === 0 ? (
            <p className="muted small">Думаю…</p>
          ) : (
            <ul className="meal-ideas">
              {suggestions.map((s) => {
                const liked = likedSet.has(s.title.trim().toLowerCase())
                return (
                  <li key={s.id} className="meal-idea-row">
                    <button
                      type="button"
                      className="meal-idea-main"
                      onClick={() => setOpenIdea(s)}
                    >
                      <span className="meal-idea-title">{s.title}</span>
                      <span className="meal-idea-macros muted small">{formatIdeaMacros(s)}</span>
                    </button>
                    <div className="meal-idea-votes">
                      <button
                        type="button"
                        className={`vote-btn${liked ? ' active' : ''}`}
                        aria-label="Нравится"
                        title="Нравится"
                        onClick={() => onRateMealIdea(s.title, 'like')}
                      >
                        <LikeIcon size={17} />
                      </button>
                      <button
                        type="button"
                        className="vote-btn"
                        aria-label="Не предлагать"
                        title="Не предлагать"
                        onClick={() => onRateMealIdea(s.title, 'dislike')}
                      >
                        <DislikeIcon size={17} />
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      {openIdea && (
        <div className="modal-backdrop" role="presentation" onClick={() => setOpenIdea(null)}>
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="meal-idea-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="meal-idea-title" className="subhead" style={{ marginTop: 0 }}>
              {openIdea.title}
            </h2>
            <p className="meal-bju">{formatIdeaMacros(openIdea)}</p>
            {openIdea.ingredients ? (
              <p className="meal-idea-detail-block">
                <span className="muted small">Состав</span>
                <br />
                {openIdea.ingredients}
              </p>
            ) : null}
            {openIdea.recipe ? (
              <p className="meal-idea-detail-block">
                <span className="muted small">Как сделать</span>
                <br />
                {openIdea.recipe}
              </p>
            ) : null}
            <div className="btn-row">
              <button type="button" className="primary-btn" onClick={() => setOpenIdea(null)}>
                Понятно
              </button>
            </div>
          </div>
        </div>
      )}

      {today.meals.length > 0 && (
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
