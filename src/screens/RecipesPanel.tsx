import { useMemo, useRef, useState } from 'react'
import { CatalogSections } from '../components/CatalogSections'
import { CategorySelect } from '../components/CategorySelect'
import { DecimalInput } from '../components/DecimalInput'
import {
  catalogPickGroups,
  foodMatchesCatalogQuery,
  normalizeCatalogQuery,
} from '../components/MealDraftEditor'
import { LibraryMenuIcon } from '../components/MoreMenuIcons'
import { PlusIcon } from '../components/PlusIcon'
import { TrashIcon } from '../components/TrashIcon'
import {
  groupByDishCategory,
  inferDishCategory,
  resolveDishCategory,
  type DishCategoryId,
} from '../lib/foodCategory'
import { parseRecipe } from '../lib/parseRecipe'
import {
  computeRecipe,
  dishPer100g,
  draftFromFoodItem,
  ingredientCookedGramsFromYield,
  ingredientLineFromFood,
  ingredientPer100CookedForDish,
  ingredientPer100RawFromDishCooked,
  recipeEditorText,
  recipeToFoodItem,
  replaceIngredientWithFood,
} from '../lib/recipeCalc'
import { scalePer100g } from '../lib/nutrition'
import type { AppData, FoodItem, MacroSet, RecipeDraft, RecipeIngredientLine } from '../types'

const RECIPE_PLACEHOLDER =
  'Название блюда.\nНа сковороде:\nХлеб 30 г\nЯйцо 55 г\nПосле:\nКетчуп 3 г\nПомидор 15 г'

type MacrosBasis = 'cooked' | 'raw'
/** How the dish is added to a meal: 100 g or a saved serving. */
type ServingBasis = 'per100' | 'portion'

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
  const cookedOverrideRef = useRef(cookedOverride)
  cookedOverrideRef.current = cookedOverride
  /** True when «Готовый» came from the user or a saved dish — keep it across yield edits. */
  const cookedOverrideLockedRef = useRef(false)
  /** Meal-add + hero: 100 g cooked, or the whole finished weight as one portion. */
  const [servingBasis, setServingBasis] = useState<ServingBasis>('portion')
  const [editingCooked, setEditingCooked] = useState(false)
  const [macrosEdit, setMacrosEdit] = useState<{ index: number; basis: MacrosBasis } | null>(
    null,
  )
  /** Expanded ingredient card (compact list like meals). */
  const [editingIngredientIndex, setEditingIngredientIndex] = useState<number | null>(null)
  /** Catalog replace / search for one ingredient. */
  const [replacingIndex, setReplacingIndex] = useState<number | null>(null)
  const [replaceQuery, setReplaceQuery] = useState('')
  const [relatedOpenIndex, setRelatedOpenIndex] = useState<number | null>(null)
  /** Add ingredient from catalog. */
  const [addOpen, setAddOpen] = useState(false)
  const [addQuery, setAddQuery] = useState('')
  /** Free-text recipe — shown for new dishes or when recalculating. */
  const [showRecipeText, setShowRecipeText] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [dishCategory, setDishCategory] = useState<DishCategoryId>('other')
  const [dishCategoryTouched, setDishCategoryTouched] = useState(false)

  const dishes = useMemo(
    () =>
      data.foods
        .filter((f) => f.kind === 'dish')
        .sort((a, b) => a.name.localeCompare(b.name, 'ru')),
    [data.foods],
  )

  const visibleDishes = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return dishes
    return dishes.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        f.aliases.some((a) => a.toLowerCase().includes(q)),
    )
  }, [dishes, query])

  const dishGroups = useMemo(() => groupByDishCategory(visibleDishes), [visibleDishes])

  const syncDishCategory = (name: string, ingredients?: RecipeIngredientLine[]) => {
    if (!dishCategoryTouched) setDishCategory(inferDishCategory(name, ingredients))
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

  /** Catalog for ingredient pick/replace — products and saved dishes. */
  const catalogFoods = useMemo(() => data.foods, [data.foods])

  const replaceFilteredFoods = useMemo(() => {
    const q = normalizeCatalogQuery(replaceQuery)
    const filtered = q
      ? catalogFoods.filter((f) => foodMatchesCatalogQuery(f, q))
      : catalogFoods
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name, 'ru')).slice(0, 48)
  }, [catalogFoods, replaceQuery])

  const addFilteredFoods = useMemo(() => {
    const q = normalizeCatalogQuery(addQuery)
    if (!q) return []
    return [...catalogFoods]
      .filter((f) => foodMatchesCatalogQuery(f, q))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
      .slice(0, 36)
  }, [catalogFoods, addQuery])

  const firstAmbiguousIndex = (ingredients: RecipeIngredientLine[]) =>
    ingredients.findIndex((ing) => {
      if (ing.source === 'library' || !ing.name.trim()) return false
      return catalogPickGroups(ing.name, catalogFoods).primary.length >= 2
    })

  const collapseIngredient = () => {
    setEditingIngredientIndex(null)
    setMacrosEdit(null)
    setReplacingIndex(null)
    setReplaceQuery('')
    setRelatedOpenIndex(null)
  }

  const openIngredient = (index: number) => {
    setEditingIngredientIndex(index)
    setMacrosEdit(null)
    setReplacingIndex(null)
    setReplaceQuery('')
    setRelatedOpenIndex(null)
  }

  const openNew = () => {
    setView('editor')
    setEditId(null)
    setError(null)
    setDraft(null)
    setCookedOverride('')
    cookedOverrideLockedRef.current = false
    setServingBasis('portion')
    setEditingCooked(false)
    setMacrosEdit(null)
    collapseIngredient()
    setAddOpen(false)
    setAddQuery('')
    setShowRecipeText(true)
    setRecipeText('')
    setDishCategory('other')
    setDishCategoryTouched(false)
  }

  const openEdit = (food: FoodItem) => {
    const next = draftFromFoodItem(food)
    setView('editor')
    setEditId(food.id)
    setError(null)
    setDraft(next)
    setCookedOverride(String(next.totalCookedGrams))
    cookedOverrideLockedRef.current = true
    setServingBasis(food.portionGrams != null && food.portionGrams > 0 ? 'portion' : 'per100')
    setEditingCooked(false)
    setMacrosEdit(null)
    collapseIngredient()
    setAddOpen(false)
    setAddQuery('')
    setShowRecipeText(false)
    setRecipeText(recipeEditorText(food))
    setDishCategory(resolveDishCategory(food))
    setDishCategoryTouched(Boolean(food.category))
  }

  const backToList = () => {
    setView('list')
    setEditId(null)
    setDraft(null)
    setError(null)
    cookedOverrideLockedRef.current = false
    setServingBasis('portion')
    setEditingCooked(false)
    setMacrosEdit(null)
    collapseIngredient()
    setAddOpen(false)
    setAddQuery('')
    setShowRecipeText(true)
    setDishCategory('other')
    setDishCategoryTouched(false)
  }

  const runRecipeParse = async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await parseRecipe(recipeText, foodsRef)
      setDraft(result)
      setCookedOverride(String(result.totalCookedGrams))
      // Fresh parse: follow yields unless the user later edits «Готовый».
      cookedOverrideLockedRef.current = false
      setEditingCooked(false)
      setMacrosEdit(null)
      setReplacingIndex(null)
      setReplaceQuery('')
      setRelatedOpenIndex(null)
      const ambiguous = firstAmbiguousIndex(result.ingredients)
      setEditingIngredientIndex(ambiguous >= 0 ? ambiguous : null)
      setShowRecipeText(false)
      if (!dishCategoryTouched) {
        setDishCategory(inferDishCategory(result.name, result.ingredients))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось разобрать рецепт')
    } finally {
      setBusy(false)
    }
  }

  const lockedCookedOverride = (): number | null => {
    if (!cookedOverrideLockedRef.current) return null
    const override = Number(String(cookedOverrideRef.current).replace(',', '.'))
    return Number.isFinite(override) && override > 0 ? override : null
  }

  const recomputeDraft = (
    prev: RecipeDraft,
    ingredients: RecipeIngredientLine[],
  ): RecipeDraft => {
    const next = computeRecipe({
      name: prev.name,
      ingredients,
      cookedGramsOverride: lockedCookedOverride(),
      notes: prev.notes,
    })
    if (!cookedOverrideLockedRef.current) {
      const value = String(next.totalCookedGrams)
      cookedOverrideRef.current = value
      setCookedOverride(value)
    }
    return next
  }

  const updateIngredient = (index: number, patch: Partial<RecipeIngredientLine>) => {
    // Portion 0 would wipe the row via old computeRecipe filter — reject like meals.
    if (patch.gramsRaw != null && !(patch.gramsRaw > 0)) return
    setDraft((prev) => {
      if (!prev) return prev
      const ingredients = prev.ingredients.map((ing, i) => {
        if (i !== index) return ing
        const next = { ...ing, ...patch }
        // Rename clears catalog link (manual rematch via picker).
        if (
          patch.name != null &&
          patch.name.trim() !== ing.name.trim() &&
          patch.foodId === undefined &&
          patch.source === undefined
        ) {
          return {
            ...next,
            foodId: undefined,
            source: 'estimate' as const,
          }
        }
        return next
      })
      return recomputeDraft(prev, ingredients)
    })
  }

  const replaceIngredient = (index: number, food: FoodItem) => {
    setDraft((prev) => {
      if (!prev) return prev
      const ingredients = prev.ingredients.map((ing, i) =>
        i === index ? replaceIngredientWithFood(ing, food) : ing,
      )
      return recomputeDraft(prev, ingredients)
    })
    setReplacingIndex(null)
    setReplaceQuery('')
    setRelatedOpenIndex(null)
  }

  const removeIngredient = (index: number) => {
    setDraft((prev) => {
      if (!prev) return prev
      const ingredients = prev.ingredients.filter((_, i) => i !== index)
      return recomputeDraft(prev, ingredients)
    })
    setMacrosEdit((cur) => {
      if (cur == null) return null
      if (cur.index === index) return null
      if (cur.index > index) return { ...cur, index: cur.index - 1 }
      return cur
    })
    setEditingIngredientIndex((cur) => {
      if (cur == null) return null
      if (cur === index) return null
      if (cur > index) return cur - 1
      return cur
    })
    setReplacingIndex((cur) => {
      if (cur == null) return null
      if (cur === index) return null
      if (cur > index) return cur - 1
      return cur
    })
    setRelatedOpenIndex((cur) => {
      if (cur == null) return null
      if (cur === index) return null
      if (cur > index) return cur - 1
      return cur
    })
  }

  const addFromFood = (food: FoodItem) => {
    let newIndex = 0
    setDraft((prev) => {
      if (!prev) return prev
      newIndex = prev.ingredients.length
      const ingredients = [...prev.ingredients, ingredientLineFromFood(food)]
      return recomputeDraft(prev, ingredients)
    })
    setAddOpen(false)
    setAddQuery('')
    openIngredient(newIndex)
  }

  const addManualIngredient = () => {
    const name = addQuery.trim() || 'Ингредиент'
    let newIndex = 0
    setDraft((prev) => {
      if (!prev) return prev
      newIndex = prev.ingredients.length
      const ingredients: RecipeIngredientLine[] = [
        ...prev.ingredients,
        {
          name,
          gramsRaw: 100,
          per100g: { kcal: 0, protein: 0, fat: 0, carbs: 0 },
          source: 'estimate',
          yieldFactor: 1,
        },
      ]
      return recomputeDraft(prev, ingredients)
    })
    setAddOpen(false)
    setAddQuery('')
    openIngredient(newIndex)
  }

  const commitCookedGrams = (n: number) => {
    if (!(n > 0)) return
    const value = String(n)
    setCookedOverride(value)
    cookedOverrideRef.current = value
    cookedOverrideLockedRef.current = true
    setDraft((prev) => {
      if (!prev) return prev
      return computeRecipe({
        name: prev.name,
        ingredients: prev.ingredients,
        cookedGramsOverride: n,
        notes: prev.notes,
      })
    })
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
    setDraft((prev) => {
      if (!prev) return prev
      const cooked = { ...ingredientPer100CookedForDish(ing, prev), ...patch }
      const ingredients = prev.ingredients.map((row, i) =>
        i === index
          ? {
              ...row,
              per100g: ingredientPer100RawFromDishCooked(cooked, row, prev),
              foodId: undefined,
              source: 'estimate' as const,
            }
          : row,
      )
      return recomputeDraft(prev, ingredients)
    })
  }

  const saveRecipe = async () => {
    if (!draft) return
    if (!draft.name.trim()) {
      setError('Укажите название блюда')
      return
    }
    const portionGrams =
      servingBasis === 'portion' && draft.totalCookedGrams > 0 ? draft.totalCookedGrams : null
    setBusy(true)
    setError(null)
    try {
      await onSave(
        recipeToFoodItem(draft, editId ?? undefined, recipeText, portionGrams, dishCategory),
      )
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
        {!draft && (
          <p className="muted small">
            Ингредиенты с весом до готовки → КБЖУ готового с учётом набухания/ужарки
          </p>
        )}

        {error && <p className="form-msg error">{error}</p>}

        {draft && (
          <div className="panel confirm-panel">
            <label className="field">
              <span>Название блюда</span>
              <input
                value={draft.name}
                onChange={(e) => {
                  const name = e.target.value
                  const ingredients = draft.ingredients
                  setDraft((prev) => (prev ? { ...prev, name } : prev))
                  syncDishCategory(name, ingredients)
                }}
                placeholder="Название блюда"
              />
            </label>

            <CategorySelect
              kind="dish"
              value={dishCategory}
              onChange={(id) => {
                setDishCategoryTouched(true)
                setDishCategory(id as DishCategoryId)
              }}
              disabled={busy}
            />

            <div className="meal-type-chips-inline" role="group" aria-label="Как считать блюдо">
              <button
                type="button"
                className={`meal-type-chip${servingBasis === 'per100' ? ' active' : ''}`}
                onClick={() => setServingBasis('per100')}
              >
                на 100 г
              </button>
              <button
                type="button"
                className={`meal-type-chip${servingBasis === 'portion' ? ' active' : ''}`}
                onClick={() => setServingBasis('portion')}
              >
                на порцию
              </button>
            </div>

            <div className="recipe-per100-hero">
              <span className="recipe-per100-hero-label">
                {servingBasis === 'portion'
                  ? `На порцию (${draft.totalCookedGrams} г)`
                  : 'На 100 г готового'}
              </span>
              <strong className="recipe-per100-hero-value">
                {formatMacros(
                  servingBasis === 'portion'
                    ? draft.totalMacros
                    : dishPer100g(draft.totalMacros, draft.totalCookedGrams),
                )}
              </strong>
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
              <span className="recipe-summary-sep">·</span>
              {servingBasis === 'portion' ? 'в приём — вся порция' : 'в приём — 100 г'}
            </p>

            <ul className="draft-list">
              {draft.ingredients.map((ing, index) => {
                const per100Cooked = ingredientPer100CookedForDish(ing, draft)
                // Show сырой×выход — pan override only affects dish density / «на 100 г».
                const cookedGrams = ingredientCookedGramsFromYield(ing)
                const portionMacros = scalePer100g(ing.per100g, Math.max(ing.gramsRaw, 0))
                const editing = macrosEdit?.index === index ? macrosEdit.basis : null
                const linked = ing.foodId
                  ? catalogFoods.find((f) => f.id === ing.foodId)
                  : undefined
                const fromLibrary = Boolean(linked)
                const pickGroups = fromLibrary
                  ? { primary: [] as FoodItem[], related: [] as FoodItem[] }
                  : catalogPickGroups(ing.name, catalogFoods)
                const needsPick = !fromLibrary && pickGroups.primary.length >= 2
                const hasRelated = !fromLibrary && pickGroups.related.length > 0
                const replacing = replacingIndex === index
                const showPickPanel =
                  !replacing && (needsPick || hasRelated)
                const expanded = editingIngredientIndex === index
                const label = ing.name.trim() || 'ингредиент'
                const canEditMacros = !fromLibrary

                if (!expanded) {
                  return (
                    <li key={`${ing.name}-${index}`} className="draft-item draft-item-compact">
                      <button
                        type="button"
                        className="draft-compact-main draft-compact-open"
                        onClick={() => openIngredient(index)}
                        aria-label={`Редактировать ${label}`}
                      >
                        <div className="draft-compact-text">
                          <div className="draft-compact-title">
                            <strong className="draft-compact-name">
                              {ing.name.trim() || 'Без названия'}
                            </strong>
                            {!fromLibrary && (
                              <span className="badge">
                                {needsPick ? 'уточните' : 'примерно'}
                              </span>
                            )}
                          </div>
                          <p className="muted small">
                            {ing.gramsRaw} г · ×{ing.yieldFactor} → {cookedGrams} г ·{' '}
                            {formatMacros(portionMacros)}
                          </p>
                        </div>
                      </button>
                    </li>
                  )
                }

                return (
                  <li key={`${ing.name}-${index}`} className="draft-item">
                    <div className="draft-item-top">
                      {fromLibrary ? (
                        <div className="field grow">
                          <span>Продукт</span>
                          <button
                            type="button"
                            className={`draft-item-title-name draft-item-title-btn${replacing ? ' active' : ''}`}
                            onClick={() => {
                              if (replacing) {
                                setReplacingIndex(null)
                                setReplaceQuery('')
                                return
                              }
                              setReplacingIndex(index)
                              setReplaceQuery(ing.name)
                              setMacrosEdit(null)
                              setRelatedOpenIndex(null)
                            }}
                            aria-expanded={replacing}
                            aria-label={`Заменить ${label}`}
                            title="Заменить продукт"
                          >
                            <span className="draft-item-title-text">{ing.name}</span>
                          </button>
                        </div>
                      ) : (
                        <div className="field grow">
                          <span>
                            Название
                            {needsPick ? ' · уточните' : ' · примерно'}
                          </span>
                          <div className="draft-name-with-action">
                            <input
                              value={ing.name}
                              onChange={(e) => updateIngredient(index, { name: e.target.value })}
                              placeholder="Ингредиент"
                            />
                            <button
                              type="button"
                              className={`icon-btn sm draft-rematch-btn${replacing ? ' active' : ''}`}
                              onClick={() => {
                                if (replacing) {
                                  setReplacingIndex(null)
                                  setReplaceQuery('')
                                  return
                                }
                                setMacrosEdit(null)
                                setRelatedOpenIndex(null)
                                setReplacingIndex(index)
                                setReplaceQuery(ing.name.trim())
                              }}
                              aria-expanded={replacing}
                              aria-label="Найти в каталоге"
                              title="Найти в каталоге"
                            >
                              <LibraryMenuIcon size={16} />
                            </button>
                          </div>
                        </div>
                      )}
                      <label className="field draft-portion-field">
                        <span>Сырой, г</span>
                        <DecimalInput
                          className="draft-portion-input"
                          value={ing.gramsRaw}
                          onCommit={(gramsRaw) => {
                            if (!(gramsRaw > 0)) return
                            updateIngredient(index, { gramsRaw })
                          }}
                          ariaLabel="Сырой вес, г"
                        />
                      </label>
                    </div>

                    {showPickPanel && (
                      <div className="draft-pick-panel">
                        {needsPick && (
                          <>
                            <p className="draft-pick-title">В каталоге несколько вариантов</p>
                            <ul className="draft-food-list">
                              {pickGroups.primary.map((food) => (
                                <li key={food.id}>
                                  <button
                                    type="button"
                                    className="draft-food-option"
                                    onClick={() => replaceIngredient(index, food)}
                                  >
                                    <strong>{food.name}</strong>
                                    <span className="muted small">
                                      {food.brand ? `${food.brand} · ` : ''}
                                      {Math.round(food.per100g.kcal)} ккал / 100 г
                                      {food.portionGrams != null && food.portionGrams > 0
                                        ? ` · порция ${food.portionGrams} г`
                                        : ''}
                                    </span>
                                  </button>
                                </li>
                              ))}
                            </ul>
                          </>
                        )}
                        {hasRelated && (
                          <div className="draft-pick-related">
                            <button
                              type="button"
                              className={
                                needsPick
                                  ? 'draft-pick-related-toggle draft-pick-related-toggle-nested'
                                  : 'draft-pick-related-toggle'
                              }
                              aria-expanded={relatedOpenIndex === index}
                              onClick={() =>
                                setRelatedOpenIndex((cur) => (cur === index ? null : index))
                              }
                            >
                              <span>
                                {needsPick ? 'Похожие' : 'Похожие в каталоге'}
                                <span className="muted"> · {pickGroups.related.length}</span>
                              </span>
                              <span className="draft-pick-related-chevron" aria-hidden>
                                {relatedOpenIndex === index ? '▾' : '▸'}
                              </span>
                            </button>
                            {relatedOpenIndex === index && (
                              <ul className="draft-food-list">
                                {pickGroups.related.map((food) => (
                                  <li key={food.id}>
                                    <button
                                      type="button"
                                      className="draft-food-option"
                                      onClick={() => replaceIngredient(index, food)}
                                    >
                                      <strong>{food.name}</strong>
                                      <span className="muted small">
                                        {food.brand ? `${food.brand} · ` : ''}
                                        {Math.round(food.per100g.kcal)} ккал / 100 г
                                        {food.portionGrams != null && food.portionGrams > 0
                                          ? ` · порция ${food.portionGrams} г`
                                          : ''}
                                      </span>
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {replacing && (
                      <div className="draft-replace-panel">
                        <label className="field">
                          <span>Поиск в каталоге</span>
                          <input
                            value={replaceQuery}
                            onChange={(e) => setReplaceQuery(e.target.value)}
                            placeholder="Название или бренд"
                            autoFocus
                          />
                        </label>
                        <div className="draft-food-picker">
                          {replaceFilteredFoods.length === 0 ? (
                            <p className="muted small">
                              {normalizeCatalogQuery(replaceQuery)
                                ? 'Ничего не найдено — попробуйте другое слово.'
                                : 'В каталоге пока пусто.'}
                            </p>
                          ) : (
                            <ul className="draft-food-list">
                              {replaceFilteredFoods.map((food) => (
                                <li key={food.id}>
                                  <button
                                    type="button"
                                    className="draft-food-option"
                                    onClick={() => replaceIngredient(index, food)}
                                  >
                                    <span className="food-row-title">
                                      <strong>{food.name}</strong>
                                      {food.brand && (
                                        <span className="brand-chip">{food.brand}</span>
                                      )}
                                      {food.kind === 'dish' && (
                                        <span className="muted small"> · рецепт</span>
                                      )}
                                    </span>
                                    <span className="muted small">
                                      {Math.round(food.per100g.kcal)} ккал / 100 г
                                      {food.portionGrams != null && food.portionGrams > 0
                                        ? ` · порция ${food.portionGrams} г`
                                        : ''}
                                    </span>
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                        <button
                          type="button"
                          className="link-btn"
                          onClick={() => {
                            setReplacingIndex(null)
                            setReplaceQuery('')
                          }}
                        >
                          Отмена
                        </button>
                      </div>
                    )}

                    <p className="muted small">
                      Выход ×{ing.yieldFactor}
                      {ing.yieldNote ? ` — ${ing.yieldNote}` : ''} → {cookedGrams} г готового
                    </p>

                    <div className="draft-kbju-rows">
                      <button
                        type="button"
                        className={`draft-kbju-row${editing === 'cooked' ? ' active' : ''}`}
                        onClick={() => canEditMacros && toggleMacrosEdit(index, 'cooked')}
                        disabled={!canEditMacros}
                      >
                        <span className="draft-kbju-label">На 100 г готового</span>
                        <span>{formatMacros(per100Cooked)}</span>
                      </button>
                      <button
                        type="button"
                        className={`draft-kbju-row${editing === 'raw' ? ' active' : ''}`}
                        onClick={() => canEditMacros && toggleMacrosEdit(index, 'raw')}
                        disabled={!canEditMacros}
                      >
                        <span className="draft-kbju-label">На 100 г сырого</span>
                        <span>{formatMacros(ing.per100g)}</span>
                      </button>
                    </div>
                    {fromLibrary && (
                      <p className="muted small draft-kbju-hint">
                        КБЖУ из каталога — меняйте сырой вес, нажмите название чтобы заменить,
                        или отвяжите для ручного ввода.
                      </p>
                    )}

                    <label className="field draft-portion-field">
                      <span>Коэфф. выхода</span>
                      <DecimalInput
                        value={ing.yieldFactor}
                        onCommit={(yieldFactor) => {
                          if (yieldFactor > 0) updateIngredient(index, { yieldFactor })
                        }}
                        ariaLabel="Коэффициент выхода"
                      />
                    </label>

                    {canEditMacros && editing && (
                      <div className="draft-macros">
                        <p className="muted small">
                          {editing === 'cooked'
                            ? 'КБЖУ на 100 г готового'
                            : 'КБЖУ на 100 г сырого'}
                        </p>
                        <div className="form-grid four compact draft-macros-grid">
                          {(
                            [
                              ['kcal', 'Ккал'],
                              ['protein', 'Белки'],
                              ['fat', 'Жиры'],
                              ['carbs', 'Углеводы'],
                            ] as const
                          ).map(([key, fieldLabel]) => {
                            const basisMacros =
                              editing === 'cooked' ? per100Cooked : ing.per100g
                            return (
                              <label key={key} className="field">
                                <span>{fieldLabel}</span>
                                <DecimalInput
                                  value={basisMacros[key]}
                                  onCommit={(n) =>
                                    commitIngredientMacros(index, ing, editing, { [key]: n })
                                  }
                                  ariaLabel={fieldLabel}
                                />
                              </label>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    <div className="draft-item-footer">
                      <div className="draft-item-footer-links">
                        {fromLibrary && (
                          <button
                            type="button"
                            className="link-btn draft-remember-btn"
                            onClick={() => {
                              updateIngredient(index, {
                                foodId: undefined,
                                source: 'estimate',
                              })
                              setMacrosEdit({ index, basis: 'raw' })
                            }}
                          >
                            Править КБЖУ вручную
                          </button>
                        )}
                      </div>
                      <div className="draft-item-footer-actions">
                        <button
                          type="button"
                          className="primary-btn draft-done-btn"
                          onClick={collapseIngredient}
                        >
                          Готово
                        </button>
                        <button
                          type="button"
                          className="icon-btn danger"
                          onClick={() => removeIngredient(index)}
                          aria-label={`Удалить ${label}`}
                          title="Удалить"
                        >
                          <TrashIcon size={18} />
                        </button>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>

            {!addOpen ? (
              <button
                type="button"
                className="ghost-btn icon-cta draft-add-btn"
                onClick={() => {
                  setAddOpen(true)
                  collapseIngredient()
                }}
                aria-label="Добавить продукт"
                title="Добавить продукт"
              >
                <PlusIcon size={20} />
              </button>
            ) : (
              <div className="draft-add-panel">
                <label className="field">
                  <span>Продукт из справочника</span>
                  <input
                    value={addQuery}
                    onChange={(e) => setAddQuery(e.target.value)}
                    placeholder="Название или бренд"
                    autoFocus
                  />
                </label>
                <div className="draft-food-picker">
                  {addFilteredFoods.length === 0 ? (
                    <p className="muted small">
                      {normalizeCatalogQuery(addQuery)
                        ? 'Ничего не найдено — добавьте вручную или уточните запрос.'
                        : 'Начните вводить название продукта.'}
                    </p>
                  ) : (
                    <ul className="draft-food-list">
                      {addFilteredFoods.map((food) => (
                        <li key={food.id}>
                          <button
                            type="button"
                            className="draft-food-option"
                            onClick={() => addFromFood(food)}
                          >
                            <span className="food-row-title">
                              <strong>{food.name}</strong>
                              {food.brand && <span className="brand-chip">{food.brand}</span>}
                              {food.kind === 'dish' && (
                                <span className="muted small"> · рецепт</span>
                              )}
                            </span>
                            <span className="muted small">
                              {Math.round(food.per100g.kcal)} ккал / 100 г
                              {food.portionGrams != null && food.portionGrams > 0
                                ? ` · порция ${food.portionGrams} г`
                                : ''}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="draft-add-actions">
                  <button type="button" className="ghost-btn" onClick={addManualIngredient}>
                    Добавить вручную
                  </button>
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => {
                      setAddOpen(false)
                      setAddQuery('')
                    }}
                  >
                    Отмена
                  </button>
                </div>
              </div>
            )}

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
                    cookedOverrideLockedRef.current = false
                    setServingBasis('portion')
                    setEditingCooked(false)
                    setMacrosEdit(null)
                    collapseIngredient()
                    setAddOpen(false)
                    setAddQuery('')
                    setShowRecipeText(true)
                  }}
                >
                  Сбросить расчёт
                </button>
              )}
            </div>
          </div>
        )}

        {draft && !showRecipeText && (
          <button
            type="button"
            className="link-btn"
            onClick={() => setShowRecipeText(true)}
          >
            Пересчитать из текста
          </button>
        )}

        {showRecipeText && (
          <>
            <label className="field">
              <span>Рецепт текстом</span>
              <textarea
                rows={draft ? 6 : 8}
                value={recipeText}
                onChange={(e) => setRecipeText(e.target.value)}
                placeholder={RECIPE_PLACEHOLDER}
              />
            </label>
            <div className="btn-row">
              <button
                type="button"
                className="primary-btn"
                disabled={busy || !recipeText.trim()}
                onClick={() => void runRecipeParse()}
              >
                {busy ? 'Считаю…' : draft ? 'Рассчитать заново' : 'Рассчитать блюдо'}
              </button>
              {draft && (
                <button
                  type="button"
                  className="ghost-btn"
                  disabled={busy}
                  onClick={() => setShowRecipeText(false)}
                >
                  Скрыть
                </button>
              )}
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="panel-stack">
      <div className="catalog-toolbar">
        <label className="field catalog-search">
          <span className="visually-hidden">Поиск рецепта</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Найти рецепт…"
            autoComplete="off"
          />
        </label>
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
      <CatalogSections
        groups={dishGroups}
        expandAll={Boolean(query.trim())}
        getKey={(food) => food.id}
        empty={
          <li className="muted">
            {dishes.length === 0
              ? 'Пока пусто — нажмите +.'
              : `Ничего не найдено по «${query.trim()}».`}
          </li>
        }
        renderItem={(food) => (
          <div className="food-row food-row-icons">
            <button
              type="button"
              className="food-row-body food-row-open"
              onClick={() => openEdit(food)}
            >
              <strong>{food.name}</strong>
              <p className="muted small">
                {food.per100g.kcal} ккал · Б {food.per100g.protein} · Ж {food.per100g.fat} · У{' '}
                {food.per100g.carbs} / 100 г
                {food.portionGrams != null && food.portionGrams > 0 && (
                  <>
                    <br />
                    {(() => {
                      const p = scalePer100g(food.per100g, food.portionGrams)
                      return `порция ${food.portionGrams} г → ${Math.round(p.kcal)} ккал · Б ${p.protein} · Ж ${p.fat} · У ${p.carbs}`
                    })()}
                  </>
                )}
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
          </div>
        )}
      />
    </div>
  )
}
