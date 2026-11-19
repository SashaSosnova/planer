import { useEffect, useMemo, useRef, useState } from 'react'
import { MacroBar } from '../components/MacroBar'
import {
  MealDraftEditor,
  catalogPickGroups,
  emptyMealItem,
  mealItemFromFood,
  patchDraft,
  removeDraftItem,
} from '../components/MealDraftEditor'
import { todayIso } from '../lib/date'
import { isDeepseekConfigured } from '../lib/deepseek'
import {
  MEAL_TYPE_LABELS,
  MEAL_TYPE_ORDER,
  extractMealTypeFromText,
  mealPreviewText,
  mealRawTextFromItems,
  nextMealType,
} from '../lib/labels'
import {
  applyDraftResolutionMeta,
  inferSavedFoodKind,
  mealItemsAreApproximate,
  mealItemsHaveUnresolved,
  resolveDraftMealType,
} from '../lib/mealDraft'
import { parseMeal } from '../lib/parseMeal'
import { estimateMealItemMacros } from '../lib/parseMealCatalogFirst'
import { cloneMealAsDraft, listRecentMeals } from '../lib/recentMeals'
import { scalePer100g, sumMacros } from '../lib/nutrition'
import type {
  AppData,
  FoodItem,
  Meal,
  MealItem,
  MealParseSource,
  MealType,
  ParsedMealDraft,
} from '../types'
import { CloseIcon } from '../components/CloseIcon'
import { DateField } from '../components/DateField'
import { LibraryScreen } from './LibraryScreen'

const PARSE_SOURCE_LABEL: Record<MealParseSource, string> = {
  library: 'каталог',
  deepseek: 'AI',
  local: 'локально',
  cloud: 'AI',
}

/** Hide routine LLM chatter; DeepSeek only sets notes on rare fallbacks. */
function shouldShowParseNotes(source: MealParseSource): boolean {
  return source === 'library' || source === 'local' || source === 'deepseek'
}

type View = 'meal' | 'library'

type Props = {
  data: AppData
  /** Prefill parse field (e.g. from meal advice composition). */
  prefillText?: string
  initialMealType?: MealType
  /** Prefill meal date (e.g. when adding from a past day). */
  initialDate?: string
  /** Clone this meal into the draft (skip parse). */
  seedMealId?: string
  onBack: () => void
  onSaveMeal: (input: {
    date: string
    mealType: MealType
    rawText: string
    items: MealItem[]
    isApproximate: boolean
    eatingOut: boolean
  }) => Promise<unknown>
  onSaveFood: (input: Omit<FoodItem, 'id' | 'updatedAt'> & { id?: string }) => Promise<FoodItem>
  onDeleteFood: (id: string) => Promise<void>
  registerBackHandler?: (fn: () => boolean) => () => void
}

export function AddMealScreen({
  data,
  prefillText,
  initialMealType,
  initialDate,
  seedMealId,
  onBack,
  onSaveMeal,
  onSaveFood,
  onDeleteFood,
  registerBackHandler,
}: Props) {
  const [view, setView] = useState<View>('meal')
  const [date, setDate] = useState(() => {
    const today = todayIso()
    if (!initialDate) return today
    return initialDate > today ? today : initialDate
  })
  const [eatingOut, setEatingOut] = useState(false)
  const [mealType, setMealType] = useState<MealType>(initialMealType ?? 'breakfast')
  const [mealTypeTouched, setMealTypeTouched] = useState(Boolean(initialMealType))
  const [text, setText] = useState(prefillText?.trim() ?? '')
  const [draft, setDraft] = useState<ParsedMealDraft | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [savingFoodIndex, setSavingFoodIndex] = useState<number | null>(null)
  const [estimatingProduct, setEstimatingProduct] = useState(false)
  const [estimatingItemIndex, setEstimatingItemIndex] = useState<number | null>(null)
  const viewRef = useRef(view)
  viewRef.current = view
  const seedAppliedRef = useRef(false)
  const textAreaRef = useRef<HTMLTextAreaElement>(null)
  /** Text that produced the current draft — edit only clears draft when it diverges. */
  const parsedTextRef = useRef<string | null>(null)

  const applyRepeatMeal = (meal: Meal) => {
    const next = cloneMealAsDraft(meal)
    setDraft(next)
    setEatingOut(next.eatingOut)
    setMealType(next.mealType)
    setMealTypeTouched(true)
    const body = meal.rawText || mealPreviewText(meal)
    setText(body)
    parsedTextRef.current = body
    setInfo(next.notes ?? null)
    setError(null)
  }

  useEffect(() => {
    if (!seedMealId || seedAppliedRef.current) return
    const meal = data.meals.find((m) => m.id === seedMealId)
    if (!meal) return
    seedAppliedRef.current = true
    applyRepeatMeal(meal)
  }, [seedMealId, data.meals])

  const draftRef = useRef(draft)
  draftRef.current = draft

  useEffect(() => {
    if (!registerBackHandler) return
    return registerBackHandler(() => {
      if (viewRef.current === 'library') {
        setView('meal')
        return true
      }
      if (draftRef.current && draftRef.current.items.some((i) => i.name.trim())) {
        if (!confirm('Закрыть без сохранения черновика?')) return true
      }
      onBack()
      return true
    })
  }, [registerBackHandler, onBack])

  const requestLeave = () => {
    if (draft && draft.items.some((i) => i.name.trim())) {
      if (!confirm('Закрыть без сохранения черновика?')) return
    }
    onBack()
  }

  const clearDraftForDateChange = (next: string) => {
    if (draft && draft.items.some((i) => i.name.trim())) {
      if (!confirm('Сменить дату и сбросить черновик?')) return false
    }
    setDate(next > todayIso() ? todayIso() : next)
    setMealTypeTouched(false)
    setDraft(null)
    setInfo(null)
    parsedTextRef.current = null
    return true
  }

  const foodsRef = useMemo(
    () =>
      data.foods.map((f) => ({
        id: f.id,
        name: f.name,
        aliases: f.aliases,
        per100g: f.per100g,
        kind: f.kind,
        ...(f.portionGrams != null && f.portionGrams > 0
          ? { portionGrams: f.portionGrams }
          : {}),
      })),
    [data.foods],
  )

  const recentMeals = useMemo(
    () => listRecentMeals(data.meals, Number.POSITIVE_INFINITY, mealType),
    [data.meals, mealType],
  )
  const [recentShown, setRecentShown] = useState(10)
  useEffect(() => {
    setRecentShown(10)
  }, [mealType])
  const visibleRecent = recentMeals.slice(0, recentShown)

  const dayMeals = data.meals
    .filter((m) => m.date === date)
    .sort((a, b) => a.createdAt - b.createdAt)
  const dayMealTypesKey = dayMeals.map((m) => m.mealType).join('|')
  const isToday = date === todayIso()

  useEffect(() => {
    if (mealTypeTouched) return
    const fromText = extractMealTypeFromText(text).mealType
    const next =
      fromText ?? nextMealType(dayMealTypesKey.split('|').filter(Boolean) as MealType[])
    setMealType((prev) => (prev === next ? prev : next))
  }, [date, dayMealTypesKey, text, mealTypeTouched])

  const runParse = async () => {
    setBusy(true)
    setError(null)
    setInfo(null)
    const selectedType = mealType
    const typeTouched = mealTypeTouched
    try {
      const result = await parseMeal(text, foodsRef, selectedType, eatingOut)
      const nextType = resolveDraftMealType({
        text,
        userMealType: selectedType,
        mealTypeTouched: typeTouched,
        parsedMealType: result.mealType,
        extractFromText: extractMealTypeFromText,
      })
      setDraft({ ...result, mealType: nextType })
      setEatingOut(result.eatingOut)
      setMealType(nextType)
      setMealTypeTouched(true)
      const cleaned = extractMealTypeFromText(text).cleaned
      const nextText = cleaned && cleaned !== text.trim() ? cleaned : text
      if (nextText !== text) setText(nextText)
      parsedTextRef.current = nextText
      if (result.notes && shouldShowParseNotes(result.parseSource)) setInfo(result.notes)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось разобрать')
    } finally {
      setBusy(false)
    }
  }

  const confirmMeal = async () => {
    if (!draft) return
    const kept = draft.items.filter((i) => i.name.trim())
    if (kept.length === 0) {
      setError('Добавьте хотя бы один продукт')
      return
    }
    if (mealItemsHaveUnresolved(kept, data.foods)) {
      setError('Уточните продукты в каталоге или оцените КБЖУ перед сохранением')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const body =
        mealRawTextFromItems(kept) ||
        extractMealTypeFromText(text).cleaned.trim() ||
        text.trim()
      await onSaveMeal({
        date,
        mealType,
        rawText: body,
        items: kept,
        isApproximate: mealItemsAreApproximate(draft.eatingOut, kept),
        eatingOut: draft.eatingOut,
      })
      onBack()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить')
    } finally {
      setBusy(false)
    }
  }

  const saveToLibrary = async (index: number) => {
    if (!draft || savingFoodIndex != null) return
    const item = draft.items[index]
    if (!item || item.source === 'library') return
    if (!(item.grams > 0)) {
      setError('Укажите граммы, чтобы сохранить продукт на 100 г')
      return
    }
    setSavingFoodIndex(index)
    setError(null)
    try {
      const k = 100 / item.grams
      const saved = await onSaveFood({
        name: item.name.trim(),
        aliases: [],
        kind: inferSavedFoodKind(item.name),
        portionGrams: item.grams > 0 ? item.grams : undefined,
        per100g: {
          kcal: Math.round(item.kcal * k * 10) / 10,
          protein: Math.round(item.protein * k * 10) / 10,
          fat: Math.round(item.fat * k * 10) / 10,
          carbs: Math.round(item.carbs * k * 10) / 10,
        },
      })
      const macros = scalePer100g(saved.per100g, item.grams)
      setDraft((prev) =>
        prev
          ? patchDraft(
              prev,
              index,
              { foodId: saved.id, name: saved.name, source: 'library', ...macros },
              [...data.foods.filter((f) => f.id !== saved.id), saved],
            )
          : prev,
      )
      setInfo(`«${saved.name}» добавлен в каталог`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить продукт')
    } finally {
      setSavingFoodIndex(null)
    }
  }

  const estimateItemAt = async (index: number) => {
    if (!draft || estimatingItemIndex != null) return
    const item = draft.items[index]
    if (!item?.name.trim()) return
    setEstimatingItemIndex(index)
    setError(null)
    try {
      const grams = item.grams > 0 ? item.grams : 100
      const nextItem = await estimateMealItemMacros(item.name.trim(), grams)
      setDraft((prev) => {
        if (!prev) return prev
        const items = prev.items.map((it, i) => (i === index ? nextItem : it))
        const stillNeedsClarify = items.some((i) => {
          if (!i.name.trim() || i.source !== 'unknown') return false
          if (i.foodId && data.foods.some((f) => f.id === i.foodId)) return false
          return catalogPickGroups(i.name, data.foods).primary.length >= 2
        })
        return applyDraftResolutionMeta(
          {
            ...prev,
            items,
            totals: sumMacros(items.filter((row) => row.name.trim())),
            isApproximate: true,
          },
          stillNeedsClarify,
        )
      })
      setInfo(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось оценить')
    } finally {
      setEstimatingItemIndex(null)
    }
  }

  const selectMealType = (next: MealType) => {
    setMealTypeTouched(true)
    setMealType(next)
    setDraft((prev) => (prev ? { ...prev, mealType: next } : prev))
  }

  if (view === 'library') {
    return (
      <LibraryScreen
        data={data}
        onBack={() => setView('meal')}
        onSaveFood={onSaveFood}
        onDeleteFood={onDeleteFood}
        backLabel="← К добавлению"
      />
    )
  }

  return (
    <section className="screen">
      <header className="screen-header add-header">
        <div className="add-header-main">
          <button type="button" className="link-btn" onClick={requestLeave}>
            ← Назад
          </button>
          <h1>Добавить приём</h1>
        </div>
        <button type="button" className="link-btn add-library-link" onClick={() => setView('library')}>
          Каталог
        </button>
      </header>

      <div className="add-date-row">
        <DateField
          className="add-date-field"
          value={date}
          max={todayIso()}
          onChange={(next) => {
            clearDraftForDateChange(next)
          }}
        />
        <div className="meal-type-chips add-meal-type-chips" role="group" aria-label="Тип приёма">
          {MEAL_TYPE_ORDER.map((key) => (
            <button
              key={key}
              type="button"
              className={`meal-type-chip${mealType === key ? ' active' : ''}`}
              onClick={() => selectMealType(key)}
            >
              {MEAL_TYPE_LABELS[key]}
            </button>
          ))}
        </div>
        {!isToday && (
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              clearDraftForDateChange(todayIso())
            }}
          >
            Сегодня
          </button>
        )}
      </div>

      <label className="field">
        <textarea
          ref={textAreaRef}
          rows={4}
          value={text}
          onChange={(e) => {
            const el = e.target
            const value = el.value
            const selStart = el.selectionStart
            const selEnd = el.selectionEnd
            setText(value)
            // Only tear down draft when the source text actually changed after parse.
            // Clearing draft mid-keystroke remounts a large panel and resets the caret
            // (typing appears reversed) in WebKit/Electron.
            if (draft != null && value !== parsedTextRef.current) {
              setDraft(null)
              setInfo(null)
              parsedTextRef.current = null
            }
            const hinted = extractMealTypeFromText(value).mealType
            if (hinted) {
              setMealType(hinted)
              setMealTypeTouched(false)
            }
            // Restore caret after React commits the controlled value.
            queueMicrotask(() => {
              const node = textAreaRef.current
              if (!node || document.activeElement !== node) return
              if (node.value !== value) return
              try {
                node.setSelectionRange(selStart, selEnd)
              } catch {
                /* ignore */
              }
            })
          }}
          placeholder={'Творог 200 г\nЯблоко 100 г\n...'}
          aria-label="Что было съедено и сколько граммов"
        />
      </label>

      <button
        type="button"
        className="primary-btn"
        disabled={busy || !text.trim()}
        onClick={() => void runParse()}
      >
        {busy ? 'Считаю…' : 'Рассчитать'}
      </button>

      {!draft && recentMeals.length > 0 && (
        <div className="recent-meals">
          <h2 className="recent-meals-title">Недавние</h2>
          <ul className="recent-meals-list">
            {visibleRecent.map((meal) => (
              <li key={meal.id}>
                <button
                  type="button"
                  className="recent-meal-btn"
                  onClick={() => applyRepeatMeal(meal)}
                >
                  <span className="recent-meal-type">{MEAL_TYPE_LABELS[meal.mealType]}</span>
                  <span className="recent-meal-preview">{mealPreviewText(meal)}</span>
                  <span className="muted small">
                    {Math.round(meal.totals.kcal)} ккал
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {recentMeals.length > visibleRecent.length && (
            <button
              type="button"
              className="recent-meals-more"
              onClick={() => setRecentShown((n) => n + 10)}
            >
              Ещё
            </button>
          )}
        </div>
      )}

      {error && (
        <div className="form-msg-block">
          <p className="form-msg error">{error}</p>
          {!isDeepseekConfigured() && (
            <p className="muted small">Умный разбор выключен — используется локальный парсер.</p>
          )}
        </div>
      )}
      {info && <p className="form-msg">{info}</p>}

      {draft && (
        <div className="panel confirm-panel">
          <div className="section-head">
            <h2>{MEAL_TYPE_LABELS[draft.mealType]}</h2>
            <div className="badge-row">
              <span
                className={
                  draft.parseSource === 'deepseek' || draft.parseSource === 'library'
                    ? 'badge ok'
                    : 'badge'
                }
              >
                {PARSE_SOURCE_LABEL[draft.parseSource]}
              </span>
            </div>
          </div>
          <MacroBar
            totals={draft.totals}
            incomplete={mealItemsHaveUnresolved(draft.items, data.foods)}
          />

          <MealDraftEditor
            data={data}
            items={draft.items}
            collapsible
            onChangeItem={(index, patch) =>
              setDraft((prev) => {
                if (!prev) return prev
                const next = patchDraft(prev, index, patch, data.foods)
                if (next.notes !== prev.notes) {
                  setInfo(next.notes ?? null)
                }
                return next
              })
            }
            onRemoveItem={(index) =>
              setDraft((prev) => {
                if (!prev) return prev
                const next = removeDraftItem(prev, index, data.foods)
                if (next.notes !== prev.notes) {
                  setInfo(next.notes ?? null)
                }
                return next
              })
            }
            onAddItem={(seed) =>
              setDraft((prev) => {
                if (!prev) return prev
                const items = [...prev.items, { ...emptyMealItem(), ...seed }]
                return {
                  ...prev,
                  items,
                  totals: sumMacros(items),
                  isApproximate: mealItemsAreApproximate(prev.eatingOut, items),
                }
              })
            }
            onAddFromFood={(food) =>
              setDraft((prev) => {
                if (!prev) return prev
                const items = [...prev.items, mealItemFromFood(food)]
                return {
                  ...prev,
                  items,
                  totals: sumMacros(items),
                  isApproximate: mealItemsAreApproximate(prev.eatingOut, items),
                }
              })
            }
            estimatingProduct={estimatingProduct}
            estimatingItemIndex={estimatingItemIndex}
            onEstimateItem={(index) => estimateItemAt(index)}
            onEstimateProduct={async (line) => {
              setEstimatingProduct(true)
              setError(null)
              try {
                const result = await parseMeal(line, foodsRef, mealType)
                setDraft((prev) => {
                  if (!prev) return prev
                  const items = [...prev.items, ...result.items]
                  return {
                    ...prev,
                    items,
                    totals: sumMacros(items),
                    isApproximate: mealItemsAreApproximate(prev.eatingOut, items),
                    notes: result.notes ?? prev.notes,
                  }
                })
                if (result.notes && shouldShowParseNotes(result.parseSource)) {
                  setInfo(result.notes)
                }
              } finally {
                setEstimatingProduct(false)
              }
            }}
            onSaveToLibrary={(index) => void saveToLibrary(index)}
            savingFoodIndex={savingFoodIndex}
          />

          <div className="btn-row">
            <button
              type="button"
              className="primary-btn"
              disabled={busy || mealItemsHaveUnresolved(draft.items, data.foods)}
              title={
                mealItemsHaveUnresolved(draft.items, data.foods)
                  ? 'Сначала уточните продукты или оцените КБЖУ'
                  : undefined
              }
              onClick={() => void confirmMeal()}
            >
              Сохранить приём
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={() => {
                setDraft(null)
                parsedTextRef.current = null
              }}
              aria-label="Закрыть"
              title="Закрыть"
            >
              <CloseIcon size={20} />
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
