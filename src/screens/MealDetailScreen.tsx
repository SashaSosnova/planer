import { useEffect, useState } from 'react'
import { MealDraftEditor, applyItemPatch } from '../components/MealDraftEditor'
import { MacroBar } from '../components/MacroBar'
import { MEAL_TYPE_LABELS } from '../lib/labels'
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
  const [mealType, setMealType] = useState(meal.mealType)
  const [rawText, setRawText] = useState(meal.rawText)
  const [items, setItems] = useState(meal.items)
  const [eatingOut, setEatingOut] = useState(meal.eatingOut)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savingFoodIndex, setSavingFoodIndex] = useState<number | null>(null)

  useEffect(() => {
    setMealType(meal.mealType)
    setRawText(meal.rawText)
    setItems(meal.items)
    setEatingOut(meal.eatingOut)
  }, [meal])

  const totals = sumMacros(items)
  const isApproximate = eatingOut || items.some((i) => i.source === 'estimate')

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      await onSave({
        id: meal.id,
        date: meal.date,
        mealType,
        rawText: rawText.trim() || MEAL_TYPE_LABELS[mealType],
        items,
        isApproximate,
        eatingOut,
      })
      onBack()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка сохранения')
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!confirm('Удалить этот приём пищи?')) return
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

  return (
    <section className="screen">
      <header className="screen-header">
        <button type="button" className="link-btn" onClick={onBack}>
          ← Назад
        </button>
        <h1>{MEAL_TYPE_LABELS[mealType]}</h1>
        <p className="muted small">{meal.date}</p>
      </header>

      <label className="field">
        <span>Приём</span>
        <select value={mealType} onChange={(e) => setMealType(e.target.value as MealType)}>
          {(Object.keys(MEAL_TYPE_LABELS) as MealType[]).map((key) => (
            <option key={key} value={key}>
              {MEAL_TYPE_LABELS[key]}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Что было</span>
        <textarea rows={2} value={rawText} onChange={(e) => setRawText(e.target.value)} />
      </label>

      <MacroBar totals={totals} approximate={isApproximate} />

      <MealDraftEditor
        data={data}
        items={items}
        onChangeItem={(index, patch) =>
          setItems((prev) => applyItemPatch(prev, index, patch, data.foods))
        }
        onSaveToLibrary={(index) => void saveToLibrary(index)}
        savingFoodIndex={savingFoodIndex}
      />

      {error && <p className="form-msg error">{error}</p>}

      <div className="btn-row">
        <button type="button" className="primary-btn" disabled={busy} onClick={() => void save()}>
          {busy ? 'Сохраняю…' : 'Сохранить'}
        </button>
        <button type="button" className="ghost-btn danger" disabled={busy} onClick={() => void remove()}>
          Удалить
        </button>
      </div>
    </section>
  )
}
