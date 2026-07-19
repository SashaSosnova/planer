import { useEffect, useMemo, useState } from 'react'
import { MacroBar } from '../components/MacroBar'
import { MealDraftEditor, patchDraft } from '../components/MealDraftEditor'
import { todayIso } from '../lib/date'
import { isDeepseekConfigured } from '../lib/deepseek'
import {
  MEAL_TYPE_LABELS,
  extractMealTypeFromText,
  nextMealType,
} from '../lib/labels'
import { parseMeal } from '../lib/parseMeal'
import { scalePer100g } from '../lib/nutrition'
import type {
  AppData,
  FoodItem,
  MealItem,
  MealParseSource,
  MealType,
  ParsedMealDraft,
} from '../types'
import { ProductsPanel } from './ProductsPanel'
import { RecipesPanel } from './RecipesPanel'

const PARSE_SOURCE_LABEL: Record<MealParseSource, string> = {
  library: 'справочник',
  deepseek: 'DeepSeek flash',
  local: 'локально (без LLM)',
  cloud: 'облако',
}

type AddMode = 'meal' | 'products' | 'recipes'

type Props = {
  data: AppData
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
}

export function AddMealScreen({
  data,
  onBack,
  onSaveMeal,
  onSaveFood,
  onDeleteFood,
}: Props) {
  const [mode, setMode] = useState<AddMode>('meal')
  const [date, setDate] = useState(todayIso())
  const [mealType, setMealType] = useState<MealType>('breakfast')
  const [mealTypeTouched, setMealTypeTouched] = useState(false)
  const [text, setText] = useState('')
  const [draft, setDraft] = useState<ParsedMealDraft | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [savingFoodIndex, setSavingFoodIndex] = useState<number | null>(null)

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
      const result = await parseMeal(text, foodsRef, mealType)
      setDraft(result)
      setMealType(result.mealType)
      if (result.notes) setInfo(result.notes)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось разобрать')
    } finally {
      setBusy(false)
    }
  }

  const confirmMeal = async () => {
    if (!draft) return
    setBusy(true)
    setError(null)
    try {
      await onSaveMeal({
        date,
        mealType: draft.mealType,
        rawText: text.trim(),
        items: draft.items,
        isApproximate: draft.isApproximate,
        eatingOut: draft.eatingOut,
      })
      onBack()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка сохранения')
    } finally {
      setBusy(false)
    }
  }

  const saveToLibrary = async (index: number) => {
    if (!draft || savingFoodIndex != null) return
    const item = draft.items[index]
    if (item.source === 'library' && item.foodId) return
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
        per100g: {
          kcal: Math.round(item.kcal * k * 10) / 10,
          protein: Math.round(item.protein * k * 10) / 10,
          fat: Math.round(item.fat * k * 10) / 10,
          carbs: Math.round(item.carbs * k * 10) / 10,
        },
      })
      const macros = scalePer100g(saved.per100g, item.grams)
      setDraft(
        patchDraft(
          draft,
          index,
          { foodId: saved.id, name: saved.name, source: 'library', ...macros },
          [...data.foods.filter((f) => f.id !== saved.id), saved],
        ),
      )
      setInfo(`«${saved.name}» добавлен в справочник`)
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
        <h1>Добавить</h1>
        <p className="muted">Приём, продукты или блюдо по рецепту</p>
        {mode === 'meal' && (
          <p className={`llm-status ${isDeepseekConfigured() ? 'on' : 'off'}`}>
            LLM:{' '}
            {isDeepseekConfigured()
              ? 'DeepSeek flash подключен'
              : 'не подключен (нет VITE_DEEPSEEK_API_KEY)'}
          </p>
        )}
      </header>

      <div className="mode-tabs">
        <button
          type="button"
          className={`mode-tab${mode === 'meal' ? ' active' : ''}`}
          onClick={() => setMode('meal')}
        >
          Приём
        </button>
        <button
          type="button"
          className={`mode-tab${mode === 'products' ? ' active' : ''}`}
          onClick={() => setMode('products')}
        >
          Продукты
        </button>
        <button
          type="button"
          className={`mode-tab${mode === 'recipes' ? ' active' : ''}`}
          onClick={() => setMode('recipes')}
        >
          Рецепты
        </button>
      </div>

      {mode === 'products' && (
        <ProductsPanel data={data} onSave={onSaveFood} onDelete={onDeleteFood} />
      )}

      {mode === 'recipes' && (
        <RecipesPanel data={data} onSave={onSaveFood} onDelete={onDeleteFood} />
      )}

      {mode === 'meal' && (
        <>
          <div className="form-grid">
            <label className="field">
              <span>Дата</span>
              <input
                type="date"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value)
                  setMealTypeTouched(false)
                }}
              />
            </label>
            <label className="field">
              <span>Приём</span>
              <select
                value={mealType}
                onChange={(e) => {
                  setMealTypeTouched(true)
                  setMealType(e.target.value as MealType)
                }}
              >
                {(Object.keys(MEAL_TYPE_LABELS) as MealType[]).map((key) => (
                  <option key={key} value={key}>
                    {MEAL_TYPE_LABELS[key]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="muted small">В тексте: «обед: …», «вне дома …», «в кафе …»</p>

          <label className="field">
            <span>Что съели</span>
            <textarea
              rows={4}
              value={text}
              onChange={(e) => {
                const value = e.target.value
                setText(value)
                const hinted = extractMealTypeFromText(value).mealType
                if (hinted) {
                  setMealType(hinted)
                  setMealTypeTouched(false)
                }
              }}
              placeholder="обед: паста с кабачком 200 гр — или вне дома стрипсы и салат"
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

          {error && <p className="form-msg error">{error}</p>}
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
                  {draft.isApproximate && <span className="badge">примерно</span>}
                </div>
              </div>
              <MacroBar totals={draft.totals} approximate={draft.isApproximate} />

              <MealDraftEditor
                data={data}
                items={draft.items}
                onChangeItem={(index, patch) =>
                  setDraft((prev) => (prev ? patchDraft(prev, index, patch, data.foods) : prev))
                }
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
                <button type="button" className="ghost-btn" onClick={() => setDraft(null)}>
                  Отмена
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  )
}
