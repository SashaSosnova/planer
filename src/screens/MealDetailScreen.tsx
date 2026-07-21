import { useEffect, useRef, useState } from 'react'
import {
  MealDraftEditor,
  applyItemPatch,
  emptyMealItem,
  mealItemFromFood,
} from '../components/MealDraftEditor'
import { DateField } from '../components/DateField'
import { MacroBar } from '../components/MacroBar'
import { TrashIcon } from '../components/TrashIcon'
import { todayIso } from '../lib/date'
import { MEAL_TYPE_LABELS, MEAL_TYPE_ORDER } from '../lib/labels'
import { parseMeal } from '../lib/parseMeal'
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
}

export function MealDetailScreen({ data, meal, onBack, onSave, onDelete, onSaveFood }: Props) {
  const [items, setItems] = useState(meal.items)
  const [date, setDate] = useState(meal.date)
  const [mealType, setMealType] = useState(meal.mealType)
  const [eatingOut, setEatingOut] = useState(meal.eatingOut)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savingFoodIndex, setSavingFoodIndex] = useState<number | null>(null)
  const [estimatingProduct, setEstimatingProduct] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  const skipAutosave = useRef(true)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
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
  }, [meal.id])

  const persist = async () => {
    const snap = latestRef.current
    if (!/^\d{4}-\d{2}-\d{2}$/.test(snap.date) || snap.date > todayIso()) {
      setError('Дата не может быть в будущем')
      setSaveState('error')
      return false
    }
    const kept = snap.items.filter((i) => i.name.trim())
    if (kept.length === 0) {
      setError('Добавьте хотя бы один продукт')
      setSaveState('error')
      return false
    }
    const isApproximate = snap.eatingOut || kept.some((i) => i.source === 'estimate')
    setSaveState('saving')
    setError(null)
    try {
      await onSave({
        id: snap.meal.id,
        date: snap.date,
        mealType: snap.mealType,
        rawText: snap.meal.rawText.trim() || kept.map((i) => i.name).join(', '),
        items: kept,
        isApproximate,
        eatingOut: snap.eatingOut,
      })
      setSaveState('saved')
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка сохранения')
      setSaveState('error')
      return false
    }
  }

  const scheduleSave = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null
      void persist()
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

  const goBack = async () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
      await persist()
    }
    onBack()
  }

  const remove = async () => {
    if (!confirm('Удалить этот приём пищи?')) return
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    skipAutosave.current = true
    setBusy(true)
    try {
      await onDelete(meal.id)
      onBack()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить')
    } finally {
      setBusy(false)
    }
  }

  const saveToLibrary = async (index: number) => {
    const item = items[index]
    if (!item || item.grams <= 0) {
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

  const totals = sumMacros(items)

  return (
    <section className="screen">
      <header className="screen-header meal-detail-header">
        <div className="meal-detail-nav">
          <button type="button" className="link-btn" onClick={() => void goBack()}>
            ← Назад
          </button>
          <button
            type="button"
            className="icon-btn sm danger"
            disabled={busy}
            onClick={() => void remove()}
            aria-label="Удалить приём"
            title="Удалить"
          >
            <TrashIcon size={18} />
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
        </div>
      </header>

      <MacroBar totals={totals} />

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

      {(saveState === 'saving' || saveState === 'saved') && (
        <p className="muted small meal-detail-save-hint">
          {saveState === 'saving' ? 'Сохраняю…' : 'Сохранено'}
        </p>
      )}
      {error && <p className="form-msg error">{error}</p>}
    </section>
  )
}
