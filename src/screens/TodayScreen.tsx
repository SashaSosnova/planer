import { useEffect, useMemo, useRef, useState } from 'react'
import { CalorieRing } from '../components/CalorieRing'
import { PromptDialog } from '../components/PromptDialog'
import { cyclePhaseLabel, getCycleInfo } from '../lib/cycle'
import { cycleInsightsFromAppData } from '../lib/cycleCalorieInsights'
import { dayPromptForDate } from '../lib/dayPrompts'
import { formatRuDate, todayIso } from '../lib/date'
import { statsForDate } from '../lib/dayStats'
import { isHealthStepsSupported } from '../lib/healthSteps'
import { MEAL_TYPE_LABELS, mealBodyText } from '../lib/labels'
import { VEG_GOAL_G } from '../lib/macroGoals'
import { AppsGridIcon } from '../components/AppsGridIcon'
import { CloseIcon } from '../components/CloseIcon'
import { LightbulbIcon } from '../components/LightbulbIcon'
import {
  DiaryMenuIcon,
  HistoryMenuIcon,
  LibraryMenuIcon,
  MeasuresMenuIcon,
  TastesMenuIcon,
} from '../components/MoreMenuIcons'
import { PlusIcon } from '../components/PlusIcon'
import { LikeIcon, DislikeIcon } from '../components/VoteIcons'
import {
  applyTasteFeedback,
  canonicalMealKey,
  formatIdeaMacros,
  mealSlotForHour,
  type MealSlot,
  type MealSuggestion,
} from '../lib/mealSuggestions'
import { getMealIdeas } from '../lib/mealSuggestionsLlm'
import { DAY_NOTE_MAX } from '../lib/sanitize'
import type { TastePrefs } from '../lib/settings'
import { forecastFromAppData } from '../lib/weightForecast'
import type { AppData, DayNote, MealType } from '../types'

const ADVICE_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack']

type PromptKind = 'weight' | 'steps' | null

function dedupeAdviceIdeas(list: MealSuggestion[]): MealSuggestion[] {
  const seen = new Set<string>()
  const out: MealSuggestion[] = []
  for (const item of list) {
    const key = canonicalMealKey(item.title)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}


type Props = {
  data: AppData
  dailyKcalGoal: number
  maintainKcalGoal: number
  proteinGoal: number | null
  profileReady: boolean
  targetWeightKg: number | null
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
  onOpenTastes: () => void
  onOpenLibrary: () => void
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
  onOpenCycle,
  onOpenWeightHistory,
  onOpenStepsHistory,
  onOpenDiary,
  onOpenHistory,
  onOpenMeasures,
  onOpenTastes,
  onOpenLibrary,
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
  /** Session for which a full list was successfully applied (reopen keeps it). */
  const adviceReadySessionRef = useRef<string | null>(null)
  /** Bumps to ignore stale getMealIdeas results (load vs dislike race). */
  const adviceReqRef = useRef(0)
  const dataRef = useRef(data)
  dataRef.current = data
  const tastePrefsRef = useRef(tastePrefs)
  tastePrefsRef.current = tastePrefs
  const dailyKcalGoalRef = useRef(dailyKcalGoal)
  dailyKcalGoalRef.current = dailyKcalGoal
  const suggestionsRef = useRef(suggestions)
  suggestionsRef.current = suggestions

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
        dailyKcalGoal,
        cycleLengthDays,
        periodLengthDays,
        today: date,
      }),
    [
      data,
      targetWeightKg,
      maintainKcalGoal,
      dailyKcalGoal,
      cycleLengthDays,
      periodLengthDays,
      date,
    ],
  )

  const progressDelta = useMemo(() => {
    if (!forecast) return null
    const fmtKg = (n: number) => n.toFixed(1).replace('.', ',')
    const lostKg = Math.round((forecast.startKg - forecast.currentKg) * 10) / 10
    return {
      hero:
        lostKg > 0
          ? `−${fmtKg(lostKg)} кг`
          : lostKg < 0
            ? `+${fmtKg(-lostKg)} кг`
            : '0 кг',
      tone: lostKg > 0 ? 'down' : lostKg < 0 ? 'up' : 'flat',
    }
  }, [forecast])

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

  const likedSet = useMemo(
    () => new Set(tastePrefs.likes.map((x) => canonicalMealKey(x))),
    [tastePrefs.likes],
  )

  useEffect(() => {
    if (!adviceOpen) return
    const session = `${date}|${adviceSlot}`
    if (
      adviceReadySessionRef.current === session &&
      suggestionsRef.current.length > 0
    ) {
      return
    }
    const req = ++adviceReqRef.current
    let cancelled = false
    const prefs = tastePrefsRef.current
    // Wait for getMealIdeas (LLM or local fallback) — no flash of a temporary list.
    setSuggestions([])
    setIdeasLoading(true)
    void getMealIdeas({
      data: dataRef.current,
      prefs,
      slot: adviceSlot,
      kcalGoal: dailyKcalGoalRef.current,
      limit: 3,
    })
      .then((list) => {
        if (cancelled || req !== adviceReqRef.current) return
        setSuggestions(dedupeAdviceIdeas(list).slice(0, 3))
        adviceReadySessionRef.current = session
      })
      .finally(() => {
        if (!cancelled && req === adviceReqRef.current) setIdeasLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [adviceOpen, adviceSlot, date])

  const handleDislikeIdea = (idea: MealSuggestion) => {
    const key = canonicalMealKey(idea.title)
    onRateMealIdea(idea.title, 'dislike')
    // Invalidate in-flight initial load so it cannot overwrite / append later.
    const req = ++adviceReqRef.current
    setIdeasLoading(false)
    const excludeTitles = suggestionsRef.current.map((x) => x.title)
    setSuggestions((prev) =>
      dedupeAdviceIdeas(prev.filter((x) => canonicalMealKey(x.title) !== key)).slice(0, 3),
    )
    const prefs = applyTasteFeedback(tastePrefsRef.current, idea.title, 'dislike')
    void getMealIdeas({
      data: dataRef.current,
      prefs,
      slot: adviceSlot,
      kcalGoal: dailyKcalGoalRef.current,
      limit: 1,
      excludeTitles,
      skipCache: true,
    }).then((list) => {
      if (req !== adviceReqRef.current) return
      const one = list[0]
      if (!one) return
      const oneKey = canonicalMealKey(one.title)
      setSuggestions((cur) => {
        if (cur.length >= 3) return cur.slice(0, 3)
        if (cur.some((x) => canonicalMealKey(x.title) === oneKey)) return cur.slice(0, 3)
        return dedupeAdviceIdeas([
          ...cur,
          { ...one, id: `${one.id}-r${Date.now()}` },
        ]).slice(0, 3)
      })
    })
  }

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
                    onClick={() => runMore(onOpenDiary)}
                  >
                    <DiaryMenuIcon />
                    <span>Дневник</span>
                  </button>
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
                    onClick={() => runMore(onOpenMeasures)}
                  >
                    <MeasuresMenuIcon />
                    <span>Обмеры</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="more-grid-item"
                    onClick={() => runMore(onOpenTastes)}
                  >
                    <TastesMenuIcon />
                    <span>Вкусы</span>
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

      {forecast && progressDelta && (
        <div className="progress-card">
          <div className="progress-card-top">
            <span>Прогресс</span>
            <strong className={`progress-card-delta ${progressDelta.tone}`}>
              {progressDelta.hero}
            </strong>
          </div>
          <p className="muted small">{forecast.summary}</p>
          {forecast.targetKg == null && (
            <p className="muted small">Цель по весу можно задать в профиле.</p>
          )}
          {forecast.notes
            .filter((note) => note !== cycle.weightNote)
            .map((note) => (
              <p key={note} className="muted small cycle-weight-note">
                {note}
              </p>
            ))}
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

      <section className="meal-section" aria-label="Приёмы пищи">
        <div className="meal-toolbar">
          <button
            type="button"
            className={`meal-ideas-btn${adviceOpen ? ' active' : ''}`}
            onClick={() => setAdviceOpen((v) => !v)}
            aria-label={adviceOpen ? 'Скрыть идеи' : 'Идеи для приёма'}
            aria-pressed={adviceOpen}
          >
            <LightbulbIcon size={18} />
            <span>{adviceOpen ? 'Скрыть идеи' : 'Идеи'}</span>
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
                  const liked = likedSet.has(canonicalMealKey(s.title))
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
                          onClick={() => handleDislikeIdea(s)}
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

        {today.meals.length > 0 ? (
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
                  <p className="meal-preview">{mealBodyText(meal.rawText)}</p>
                  <p className="meal-bju">
                    Б {Math.round(meal.totals.protein)} · Ж {Math.round(meal.totals.fat)} · У{' '}
                    {Math.round(meal.totals.carbs)}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          !adviceOpen && (
            <p className="muted small meal-section-empty">Пока пусто — идеи или +</p>
          )
        )}
      </section>

      {!openIdea && !prompt && (
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

      {openIdea && (
        <div className="modal-backdrop" role="presentation" onClick={() => setOpenIdea(null)}>
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="meal-idea-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-card-head">
              <h2 id="meal-idea-title" className="subhead">
                {openIdea.title}
              </h2>
              <button
                type="button"
                className="icon-btn sm"
                aria-label="Закрыть"
                title="Закрыть"
                onClick={() => setOpenIdea(null)}
              >
                <CloseIcon size={18} />
              </button>
            </div>
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
              <button
                type="button"
                className="primary-btn"
                onClick={() => {
                  const composition = openIdea.ingredients.trim() || openIdea.title
                  setOpenIdea(null)
                  onAddMeal({ text: composition, mealType: adviceSlot })
                }}
              >
                В расчёт
              </button>
            </div>
          </div>
        </div>
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
