import { useEffect, useMemo, useRef, useState } from 'react'
import { MacroBar } from '../components/MacroBar'
import {
  MealDraftEditor,
  emptyMealItem,
  mealItemFromFood,
  patchDraft,
} from '../components/MealDraftEditor'
import { todayIso } from '../lib/date'
import { isDeepseekConfigured } from '../lib/deepseek'
import {
  MEAL_TYPE_LABELS,
  MEAL_TYPE_ORDER,
  extractMealTypeFromText,
  nextMealType,
} from '../lib/labels'
import { parseMeal } from '../lib/parseMeal'
import { scalePer100g, sumMacros } from '../lib/nutrition'
import type {
  AppData,
  FoodItem,
  MealItem,
  MealParseSource,
  MealType,
  ParsedMealDraft,
} from '../types'
import { CloseIcon } from '../components/CloseIcon'
import { DateField } from '../components/DateField'
import { LibraryScreen } from './LibraryScreen'

const PARSE_SOURCE_LABEL: Record<MealParseSource, string> = {
  library: 'справочник',
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
  onBack,
  onSaveMeal,
  onSaveFood,
  onDeleteFood,
  registerBackHandler,
}: Props) {
  const [view, setView] = useState<View>('meal')
  const [date, setDate] = useState(todayIso())
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
  const viewRef = useRef(view)
  viewRef.current = view

  useEffect(() => {
    if (!registerBackHandler) return
    return registerBackHandler(() => {
      if (viewRef.current !== 'library') return false
      setView('meal')
      return true
    })
  }, [registerBackHandler])

  const foodsRef = useMemo(
    () =>
      data.foods.map((f) => ({
        id: f.id,
        name: f.name,
        aliases: f.aliases,
        per100g: f.per100g,
        kind: f.kind,
      })),
    [data.foods],
  )

  const dayMeals = data.meals
    .filter((m) => m.date === date)
    .sort((a, b) => a.createdAt - b.createdAt)
  const dayMealTypesKey = dayMeals.map((m) => m.mealType).join('|')
  const isToday = date === todayIso()

  useEffect(() => {
    if (mealTypeTouched) return
    const fromText = extractMealTypeFromText(text).mealType
    if (fromText) {
      setMealType(fromText)
      return
    }
    setMealType(nextMealType(dayMealTypesKey.split('|').filter(Boolean) as MealType[]))
  }, [date, dayMealTypesKey, text, mealTypeTouched])

  const runParse = async () => {
    setBusy(true)
    setError(null)
    setInfo(null)
    try {
      const result = await parseMeal(text, foodsRef, mealType, eatingOut)
      setDraft(result)
      setEatingOut(result.eatingOut)
      setMealType(result.mealType)
      const cleaned = extractMealTypeFromText(text).cleaned
      if (cleaned && cleaned !== text.trim()) setText(cleaned)
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
    setBusy(true)
    setError(null)
    try {
      const body =
        extractMealTypeFromText(text).cleaned.trim() ||
        kept.map((i) => i.name).join(', ') ||
        text.trim()
      await onSaveMeal({
        date,
        mealType,
        rawText: body,
        items: kept,
        isApproximate: draft.eatingOut || kept.some((i) => i.source === 'estimate'),
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
      setInfo(`«${saved.name}» добавлен в справочник`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить продукт')
    } finally {
      setSavingFoodIndex(null)
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
          <button type="button" className="link-btn" onClick={onBack}>
            ← Назад
          </button>
          <h1>Добавить приём</h1>
        </div>
        <button type="button" className="link-btn add-library-link" onClick={() => setView('library')}>
          Справочник
        </button>
      </header>

      <div className="meal-type-chips" role="group" aria-label="Тип приёма">
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

      <div className="add-date-row">
        <DateField
          className="add-date-field"
          value={date}
          max={todayIso()}
          onChange={(next) => {
            setDate(next > todayIso() ? todayIso() : next)
            setMealTypeTouched(false)
            setDraft(null)
            setInfo(null)
          }}
        />
        <label className="check-row add-eating-out">
          <input
            type="checkbox"
            checked={eatingOut}
            onChange={(e) => {
              const next = e.target.checked
              setEatingOut(next)
              setDraft((prev) =>
                prev
                  ? {
                      ...prev,
                      eatingOut: next,
                      isApproximate: next || prev.items.some((i) => i.source === 'estimate'),
                    }
                  : prev,
              )
            }}
          />
          <span>Вне дома</span>
        </label>
        {!isToday && (
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              setDate(todayIso())
              setMealTypeTouched(false)
              setDraft(null)
              setInfo(null)
            }}
          >
            Сегодня
          </button>
        )}
      </div>

      <label className="field">
        <textarea
          rows={4}
          value={text}
          onChange={(e) => {
            const value = e.target.value
            setText(value)
            // Draft is tied to the calculated text — invalidate on edit.
            setDraft(null)
            setInfo(null)
            const hinted = extractMealTypeFromText(value).mealType
            if (hinted) {
              setMealType(hinted)
              setMealTypeTouched(false)
            }
          }}
          placeholder="200 г творога, яблоко…"
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
              {draft.eatingOut && <span className="badge">вне дома</span>}
            </div>
          </div>
          <MacroBar totals={draft.totals} />

          <MealDraftEditor
            data={data}
            items={draft.items}
            collapsible
            onChangeItem={(index, patch) =>
              setDraft((prev) => (prev ? patchDraft(prev, index, patch, data.foods) : prev))
            }
            onRemoveItem={(index) =>
              setDraft((prev) => {
                if (!prev) return prev
                const items = prev.items.filter((_, i) => i !== index)
                return {
                  ...prev,
                  items,
                  totals: sumMacros(items),
                  isApproximate: prev.eatingOut || items.some((i) => i.source === 'estimate'),
                }
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
                  isApproximate: true,
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
                  isApproximate: prev.eatingOut || items.some((i) => i.source === 'estimate'),
                }
              })
            }
            estimatingProduct={estimatingProduct}
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
                    isApproximate:
                      prev.eatingOut || items.some((i) => i.source === 'estimate'),
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
              disabled={busy}
              onClick={() => void confirmMeal()}
            >
              Сохранить приём
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={() => setDraft(null)}
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
