import { useEffect, useRef, useState } from 'react'
import {
  MealDraftEditor,
  applyItemPatch,
  emptyMealItem,
  mealItemFromFood,
} from '../components/MealDraftEditor'
import { DateField } from '../components/DateField'
import { MacroBar } from '../components/MacroBar'
import { MealMedChecks } from '../components/MealMedChecks'
import { TrashIcon } from '../components/TrashIcon'
import { todayIso } from '../lib/date'
import { MEAL_TYPE_LABELS, MEAL_TYPE_ORDER, mealRawTextFromItems } from '../lib/labels'
import {
  inferSavedFoodKind,
  mealItemsAreApproximate,
  mealItemsHaveUnresolved,
} from '../lib/mealDraft'
import type { MedDoseKey } from '../lib/medRoutine'
import { parseMeal } from '../lib/parseMeal'
import { estimateMealItemMacros } from '../lib/parseMealCatalogFirst'
import { scalePer100g, sumMacros } from '../lib/nutrition'
import type { AppData, FoodItem, Meal, MealItem, MealType } from '../types'

type Props = {
  data: AppData
  meal: Meal
  onBack: () => void
  onSave: (input: {
    id: string
    date: string
    mealType: MealType
    rawText: string
    items: MealItem[]
    isApproximate: boolean
    eatingOut: boolean
  }) => Promise<unknown>
  onDelete: (id: string) => Promise<void>
  onSaveFood: (input: Omit<FoodItem, 'id' | 'updatedAt'> & { id?: string }) => Promise<FoodItem>
  onSaveMedCheck: (input: {
    date: string
    dose: MedDoseKey
    taken: boolean
  }) => Promise<unknown>
  onRepeatToday?: () => void
  /** Hardware / swipe back — same flush as ← Назад. */
  registerBackHandler?: (fn: () => boolean) => () => void
}

export function MealDetailScreen({
  data,
  meal,
  onBack,
  onSave,
  onDelete,
  onSaveFood,
  onSaveMedCheck,
  onRepeatToday,
  registerBackHandler,
}: Props) {
  const [items, setItems] = useState(meal.items)
  const [date, setDate] = useState(meal.date)
  const [mealType, setMealType] = useState(meal.mealType)
  const [eatingOut, setEatingOut] = useState(meal.eatingOut)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savingFoodIndex, setSavingFoodIndex] = useState<number | null>(null)
  const [estimatingProduct, setEstimatingProduct] = useState(false)
  const [estimatingItemIndex, setEstimatingItemIndex] = useState<number | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  const skipAutosave = useRef(true)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const leavingRef = useRef(false)
  const persistChainRef = useRef(Promise.resolve())
  const latestRef = useRef({ items, date, mealType, eatingOut, meal })
  latestRef.current = { items, date, mealType, eatingOut, meal }

  // Reset local draft only when opening another meal.
  useEffect(() => {
    setItems(meal.items)
    setDate(meal.date)
    setMealType(meal.mealType)
    setEatingOut(meal.eatingOut)
    setError(null)
    setSaveState('idle')
    skipAutosave.current = true
    leavingRef.current = false
  }, [meal.id])

  const persist = (opts?: { quiet?: boolean }): Promise<boolean> => {
    const quiet = opts?.quiet === true
    const run = async (): Promise<boolean> => {
      if (leavingRef.current && quiet) return false
      const snap = latestRef.current
      const foods = data.foods
      if (!/^\d{4}-\d{2}-\d{2}$/.test(snap.date) || snap.date > todayIso()) {
        if (!quiet) {
          setError('Дата не может быть в будущем')
          setSaveState('error')
        }
        return false
      }
      const kept = snap.items.filter((i) => i.name.trim())
      if (kept.length === 0) {
        if (!quiet) {
          setError('Добавьте хотя бы один продукт')
          setSaveState('error')
        }
        return false
      }
      if (mealItemsHaveUnresolved(kept, foods)) {
        if (quiet) {
          setError(null)
          return false
        }
        setError('Уточните продукты в справочнике или оцените КБЖУ')
        setSaveState('error')
        return false
      }
      const isApproximate = mealItemsAreApproximate(snap.eatingOut, kept)
      if (!quiet) setSaveState('saving')
      setError(null)
      try {
        await onSave({
          id: snap.meal.id,
          date: snap.date,
          mealType: snap.mealType,
          rawText: mealRawTextFromItems(kept),
          items: kept,
          isApproximate,
          eatingOut: snap.eatingOut,
        })
        // If newer edits landed while we were saving, chain another quiet flush.
        const latest = latestRef.current
        const latestKept = latest.items.filter((i) => i.name.trim())
        const drifted =
          latest.date !== snap.date ||
          latest.mealType !== snap.mealType ||
          latest.eatingOut !== snap.eatingOut ||
          latestKept.length !== kept.length ||
          latestKept.some((it, i) => {
            const prev = kept[i]
            return (
              !prev ||
              it.name !== prev.name ||
              it.grams !== prev.grams ||
              it.kcal !== prev.kcal ||
              it.foodId !== prev.foodId ||
              it.source !== prev.source
            )
          })
        if (drifted && !leavingRef.current) {
          return run()
        }
        setSaveState('saved')
        return true
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Ошибка сохранения')
        setSaveState('error')
        return false
      }
    }
    const p = persistChainRef.current.then(run, run)
    persistChainRef.current = p.then(
      () => undefined,
      () => undefined,
    )
    return p
  }

  const scheduleSave = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null
      void persist({ quiet: true })
    }, 450)
  }

  useEffect(() => {
    if (skipAutosave.current) {
      skipAutosave.current = false
      return
    }
    scheduleSave()
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [items, date, mealType, eatingOut])

  const flushAndLeave = async (leave: () => void) => {
    if (leavingRef.current || busy) return
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    const kept = latestRef.current.items.filter((i) => i.name.trim())
    if (mealItemsHaveUnresolved(kept, data.foods)) {
      setError('Уточните продукты в справочнике или оцените КБЖУ')
      setSaveState('error')
      return
    }
    const ok = await persist()
    if (!ok) return
    leavingRef.current = true
    skipAutosave.current = true
    leave()
  }

  const goBack = async () => {
    await flushAndLeave(onBack)
  }

  const goBackRef = useRef(goBack)
  goBackRef.current = goBack

  useEffect(() => {
    if (!registerBackHandler) return
    return registerBackHandler(() => {
      void goBackRef.current()
      // Consume back so App does not closeOverlay without flush.
      return true
    })
  }, [registerBackHandler])

  const repeatToday = async () => {
    if (!onRepeatToday) return
    await flushAndLeave(onRepeatToday)
  }

  const remove = async () => {
    if (!confirm('Удалить этот приём пищи?')) return
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    skipAutosave.current = true
    leavingRef.current = true
    setBusy(true)
    try {
      await onDelete(meal.id)
      onBack()
    } catch (err) {
      leavingRef.current = false
      setError(err instanceof Error ? err.message : 'Не удалось удалить')
    } finally {
      setBusy(false)
    }
  }

  const saveToLibrary = async (index: number) => {
    const item = items[index]
    if (!item || item.source === 'library') return
    if (item.grams <= 0) {
      setError('Укажите граммы, чтобы сохранить продукт на 100 г')
      return
    }
    setSavingFoodIndex(index)
    setError(null)
    try {
      const k = 100 / item.grams
      const saved = await onSaveFood({
        name: item.name,
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
      setItems((prev) =>
        applyItemPatch(
          prev,
          index,
          { foodId: saved.id, name: saved.name, source: 'library', ...macros },
          [...data.foods.filter((f) => f.id !== saved.id), saved],
        ),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить продукт')
    } finally {
      setSavingFoodIndex(null)
    }
  }

  const estimateItemAt = async (index: number) => {
    if (estimatingItemIndex != null) return
    const item = items[index]
    if (!item?.name.trim()) return
    setEstimatingItemIndex(index)
    setError(null)
    try {
      const grams = item.grams > 0 ? item.grams : 100
      const nextItem = await estimateMealItemMacros(item.name.trim(), grams)
      setItems((prev) => prev.map((it, i) => (i === index ? nextItem : it)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось оценить')
    } finally {
      setEstimatingItemIndex(null)
    }
  }

  const totals = sumMacros(items.filter((i) => i.name.trim()))

  return (
    <section className="screen">
      <header className="screen-header meal-detail-header">
        <div className="meal-detail-nav">
          <button type="button" className="link-btn" onClick={() => void goBack()}>
            ← Назад
          </button>
        </div>

        <div className="meal-detail-title-row">
          <h1>{MEAL_TYPE_LABELS[mealType]}</h1>
          <div className="meal-type-chips meal-type-chips-inline" role="group" aria-label="Тип приёма">
            {MEAL_TYPE_ORDER.map((key) => (
              <button
                key={key}
                type="button"
                className={`meal-type-chip${mealType === key ? ' active' : ''}`}
                onClick={() => setMealType(key)}
              >
                {MEAL_TYPE_LABELS[key]}
              </button>
            ))}
          </div>
        </div>

        <div className="meal-detail-meta">
          <DateField
            className="meal-detail-date"
            value={date}
            max={todayIso()}
            onChange={setDate}
          />
          <label className="check-row meal-detail-out">
            <input
              type="checkbox"
              checked={eatingOut}
              onChange={(e) => setEatingOut(e.target.checked)}
            />
            <span>Вне дома</span>
          </label>
          <MealMedChecks
            date={date}
            mealType={mealType}
            entry={(data.medDays ?? []).find((m) => m.date === date)}
            onToggle={onSaveMedCheck}
          />
        </div>
      </header>

      <MacroBar totals={totals} incomplete={mealItemsHaveUnresolved(items, data.foods)} />
      {mealItemsHaveUnresolved(items, data.foods) && (
        <p className="muted small meal-detail-save-hint">
          Уточните продукты или оцените КБЖУ — автосохранение ждёт
        </p>
      )}

      {onRepeatToday && (
        <button
          type="button"
          className="ghost-btn meal-detail-repeat"
          onClick={() => void repeatToday()}
        >
          Повторить сегодня
        </button>
      )}

      <MealDraftEditor
        key={meal.id}
        data={data}
        items={items}
        collapsible
        onChangeItem={(index, patch) =>
          setItems((prev) => applyItemPatch(prev, index, patch, data.foods))
        }
        onRemoveItem={(index) => setItems((prev) => prev.filter((_, i) => i !== index))}
        onAddItem={(seed) => setItems((prev) => [...prev, { ...emptyMealItem(), ...seed }])}
        onAddFromFood={(food) => setItems((prev) => [...prev, mealItemFromFood(food)])}
        estimatingProduct={estimatingProduct}
        estimatingItemIndex={estimatingItemIndex}
        onEstimateItem={(index) => estimateItemAt(index)}
        onEstimateProduct={async (line) => {
          setEstimatingProduct(true)
          setError(null)
          try {
            const foodsRef = data.foods.map((f) => ({
              id: f.id,
              name: f.name,
              aliases: f.aliases,
              per100g: f.per100g,
              kind: f.kind,
              ...(f.portionGrams != null && f.portionGrams > 0
                ? { portionGrams: f.portionGrams }
                : {}),
            }))
            const result = await parseMeal(line, foodsRef, mealType)
            setItems((prev) => [...prev, ...result.items])
          } finally {
            setEstimatingProduct(false)
          }
        }}
        onSaveToLibrary={(index) => void saveToLibrary(index)}
        savingFoodIndex={savingFoodIndex}
      />

      <div className="meal-detail-footer">
        <button
          type="button"
          className="link-btn danger meal-detail-delete"
          disabled={busy}
          onClick={() => void remove()}
        >
          <TrashIcon size={16} />
          Удалить приём
        </button>
      </div>

      {(saveState === 'saving' || saveState === 'saved') && (
        <p className="muted small meal-detail-save-hint">
          {saveState === 'saving' ? 'Сохраняю…' : 'Сохранено'}
        </p>
      )}
      {error && <p className="form-msg error">{error}</p>}
    </section>
  )
}
