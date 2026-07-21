import { useMemo, useState } from 'react'
import { foodVariants } from '../lib/foodVariants'
import { round1, scalePer100g, sumMacros } from '../lib/nutrition'
import type { AppData, FoodItem, MacroSet, MealItem, ParsedMealDraft } from '../types'
import { CloseIcon } from './CloseIcon'
import { DecimalInput } from './DecimalInput'
import { PlusIcon } from './PlusIcon'
import { TrashIcon } from './TrashIcon'

export function emptyMealItem(): MealItem {
  return {
    name: '',
    grams: 100,
    kcal: 0,
    protein: 0,
    fat: 0,
    carbs: 0,
    source: 'estimate',
  }
}

export function mealItemFromFood(food: FoodItem, grams = 100): MealItem {
  return {
    name: food.name,
    grams,
    foodId: food.id,
    ...scalePer100g(food.per100g, grams),
    source: 'library',
  }
}

function per100FromPortion(item: MealItem): MacroSet | null {
  if (!(item.grams > 0)) return null
  const k = 100 / item.grams
  return {
    kcal: round1(item.kcal * k),
    protein: round1(item.protein * k),
    fat: round1(item.fat * k),
    carbs: round1(item.carbs * k),
  }
}

function formatMacros(m: Pick<MacroSet, 'kcal' | 'protein' | 'fat' | 'carbs'>): string {
  return `${Math.round(m.kcal)} ккал · Б ${m.protein} · Ж ${m.fat} · У ${m.carbs}`
}

function formatPortion(item: MealItem): string {
  return formatMacros(item)
}

function portionFromPer100(per100: MacroSet, grams: number): MacroSet {
  return scalePer100g(per100, grams)
}

type MacrosBasis = 'per100' | 'portion'

function clampMacroPatch(patch: Partial<MealItem>): Partial<MealItem> {
  const out: Partial<MealItem> = { ...patch }
  for (const key of ['grams', 'kcal', 'protein', 'fat', 'carbs'] as const) {
    const v = out[key]
    if (v != null && (!Number.isFinite(v) || v < 0)) delete out[key]
  }
  return out
}

export function applyItemPatch(
  items: MealItem[],
  index: number,
  patch: Partial<MealItem>,
  foods: FoodItem[],
): MealItem[] {
  const safe = clampMacroPatch(patch)
  return items.map((item, i) => {
    if (i !== index) return item

    if (safe.source === 'library') {
      return { ...item, ...safe, source: 'library' as const }
    }

    const editingMacros =
      safe.kcal != null || safe.protein != null || safe.fat != null || safe.carbs != null

    if (editingMacros && safe.grams == null) {
      return {
        ...item,
        ...safe,
        foodId: undefined,
        source: 'estimate' as const,
      }
    }

    // Renaming breaks the library link — otherwise old КБЖУ stick to a new name.
    if (safe.name != null && safe.name.trim() !== item.name.trim()) {
      return {
        ...item,
        ...safe,
        name: safe.name,
        foodId: undefined,
        source: 'estimate' as const,
      }
    }

    const next = { ...item, ...safe }
    const foodId = safe.foodId ?? item.foodId
    if (safe.grams != null && foodId) {
      const food = foods.find((f) => f.id === foodId)
      if (food) {
        const macros = scalePer100g(food.per100g, safe.grams)
        return { ...next, foodId, ...macros, source: 'library' as const }
      }
    }
    if (safe.grams != null && item.grams > 0) {
      const k = safe.grams / item.grams
      return {
        ...next,
        kcal: Math.round(item.kcal * k * 10) / 10,
        protein: Math.round(item.protein * k * 10) / 10,
        fat: Math.round(item.fat * k * 10) / 10,
        carbs: Math.round(item.carbs * k * 10) / 10,
      }
    }
    return next
  })
}

export function patchDraft(
  draft: ParsedMealDraft,
  index: number,
  patch: Partial<MealItem>,
  foods: FoodItem[],
): ParsedMealDraft {
  const items = applyItemPatch(draft.items, index, patch, foods)
  return {
    ...draft,
    items,
    totals: sumMacros(items),
    isApproximate: draft.eatingOut || items.some((i) => i.source === 'estimate'),
  }
}

type Props = {
  data: AppData
  items: MealItem[]
  onChangeItem: (index: number, patch: Partial<MealItem>) => void
  onRemoveItem?: (index: number) => void
  onAddItem?: (seed?: Partial<MealItem>) => void
  onAddFromFood?: (food: FoodItem) => void
  onEstimateProduct?: (text: string) => Promise<void>
  estimatingProduct?: boolean
  onSaveToLibrary?: (index: number) => void
  savingFoodIndex?: number | null
  /** Collapsed rows by default; expand one item with the pencil. */
  collapsible?: boolean
}

export function MealDraftEditor({
  data,
  items,
  onChangeItem,
  onRemoveItem,
  onAddItem,
  onAddFromFood,
  onEstimateProduct,
  estimatingProduct = false,
  onSaveToLibrary,
  savingFoodIndex = null,
  collapsible = false,
}: Props) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [macrosEdit, setMacrosEdit] = useState<{ index: number; basis: MacrosBasis } | null>(
    null,
  )
  const [addOpen, setAddOpen] = useState(false)
  const [addQuery, setAddQuery] = useState('')
  const [estimateError, setEstimateError] = useState<string | null>(null)

  const collapseItem = () => {
    setEditingIndex(null)
    setMacrosEdit(null)
  }

  const openItem = (index: number) => {
    setEditingIndex(index)
    setMacrosEdit(null)
  }

  const toggleMacrosEdit = (index: number, basis: MacrosBasis) => {
    setMacrosEdit((cur) =>
      cur?.index === index && cur.basis === basis ? null : { index, basis },
    )
  }

  const commitPer100 = (index: number, item: MealItem, patch: Partial<MacroSet>) => {
    const base = per100FromPortion(item) ?? {
      kcal: 0,
      protein: 0,
      fat: 0,
      carbs: 0,
    }
    const next = { ...base, ...patch }
    onChangeItem(index, portionFromPer100(next, item.grams > 0 ? item.grams : 100))
  }

  const filteredFoods = useMemo(() => {
    const q = addQuery.trim().toLowerCase()
    if (!q) return []
    return [...data.foods]
      .filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          f.aliases.some((a) => a.toLowerCase().includes(q)),
      )
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
      .slice(0, 36)
  }, [data.foods, addQuery])

  const removeAt = (index: number) => {
    onRemoveItem?.(index)
    setMacrosEdit((cur) => {
      if (cur == null) return null
      if (cur.index === index) return null
      if (cur.index > index) return { ...cur, index: cur.index - 1 }
      return cur
    })
    setEditingIndex((cur) => {
      if (cur == null) return null
      if (cur === index) return null
      if (cur > index) return cur - 1
      return cur
    })
  }

  const closeAdd = () => {
    setAddOpen(false)
    setAddQuery('')
    setEstimateError(null)
  }

  const pickFood = (food: FoodItem) => {
    onAddFromFood?.(food)
    openItem(items.length)
    closeAdd()
  }

  const addManual = () => {
    const name = addQuery.trim()
    onAddItem?.(name ? { name } : undefined)
    openItem(items.length)
    closeAdd()
  }

  const runEstimate = async () => {
    const q = addQuery.trim()
    if (!q || !onEstimateProduct || estimatingProduct) return
    setEstimateError(null)
    try {
      await onEstimateProduct(q)
      openItem(items.length)
      closeAdd()
    } catch (err) {
      setEstimateError(err instanceof Error ? err.message : 'Не удалось рассчитать')
    }
  }

  const hasAddPanel = Boolean(onAddItem || onAddFromFood || onEstimateProduct)

  return (
    <div className="draft-editor">
    <ul className="draft-list">
      {items.map((item, index) => {
        const linked = item.foodId ? data.foods.find((f) => f.id === item.foodId) : undefined
        // Trust catalog link even if the model left source=estimate.
        const fromLibrary = Boolean(linked)
        const per100 = linked ? linked.per100g : per100FromPortion(item)
        const variants = linked ? foodVariants(linked, data.foods) : []
        const expanded = !collapsible || editingIndex === index
        const label = item.name.trim() || 'продукт'

        if (!expanded) {
          return (
            <li key={`item-${index}`} className="draft-item draft-item-compact">
              <button
                type="button"
                className="draft-compact-main draft-compact-open"
                onClick={() => openItem(index)}
                aria-label={`Редактировать ${label}`}
              >
                <div className="draft-compact-text">
                  <div className="draft-compact-title">
                    <strong className="draft-compact-name">{item.name.trim() || 'Без названия'}</strong>
                    {!fromLibrary && <span className="badge">примерно</span>}
                  </div>
                  <p className="muted small">
                    {item.grams} г · {formatPortion(item)}
                  </p>
                </div>
              </button>
            </li>
          )
        }

        return (
          <li key={`item-${index}`} className="draft-item">
            <div className="draft-item-top">
              {fromLibrary ? (
                <div className="field grow">
                  <span>Название</span>
                  <div className="draft-item-title-name">{item.name}</div>
                </div>
              ) : (
                <label className="field grow">
                  <span>Название</span>
                  <input
                    value={item.name}
                    onChange={(e) => onChangeItem(index, { name: e.target.value })}
                    placeholder="Продукт"
                  />
                </label>
              )}
              <label className="field draft-portion-field">
                <span>Порция, г</span>
                <DecimalInput
                  className="draft-portion-input"
                  value={item.grams}
                  onCommit={(grams) => onChangeItem(index, { grams })}
                  ariaLabel="Порция, г"
                />
              </label>
            </div>

            <div className="draft-kbju-rows">
              {per100 && (
                <button
                  type="button"
                  className={`draft-kbju-row${macrosEdit?.index === index && macrosEdit.basis === 'per100' ? ' active' : ''}`}
                  onClick={() => toggleMacrosEdit(index, 'per100')}
                >
                  <span className="draft-kbju-label">На 100 г</span>
                  <span>{formatMacros(per100)}</span>
                </button>
              )}
              <button
                type="button"
                className={`draft-kbju-row${macrosEdit?.index === index && macrosEdit.basis === 'portion' ? ' active' : ''}`}
                onClick={() => toggleMacrosEdit(index, 'portion')}
              >
                <span className="draft-kbju-label">Порция</span>
                <span>{formatMacros(item)}</span>
              </button>
            </div>

            {macrosEdit?.index === index && (
              <div className="draft-macros">
                <p className="muted small">
                  {macrosEdit.basis === 'per100' ? 'КБЖУ на 100 г' : 'КБЖУ порции'}
                </p>
                <div className="form-grid four compact draft-macros-grid">
                  <label className="field">
                    <span>Ккал</span>
                    <DecimalInput
                      value={
                        macrosEdit.basis === 'per100'
                          ? (per100?.kcal ?? 0)
                          : item.kcal
                      }
                      onCommit={(kcal) =>
                        macrosEdit.basis === 'per100'
                          ? commitPer100(index, item, { kcal })
                          : onChangeItem(index, { kcal })
                      }
                      ariaLabel="Ккал"
                    />
                  </label>
                  <label className="field">
                    <span>Белки</span>
                    <DecimalInput
                      value={
                        macrosEdit.basis === 'per100'
                          ? (per100?.protein ?? 0)
                          : item.protein
                      }
                      onCommit={(protein) =>
                        macrosEdit.basis === 'per100'
                          ? commitPer100(index, item, { protein })
                          : onChangeItem(index, { protein })
                      }
                      ariaLabel="Белки"
                    />
                  </label>
                  <label className="field">
                    <span>Жиры</span>
                    <DecimalInput
                      value={
                        macrosEdit.basis === 'per100'
                          ? (per100?.fat ?? 0)
                          : item.fat
                      }
                      onCommit={(fat) =>
                        macrosEdit.basis === 'per100'
                          ? commitPer100(index, item, { fat })
                          : onChangeItem(index, { fat })
                      }
                      ariaLabel="Жиры"
                    />
                  </label>
                  <label className="field">
                    <span>Углеводы</span>
                    <DecimalInput
                      value={
                        macrosEdit.basis === 'per100'
                          ? (per100?.carbs ?? 0)
                          : item.carbs
                      }
                      onCommit={(carbs) =>
                        macrosEdit.basis === 'per100'
                          ? commitPer100(index, item, { carbs })
                          : onChangeItem(index, { carbs })
                      }
                      ariaLabel="Углеводы"
                    />
                  </label>
                </div>
              </div>
            )}

            {variants.length > 0 && (
              <label className="field">
                <span>Вариант продукта</span>
                <select
                  value={item.foodId ?? ''}
                  onChange={(e) => {
                    if (!e.target.value) return
                    const food = data.foods.find((f) => f.id === e.target.value)
                    if (!food) return
                    const macros = scalePer100g(food.per100g, item.grams)
                    onChangeItem(index, {
                      foodId: food.id,
                      name: food.name,
                      source: 'library',
                      ...macros,
                    })
                  }}
                >
                  {variants.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div className="draft-item-footer">
              {!fromLibrary && onSaveToLibrary && Boolean(item.name.trim()) && (
                <button
                  type="button"
                  className="link-btn draft-remember-btn"
                  disabled={savingFoodIndex != null}
                  onClick={() => onSaveToLibrary(index)}
                >
                  {savingFoodIndex === index ? 'Сохраняю…' : 'Запомнить в мои продукты'}
                </button>
              )}
              {(collapsible || onRemoveItem) && (
                <div className="draft-item-footer-actions">
                  {collapsible && (
                    <button
                      type="button"
                      className="primary-btn draft-done-btn"
                      onClick={collapseItem}
                    >
                      Готово
                    </button>
                  )}
                  {onRemoveItem && (
                    <button
                      type="button"
                      className="icon-btn danger"
                      onClick={() => removeAt(index)}
                      aria-label={`Удалить ${label}`}
                      title="Удалить"
                    >
                      <TrashIcon size={18} />
                    </button>
                  )}
                </div>
              )}
            </div>
          </li>
        )
      })}
    </ul>

    {hasAddPanel && !addOpen && (
      <button
        type="button"
        className="ghost-btn icon-cta draft-add-btn"
        onClick={() => {
          if (onAddFromFood || onEstimateProduct) {
            setAddOpen(true)
            setEstimateError(null)
          } else {
            onAddItem?.()
            openItem(items.length)
          }
        }}
        aria-label="Добавить продукт"
        title="Добавить продукт"
      >
        <PlusIcon size={20} />
      </button>
    )}

    {addOpen && (
      <div className="draft-add-panel">
        <label className="field">
          <span>Мои продукты или описание</span>
          <input
            value={addQuery}
            onChange={(e) => {
              setAddQuery(e.target.value)
              setEstimateError(null)
            }}
            placeholder="Название или «200 г творога»"
            autoFocus
          />
        </label>

        {onAddFromFood && addQuery.trim() && (
          <div className="draft-food-picker">
            {filteredFoods.length === 0 ? (
              <p className="muted small">Ничего не найдено в моих продуктах.</p>
            ) : (
              <ul className="draft-food-list">
                {filteredFoods.map((food) => (
                  <li key={food.id}>
                    <button type="button" className="draft-food-option" onClick={() => pickFood(food)}>
                      <strong>{food.name}</strong>
                      <span className="muted small">
                        {Math.round(food.per100g.kcal)} ккал / 100 г
                        {food.kind === 'dish' ? ' · блюдо' : ''}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {estimateError && <p className="form-msg error">{estimateError}</p>}

        <div className="btn-row draft-add-actions">
          {onEstimateProduct && (
            <button
              type="button"
              className="primary-btn"
              disabled={!addQuery.trim() || estimatingProduct}
              onClick={() => void runEstimate()}
            >
              {estimatingProduct ? 'Считаю…' : 'Рассчитать'}
            </button>
          )}
          {onAddItem && (
            <button type="button" className="ghost-btn" disabled={estimatingProduct} onClick={addManual}>
              Вручную
            </button>
          )}
          <button
            type="button"
            className="icon-btn sm"
            disabled={estimatingProduct}
            onClick={closeAdd}
            aria-label="Закрыть"
            title="Закрыть"
          >
            <CloseIcon size={18} />
          </button>
        </div>
      </div>
    )}
    </div>
  )
}
