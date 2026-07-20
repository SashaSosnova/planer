import { useEffect, useState } from 'react'
import { MealDraftEditor, applyItemPatch, emptyMealItem } from '../components/MealDraftEditor'
import { MacroBar } from '../components/MacroBar'
import { todayIso } from '../lib/date'
import { MEAL_TYPE_LABELS, MEAL_TYPE_ORDER } from '../lib/labels'
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

  useEffect(() => {
    setItems(meal.items)
    setDate(meal.date)
    setMealType(meal.mealType)
    setEatingOut(meal.eatingOut)
  }, [meal])

  const totals = sumMacros(items)
  const isApproximate = eatingOut || items.some((i) => i.source === 'estimate')

  const save = async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > todayIso()) {
      setError('Дата не может быть в будущем')
      return
    }
    const kept = items.filter((i) => i.name.trim())
    if (kept.length === 0) {
      setError('Добавьте хотя бы один продукт')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onSave({
        id: meal.id,
        date,
        mealType,
        rawText: meal.rawText.trim() || kept.map((i) => i.name).join(', '),
        items: kept,
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
      </header>

      <div className="panel">
        <div className="meal-type-chips" role="group" aria-label="Тип приёма">
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
        <label className="field">
          <span>Дата</span>
          <input
            type="date"
            max={todayIso()}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            checked={eatingOut}
            onChange={(e) => setEatingOut(e.target.checked)}
          />
          <span>Вне дома</span>
        </label>
      </div>

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
        onAddItem={() => setItems((prev) => [...prev, emptyMealItem()])}
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
