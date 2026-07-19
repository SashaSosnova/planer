import { useMemo, useState } from 'react'
import { parseRecipe } from '../lib/parseRecipe'
import { computeRecipe, recipeToFoodItem } from '../lib/recipeCalc'
import type { AppData, FoodItem, RecipeDraft, RecipeIngredientLine } from '../types'

const RECIPE_PLACEHOLDER =
  'Первая строка — название блюда.\nДальше ингредиенты: продукт — граммы до готовки (каждый с новой строки).'

type Props = {
  data: AppData
  onSave: (input: Omit<FoodItem, 'id' | 'updatedAt'> & { id?: string }) => Promise<FoodItem>
  onDelete: (id: string) => Promise<void>
}

export function RecipesPanel({ data, onSave, onDelete }: Props) {
  const [view, setView] = useState<'list' | 'new'>('list')
  const [recipeText, setRecipeText] = useState('')
  const [draft, setDraft] = useState<RecipeDraft | null>(null)
  const [cookedOverride, setCookedOverride] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const dishes = useMemo(
    () =>
      data.foods
        .filter((f) => f.kind === 'dish')
        .sort((a, b) => a.name.localeCompare(b.name, 'ru')),
    [data.foods],
  )

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

  const openNew = () => {
    setView('new')
    setError(null)
    setDraft(null)
    setCookedOverride('')
    setRecipeText('')
  }

  const backToList = () => {
    setView('list')
    setDraft(null)
    setError(null)
  }

  const runRecipeParse = async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await parseRecipe(recipeText, foodsRef)
      setDraft(result)
      setCookedOverride(String(result.totalCookedGrams))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось разобрать рецепт')
    } finally {
      setBusy(false)
    }
  }

  const updateIngredient = (index: number, patch: Partial<RecipeIngredientLine>) => {
    if (!draft) return
    const ingredients = draft.ingredients.map((ing, i) =>
      i === index ? { ...ing, ...patch } : ing,
    )
    const override = Number(cookedOverride.replace(',', '.'))
    setDraft(
      computeRecipe({
        name: draft.name,
        ingredients,
        cookedGramsOverride: Number.isFinite(override) && override > 0 ? override : null,
        notes: draft.notes,
      }),
    )
  }

  const applyCookedOverride = (value: string) => {
    setCookedOverride(value)
    if (!draft) return
    const override = Number(value.replace(',', '.'))
    setDraft(
      computeRecipe({
        name: draft.name,
        ingredients: draft.ingredients,
        cookedGramsOverride: Number.isFinite(override) && override > 0 ? override : null,
        notes: draft.notes,
      }),
    )
  }

  const saveRecipe = async () => {
    if (!draft) return
    if (!draft.name.trim()) {
      setError('Укажите название блюда')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onSave(recipeToFoodItem(draft))
      backToList()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка сохранения')
    } finally {
      setBusy(false)
    }
  }

  if (view === 'new') {
    return (
      <div className="panel-stack">
        <button type="button" className="link-btn" onClick={backToList}>
          ← К списку рецептов
        </button>
        <h2 className="subhead">Новое блюдо</h2>
        <p className="muted small">
          Ингредиенты с весом до готовки → КБЖУ готового с учётом набухания/ужарки
        </p>

        <label className="field">
          <span>Рецепт текстом</span>
          <textarea
            rows={8}
            value={recipeText}
            onChange={(e) => setRecipeText(e.target.value)}
            placeholder={RECIPE_PLACEHOLDER}
          />
        </label>

        <button
          type="button"
          className="primary-btn"
          disabled={busy || !recipeText.trim()}
          onClick={() => void runRecipeParse()}
        >
          {busy ? 'Считаю…' : 'Рассчитать блюдо'}
        </button>

        {error && <p className="form-msg error">{error}</p>}

        {draft && (
          <div className="panel confirm-panel">
            <label className="field">
              <span>Название блюда</span>
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Название блюда"
              />
            </label>

            <div className="recipe-summary">
              <div>
                <span className="muted small">Сырой вес</span>
                <strong>{draft.totalRawGrams} г</strong>
              </div>
              <div>
                <span className="muted small">Готовый вес</span>
                <strong>{draft.totalCookedGrams} г</strong>
              </div>
              <div>
                <span className="muted small">Всего ккал</span>
                <strong>{Math.round(draft.totalMacros.kcal)}</strong>
              </div>
            </div>

            <label className="field">
              <span>Вес готового блюда, г</span>
              <input
                inputMode="decimal"
                value={cookedOverride}
                onChange={(e) => applyCookedOverride(e.target.value)}
              />
            </label>

            <div className="draft-per100">
              <span className="draft-per100-label">На 100 г готового</span>
              <span>
                {Math.round(draft.per100g.kcal)} ккал · Б {draft.per100g.protein} · Ж{' '}
                {draft.per100g.fat} · У {draft.per100g.carbs}
              </span>
            </div>

            <ul className="draft-list">
              {draft.ingredients.map((ing, index) => (
                <li key={`${ing.name}-${index}`} className="draft-item">
                  <div className="draft-item-top">
                    <strong>{ing.name}</strong>
                    <span className={ing.source === 'library' ? 'badge ok' : 'badge'}>
                      {ing.source === 'library' ? 'справочник' : 'оценка'}
                    </span>
                  </div>
                  <p className="muted small">
                    Выход ×{ing.yieldFactor}
                    {ing.yieldNote ? ` — ${ing.yieldNote}` : ''} →{' '}
                    {Math.round(ing.gramsRaw * ing.yieldFactor)} г готового
                  </p>
                  <div className="form-grid">
                    <label className="field">
                      <span>Сырой вес, г</span>
                      <input
                        inputMode="decimal"
                        value={ing.gramsRaw}
                        onChange={(e) => {
                          const gramsRaw = Number(e.target.value.replace(',', '.'))
                          if (Number.isFinite(gramsRaw)) updateIngredient(index, { gramsRaw })
                        }}
                      />
                    </label>
                    <label className="field">
                      <span>Коэфф. выхода</span>
                      <input
                        inputMode="decimal"
                        value={ing.yieldFactor}
                        onChange={(e) => {
                          const yieldFactor = Number(e.target.value.replace(',', '.'))
                          if (Number.isFinite(yieldFactor) && yieldFactor > 0) {
                            updateIngredient(index, { yieldFactor })
                          }
                        }}
                      />
                    </label>
                  </div>
                </li>
              ))}
            </ul>

            <div className="btn-row">
              <button
                type="button"
                className="primary-btn"
                disabled={busy}
                onClick={() => void saveRecipe()}
              >
                Сохранить блюдо
              </button>
              <button type="button" className="ghost-btn" onClick={() => setDraft(null)}>
                Сбросить расчёт
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="panel-stack">
      <div className="section-head">
        <h2>Рецепты</h2>
        <button type="button" className="primary-btn" onClick={openNew}>
          Новое блюдо
        </button>
      </div>
      <p className="muted small">
        Блюда, собранные из ингредиентов — КБЖУ на 100 г готового
      </p>
      <ul className="food-list">
        {dishes.length === 0 && (
          <li className="muted">Пока пусто — нажмите «Новое блюдо».</li>
        )}
        {dishes.map((food) => (
          <li key={food.id} className="food-row">
            <div>
              <strong>{food.name}</strong>
              <p className="muted small">
                {food.per100g.kcal} ккал · Б {food.per100g.protein} · Ж {food.per100g.fat} · У{' '}
                {food.per100g.carbs}
              </p>
            </div>
            <button
              type="button"
              className="ghost-btn danger"
              onClick={() => void onDelete(food.id)}
            >
              Удалить
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
