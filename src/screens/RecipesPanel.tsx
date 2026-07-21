import { useMemo, useState } from 'react'
import { DecimalInput } from '../components/DecimalInput'
import { PlusIcon } from '../components/PlusIcon'
import { TrashIcon } from '../components/TrashIcon'
import { parseRecipe } from '../lib/parseRecipe'
import {
  computeRecipe,
  draftFromFoodItem,
  ingredientPer100Cooked,
  ingredientPer100RawFromCooked,
  recipeTextFromDraft,
  recipeToFoodItem,
} from '../lib/recipeCalc'
import { round1 } from '../lib/nutrition'
import type { AppData, FoodItem, MacroSet, RecipeDraft, RecipeIngredientLine } from '../types'

const RECIPE_PLACEHOLDER =
  'Первая строка — название блюда.\nДальше ингредиенты: продукт — граммы до готовки (каждый с новой строки).'

type MacrosBasis = 'cooked' | 'raw'

type Props = {
  data: AppData
  onSave: (input: Omit<FoodItem, 'id' | 'updatedAt'> & { id?: string }) => Promise<FoodItem>
  onDelete: (id: string) => Promise<void>
}

function formatMacros(m: Pick<MacroSet, 'kcal' | 'protein' | 'fat' | 'carbs'>): string {
  return `${Math.round(m.kcal)} ккал · Б ${m.protein} · Ж ${m.fat} · У ${m.carbs}`
}

export function RecipesPanel({ data, onSave, onDelete }: Props) {
  const [view, setView] = useState<'list' | 'editor'>('list')
  const [editId, setEditId] = useState<string | null>(null)
  const [recipeText, setRecipeText] = useState('')
  const [draft, setDraft] = useState<RecipeDraft | null>(null)
  const [cookedOverride, setCookedOverride] = useState('')
  const [editingCooked, setEditingCooked] = useState(false)
  const [macrosEdit, setMacrosEdit] = useState<{ index: number; basis: MacrosBasis } | null>(
    null,
  )
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
    setView('editor')
    setEditId(null)
    setError(null)
    setDraft(null)
    setCookedOverride('')
    setEditingCooked(false)
    setMacrosEdit(null)
    setRecipeText('')
  }

  const openEdit = (food: FoodItem) => {
    const next = draftFromFoodItem(food)
    setView('editor')
    setEditId(food.id)
    setError(null)
    setDraft(next)
    setCookedOverride(String(next.totalCookedGrams))
    setEditingCooked(false)
    setMacrosEdit(null)
    setRecipeText(recipeTextFromDraft(next))
  }

  const backToList = () => {
    setView('list')
    setEditId(null)
    setDraft(null)
    setError(null)
    setEditingCooked(false)
    setMacrosEdit(null)
  }

  const recompute = (
    next: {
      name?: string
      ingredients?: RecipeIngredientLine[]
      notes?: string
    },
    cookedValue = cookedOverride,
  ) => {
    if (!draft) return
    const override = Number(cookedValue.replace(',', '.'))
    setDraft(
      computeRecipe({
        name: next.name ?? draft.name,
        ingredients: next.ingredients ?? draft.ingredients,
        cookedGramsOverride: Number.isFinite(override) && override > 0 ? override : null,
        notes: next.notes ?? draft.notes,
      }),
    )
  }

  const runRecipeParse = async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await parseRecipe(recipeText, foodsRef)
      setDraft(result)
      setCookedOverride(String(result.totalCookedGrams))
      setEditingCooked(false)
      setMacrosEdit(null)
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
    recompute({ ingredients })
  }

  const commitCookedGrams = (n: number) => {
    if (!(n > 0)) return
    const value = String(n)
    setCookedOverride(value)
    recompute({}, value)
  }

  const toggleMacrosEdit = (index: number, basis: MacrosBasis) => {
    setMacrosEdit((prev) =>
      prev?.index === index && prev.basis === basis ? null : { index, basis },
    )
  }

  const commitIngredientMacros = (
    index: number,
    ing: RecipeIngredientLine,
    basis: MacrosBasis,
    patch: Partial<MacroSet>,
  ) => {
    if (basis === 'raw') {
      updateIngredient(index, {
        per100g: { ...ing.per100g, ...patch },
        foodId: undefined,
        source: 'estimate',
      })
      return
    }
    const cooked = { ...ingredientPer100Cooked(ing), ...patch }
    updateIngredient(index, {
      per100g: ingredientPer100RawFromCooked(cooked, ing.yieldFactor),
      foodId: undefined,
      source: 'estimate',
    })
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
      await onSave(recipeToFoodItem(draft, editId ?? undefined))
      backToList()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка сохранения')
    } finally {
      setBusy(false)
    }
  }

  if (view === 'editor') {
    return (
      <div className="panel-stack">
        <button type="button" className="link-btn" onClick={backToList}>
          ← К списку рецептов
        </button>
        <h2 className="subhead">{editId ? 'Изменить блюдо' : 'Новое блюдо'}</h2>
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

            <div className="recipe-per100-hero">
              <span className="recipe-per100-hero-label">На 100 г готового</span>
              <strong className="recipe-per100-hero-value">{formatMacros(draft.per100g)}</strong>
            </div>

            <p className="recipe-summary-line muted small">
              Сырой {draft.totalRawGrams} г
              <span className="recipe-summary-sep">·</span>
              Готовый{' '}
              {editingCooked ? (
                <DecimalInput
                  className="recipe-cooked-input-inline"
                  value={draft.totalCookedGrams}
                  autoFocus
                  ariaLabel="Вес готового блюда, г"
                  onCommit={commitCookedGrams}
                  onBlurExtra={() => setEditingCooked(false)}
                />
              ) : (
                <button
                  type="button"
                  className="recipe-summary-tap-inline"
                  onClick={() => setEditingCooked(true)}
                  title="Изменить вес готового"
                >
                  {draft.totalCookedGrams} г
                </button>
              )}
              <span className="recipe-summary-sep">·</span>
              Всего {Math.round(draft.totalMacros.kcal)} ккал
            </p>

            <ul className="draft-list">
              {draft.ingredients.map((ing, index) => {
                const per100Cooked = ingredientPer100Cooked(ing)
                const cookedGrams = round1(ing.gramsRaw * (ing.yieldFactor > 0 ? ing.yieldFactor : 1))
                const editing = macrosEdit?.index === index ? macrosEdit.basis : null
                const fromLibrary = ing.source === 'library'

                return (
                  <li key={`${ing.name}-${index}`} className="draft-item">
                    <div className="draft-item-top">
                      {fromLibrary ? (
                        <div className="field grow">
                          <span>Название</span>
                          <div className="draft-item-title-name">{ing.name}</div>
                        </div>
                      ) : (
                        <label className="field grow">
                          <span>Название</span>
                          <input
                            value={ing.name}
                            onChange={(e) => updateIngredient(index, { name: e.target.value })}
                            placeholder="Ингредиент"
                          />
                        </label>
                      )}
                      <label className="field draft-portion-field">
                        <span>Сырой, г</span>
                        <DecimalInput
                          className="draft-portion-input"
                          value={ing.gramsRaw}
                          onCommit={(gramsRaw) => updateIngredient(index, { gramsRaw })}
                          ariaLabel="Сырой вес, г"
                        />
                      </label>
                    </div>

                    <p className="muted small">
                      Выход ×{ing.yieldFactor}
                      {ing.yieldNote ? ` — ${ing.yieldNote}` : ''} → {cookedGrams} г готового
                    </p>

                    <div className="draft-kbju-rows">
                      <button
                        type="button"
                        className={`draft-kbju-row${editing === 'cooked' ? ' active' : ''}`}
                        onClick={() => toggleMacrosEdit(index, 'cooked')}
                      >
                        <span className="draft-kbju-label">На 100 г готового</span>
                        <span>{formatMacros(per100Cooked)}</span>
                      </button>
                      <button
                        type="button"
                        className={`draft-kbju-row${editing === 'raw' ? ' active' : ''}`}
                        onClick={() => toggleMacrosEdit(index, 'raw')}
                      >
                        <span className="draft-kbju-label">На 100 г сырого</span>
                        <span>{formatMacros(ing.per100g)}</span>
                      </button>
                    </div>

                    {editing && (
                      <div className="draft-macros">
                        <p className="muted small">
                          {editing === 'cooked' ? 'КБЖУ на 100 г готового' : 'КБЖУ на 100 г сырого'}
                        </p>
                        <div className="form-grid four compact draft-macros-grid">
                          {(
                            [
                              ['kcal', 'Ккал'],
                              ['protein', 'Белки'],
                              ['fat', 'Жиры'],
                              ['carbs', 'Углеводы'],
                            ] as const
                          ).map(([key, label]) => {
                            const basisMacros =
                              editing === 'cooked' ? per100Cooked : ing.per100g
                            return (
                              <label key={key} className="field">
                                <span>{label}</span>
                                <DecimalInput
                                  value={basisMacros[key]}
                                  onCommit={(n) =>
                                    commitIngredientMacros(index, ing, editing, { [key]: n })
                                  }
                                  ariaLabel={label}
                                />
                              </label>
                            )
                          })}
                        </div>
                        <label className="field">
                          <span>Коэфф. выхода</span>
                          <DecimalInput
                            value={ing.yieldFactor}
                            onCommit={(yieldFactor) => {
                              if (yieldFactor > 0) updateIngredient(index, { yieldFactor })
                            }}
                            ariaLabel="Коэффициент выхода"
                          />
                        </label>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>

            <div className="btn-row">
              <button
                type="button"
                className="primary-btn"
                disabled={busy}
                onClick={() => void saveRecipe()}
              >
                {busy ? 'Сохраняю…' : editId ? 'Сохранить' : 'Сохранить блюдо'}
              </button>
              {!editId && (
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => {
                    setDraft(null)
                    setEditingCooked(false)
                    setMacrosEdit(null)
                  }}
                >
                  Сбросить расчёт
                </button>
              )}
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
        <button
          type="button"
          className="primary-btn icon-cta"
          onClick={openNew}
          aria-label="Новое блюдо"
          title="Новое блюдо"
        >
          <PlusIcon size={20} />
        </button>
      </div>
      <p className="muted small">
        Блюда, собранные из ингредиентов — КБЖУ на 100 г готового
      </p>
      <ul className="food-list">
        {dishes.length === 0 && <li className="muted">Пока пусто — нажмите +.</li>}
        {dishes.map((food) => (
          <li key={food.id} className="food-row food-row-icons">
            <button
              type="button"
              className="food-row-body food-row-open"
              onClick={() => openEdit(food)}
            >
              <strong>{food.name}</strong>
              <p className="muted small">
                {food.per100g.kcal} ккал · Б {food.per100g.protein} · Ж {food.per100g.fat} · У{' '}
                {food.per100g.carbs}
              </p>
            </button>
            <div className="btn-row tight nowrap food-row-actions">
              <button
                type="button"
                className="icon-btn sm danger"
                onClick={() => void onDelete(food.id)}
                aria-label={`Удалить ${food.name}`}
                title="Удалить"
              >
                <TrashIcon size={18} />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
