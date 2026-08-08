import { useEffect, useMemo, useState } from 'react'
import { defaultFoodGrams } from '../lib/foodPortion'
import { findFoodCandidates, findRelatedFoodCandidates, resolveCatalogMatch } from '../lib/foodMatch'
import { capitalizeFoodName, sameFoodLabel } from '../lib/foodName'
import { unmatchedMealItem } from '../lib/mealUnknown'
import { round1, scalePer100g, sumMacros } from '../lib/nutrition'
import type { AppData, FoodItem, MacroSet, MealItem, ParsedMealDraft } from '../types'
import { CloseIcon } from './CloseIcon'
import { DecimalInput } from './DecimalInput'
import { LibraryMenuIcon } from './MoreMenuIcons'
import { PlusIcon } from './PlusIcon'
import { TrashIcon } from './TrashIcon'

function SourceApproxIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      style={{ width: size, height: size, display: 'block', flexShrink: 0 }}
    >
      <path
        d="M4 12c1.5-2.5 3-3.5 5-3.5s3.5 1 5 3.5 3 3.5 5 3.5 3.5-1 5-3.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

function SourceUnknownIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      style={{ width: size, height: size, display: 'block', flexShrink: 0 }}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M9.6 9.4a2.6 2.6 0 0 1 5 1c0 1.5-2.1 2-2.1 3.4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="12" cy="17" r="1" fill="currentColor" />
    </svg>
  )
}

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

export function mealItemFromFood(food: FoodItem, grams?: number): MealItem {
  const g = grams != null && grams > 0 ? grams : defaultFoodGrams(food)
  return {
    name: food.name,
    grams: g,
    foodId: food.id,
    ...scalePer100g(food.per100g, g),
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

function portionFromPer100(per100: MacroSet, grams: number): MacroSet {
  return scalePer100g(per100, grams)
}

type MacrosBasis = 'per100' | 'portion'

/** Commit name on blur/Enter so rematch does not fire on every keystroke. */
function ItemNameInput({
  value,
  onCommit,
}: {
  value: string
  onCommit: (name: string) => void
}) {
  const [focused, setFocused] = useState(false)
  const [text, setText] = useState(value)

  useEffect(() => {
    if (!focused) setText(value)
  }, [value, focused])

  const commit = () => {
    const next = text
    if (next.trim() !== value.trim()) onCommit(next)
    else setText(value)
  }

  return (
    <input
      value={focused ? text : value}
      placeholder="Продукт"
      onFocus={() => {
        setFocused(true)
        setText(value)
      }}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        setFocused(false)
        commit()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          ;(e.target as HTMLInputElement).blur()
        }
      }}
    />
  )
}

function clampMacroPatch(patch: Partial<MealItem>): Partial<MealItem> {
  const out: Partial<MealItem> = { ...patch }
  for (const key of ['grams', 'kcal', 'protein', 'fat', 'carbs'] as const) {
    const v = out[key]
    if (v != null && (!Number.isFinite(v) || v < 0)) delete out[key]
  }
  // Portion 0 would wipe КБЖУ via scale-to-zero and break «на 100 г».
  if (out.grams != null && !(out.grams > 0)) delete out.grams
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

    if (safe.source === 'library' || safe.source === 'unknown') {
      return { ...item, ...safe, source: safe.source }
    }

    // Explicit detach from catalog (manual КБЖУ).
    if (
      safe.source === 'estimate' &&
      Object.prototype.hasOwnProperty.call(safe, 'foodId') &&
      !safe.foodId
    ) {
      return { ...item, ...safe, foodId: undefined, source: 'estimate' as const }
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

    // Rename only — no silent rematch. Use rematchItemByName / replaceItemWithFood.
    if (safe.name != null && safe.name.trim() !== item.name.trim()) {
      const rawName = safe.name.trim()
      if (!rawName) {
        return {
          ...item,
          name: safe.name,
          foodId: undefined,
          source: 'estimate' as const,
        }
      }
      const name = capitalizeFoodName(rawName)
      if (sameFoodLabel(name, item.name)) {
        return { ...item, name }
      }
      return {
        ...item,
        name,
        foodId: undefined,
        source: item.source === 'unknown' ? ('unknown' as const) : ('estimate' as const),
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

/** Primary disambiguation options + softer «Похожие» (never auto-picked). */
export type CatalogPickGroups = {
  primary: FoodItem[]
  related: FoodItem[]
}

export function catalogPickGroups(name: string, foods: FoodItem[]): CatalogPickGroups {
  const label = name.trim()
  if (!label || foods.length === 0) return { primary: [], related: [] }

  const resolved = resolveCatalogMatch(label, foods, { minScore: 70 })

  let primary: FoodItem[] = []
  let excludeIds: string[] = []

  if (resolved.kind === 'match') {
    // Keep auto-match; still offer softer cousins as «Похожие» (e.g. сыр → творожный сыр).
    excludeIds = [resolved.food.id]
  } else if (resolved.kind === 'ambiguous') {
    primary = resolved.candidates.map((c) => c.food as FoodItem)
    excludeIds = primary.map((f) => f.id)
  } else {
    // Unmatched: still surface near head-stem pairs as primary if several.
    const near = findFoodCandidates(label, foods, 55, 6)
    if (near.length >= 2) {
      primary = near.map((c) => c.food as FoodItem)
      excludeIds = primary.map((f) => f.id)
    }
  }

  const related = findRelatedFoodCandidates(label, foods, excludeIds).map(
    (c) => c.food as FoodItem,
  )

  return { primary, related }
}

/** Catalog variants the user should pick from (ambiguous short query). */
export function catalogPickOptions(name: string, foods: FoodItem[]): FoodItem[] {
  return catalogPickGroups(name, foods).primary
}

export function rematchItemByName(
  items: MealItem[],
  index: number,
  name: string,
  foods: FoodItem[],
): MealItem[] {
  return items.map((item, i) => {
    if (i !== index) return item
    const label = capitalizeFoodName(name.trim() || item.name)
    if (!label) return item
    const resolved = resolveCatalogMatch(label, foods, { minScore: 70 })
    const grams =
      item.grams > 0
        ? item.grams
        : resolved.kind === 'match'
          ? defaultFoodGrams(resolved.food)
          : 100
    if (resolved.kind === 'match') {
      const matched = resolved.food
      return {
        ...item,
        name: matched.name,
        grams,
        foodId: matched.id,
        ...scalePer100g(matched.per100g, grams),
        source: 'library' as const,
      }
    }
    return unmatchedMealItem(label, grams)
  })
}

export function replaceItemWithFood(
  items: MealItem[],
  index: number,
  food: FoodItem,
): MealItem[] {
  return items.map((item, i) => {
    if (i !== index) return item
    const grams = item.grams > 0 ? item.grams : defaultFoodGrams(food)
    return {
      ...item,
      name: food.name,
      grams,
      foodId: food.id,
      ...scalePer100g(food.per100g, grams),
      source: 'library' as const,
    }
  })
}

/** Detach from catalog — keep current КБЖУ, allow manual edits. */
export function unlinkItemFromLibrary(items: MealItem[], index: number): MealItem[] {
  return items.map((item, i) => {
    if (i !== index) return item
    if (!item.foodId && item.source !== 'library') return item
    return {
      ...item,
      foodId: undefined,
      source: 'estimate' as const,
    }
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
    isApproximate:
      draft.eatingOut ||
      items.some((i) => i.source === 'estimate' || i.source === 'unknown'),
  }
}

function sourceMark(fromLibrary: boolean, unmatched: boolean, needsPick = false) {
  if (fromLibrary) {
    return (
      <span className="draft-source-mark ok" title="Из справочника" aria-label="Из справочника">
        <LibraryMenuIcon size={14} />
      </span>
    )
  }
  if (needsPick || unmatched) {
    return (
      <span
        className="draft-source-mark warn"
        title={needsPick ? 'Уточните продукт' : 'Не найдено'}
        aria-label={needsPick ? 'Уточните продукт' : 'Не найдено'}
      >
        <SourceUnknownIcon size={14} />
      </span>
    )
  }
  return (
    <span className="draft-source-mark" title="Примерно" aria-label="Примерно">
      <SourceApproxIcon size={14} />
    </span>
  )
}

function compactMacrosLine(item: MealItem, unmatched: boolean, needsPick: boolean): string {
  if (needsPick) return 'Выберите вариант из справочника'
  if (unmatched) return 'КБЖУ не заданы'
  return `${item.grams} г · ${Math.round(item.kcal)} ккал`
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
  /** Estimate КБЖУ for an unmatched / empty row in place. */
  onEstimateItem?: (index: number) => Promise<void>
  estimatingItemIndex?: number | null
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
  onEstimateItem,
  estimatingItemIndex = null,
  onSaveToLibrary,
  savingFoodIndex = null,
  collapsible = false,
}: Props) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [macrosEdit, setMacrosEdit] = useState<{ index: number; basis: MacrosBasis } | null>(
    null,
  )
  const [replacingIndex, setReplacingIndex] = useState<number | null>(null)
  const [replaceQuery, setReplaceQuery] = useState('')
  const [relatedOpenIndex, setRelatedOpenIndex] = useState<number | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [addQuery, setAddQuery] = useState('')
  const [estimateError, setEstimateError] = useState<string | null>(null)

  const itemsPickKey = items
    .map((i) => `${i.name}|${i.foodId ?? ''}|${i.source}`)
    .join(';')

  useEffect(() => {
    if (!collapsible) return
    const idx = items.findIndex((i) => {
      if (i.foodId) return false
      const g = catalogPickGroups(i.name, data.foods)
      return g.primary.length >= 2 || g.related.length > 0
    })
    if (idx >= 0) setEditingIndex(idx)
  }, [itemsPickKey, collapsible, data.foods, items])

  const collapseItem = () => {
    setEditingIndex(null)
    setMacrosEdit(null)
    setReplacingIndex(null)
    setReplaceQuery('')
    setRelatedOpenIndex(null)
  }

  const openItem = (index: number) => {
    setEditingIndex(index)
    setMacrosEdit(null)
    setReplacingIndex(null)
    setReplaceQuery('')
    setRelatedOpenIndex(null)
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

  const replaceFilteredFoods = useMemo(() => {
    const q = replaceQuery.trim().toLowerCase()
    const list = [...data.foods]
    const filtered = q
      ? list.filter(
          (f) =>
            f.name.toLowerCase().includes(q) ||
            f.aliases.some((a) => a.toLowerCase().includes(q)),
        )
      : list
    return filtered.sort((a, b) => a.name.localeCompare(b.name, 'ru')).slice(0, 36)
  }, [data.foods, replaceQuery])

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

  const applyRematch = (index: number, item: MealItem) => {
    const next = rematchItemByName([item], 0, item.name, data.foods)[0]!
    onChangeItem(index, { ...next })
  }

  const applyReplace = (index: number, item: MealItem, food: FoodItem) => {
    const next = replaceItemWithFood([item], 0, food)[0]!
    onChangeItem(index, { ...next })
    setReplacingIndex(null)
    setReplaceQuery('')
    setRelatedOpenIndex(null)
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
        const fromLibrary = Boolean(linked)
        const unmatched = item.source === 'unknown'
        const estimated = item.source === 'estimate'
        const pickGroups = catalogPickGroups(item.name, data.foods)
        const needsPick = !fromLibrary && pickGroups.primary.length >= 2
        const hasRelated = pickGroups.related.length > 0
        const showPickPanel = needsPick || hasRelated
        const askClarify = needsPick || (!fromLibrary && hasRelated)
        const per100 = linked ? linked.per100g : per100FromPortion(item)
        const portionGrams =
          linked?.portionGrams != null && linked.portionGrams > 0
            ? linked.portionGrams
            : null
        const expanded = !collapsible || editingIndex === index
        const replacing = replacingIndex === index
        const label = item.name.trim() || 'продукт'
        const canEditMacros = !fromLibrary
        const pieces =
          portionGrams != null && item.grams > 0
            ? Math.round((item.grams / portionGrams) * 100) / 100
            : portionGrams != null
              ? 1
              : null

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
                    {sourceMark(fromLibrary, unmatched, askClarify)}
                  </div>
                  <p className="muted small">
                    {compactMacrosLine(item, unmatched, askClarify)}
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
                      setReplaceQuery(item.name)
                      setMacrosEdit(null)
                    }}
                    aria-expanded={replacing}
                    aria-label={`Заменить ${label}`}
                    title="Заменить продукт"
                  >
                    <span className="draft-item-title-text">{item.name}</span>
                    {sourceMark(true, false)}
                  </button>
                </div>
              ) : (
                <div className="field grow">
                  <span>
                    Название
                    {askClarify
                      ? ' · уточните'
                      : unmatched
                        ? ' · не найдено'
                        : ' · примерно'}
                  </span>
                  <div className="draft-name-with-action">
                    <ItemNameInput
                      value={item.name}
                      onCommit={(name) => onChangeItem(index, { name })}
                    />
                    <button
                      type="button"
                      className="icon-btn sm draft-rematch-btn"
                      onClick={() => applyRematch(index, item)}
                      aria-label="Найти в справочнике"
                      title="Найти в справочнике"
                    >
                      <LibraryMenuIcon size={16} />
                    </button>
                  </div>
                </div>
              )}
              <div className="draft-portion-fields">
                {portionGrams != null && pieces != null && (
                  <label className="field draft-portion-field">
                    <span>Шт</span>
                    <DecimalInput
                      className="draft-portion-input"
                      value={pieces}
                      onCommit={(pcs) => {
                        if (!(pcs > 0)) return
                        onChangeItem(index, {
                          grams: Math.round(pcs * portionGrams * 10) / 10,
                        })
                      }}
                      ariaLabel="Штуки"
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
            </div>

            {showPickPanel && (
              <div className="draft-pick-panel">
                {needsPick && (
                  <>
                    <p className="draft-pick-title">В справочнике несколько вариантов</p>
                    <ul className="draft-food-list">
                      {pickGroups.primary.map((food) => (
                        <li key={food.id}>
                          <button
                            type="button"
                            className="draft-food-option"
                            onClick={() => applyReplace(index, item, food)}
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
                        {needsPick ? 'Похожие' : 'Похожие в справочнике'}
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
                              onClick={() => applyReplace(index, item, food)}
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
                {onEstimateItem && !fromLibrary && (
                  <button
                    type="button"
                    className="ghost-btn draft-action-btn draft-pick-estimate"
                    disabled={estimatingItemIndex != null}
                    onClick={() => void onEstimateItem(index)}
                  >
                    {estimatingItemIndex === index
                      ? 'Оцениваю…'
                      : 'Нет подходящего — оценить ИИ'}
                  </button>
                )}
              </div>
            )}

            {replacing && (
              <div className="draft-replace-panel">
                <label className="field">
                  <span>Поиск в моих продуктах</span>
                  <input
                    value={replaceQuery}
                    onChange={(e) => setReplaceQuery(e.target.value)}
                    placeholder="Название"
                    autoFocus
                  />
                </label>
                <div className="draft-food-picker">
                  {replaceFilteredFoods.length === 0 ? (
                    <p className="muted small">Ничего не найдено.</p>
                  ) : (
                    <ul className="draft-food-list">
                      {replaceFilteredFoods.map((food) => (
                        <li key={food.id}>
                          <button
                            type="button"
                            className="draft-food-option"
                            onClick={() => applyReplace(index, item, food)}
                          >
                            <span className="food-row-title">
                              <strong>{food.name}</strong>
                              {food.brand && <span className="brand-chip">{food.brand}</span>}
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

            <div className="draft-kbju-rows">
              {per100 && (
                <button
                  type="button"
                  className={`draft-kbju-row${macrosEdit?.index === index && macrosEdit.basis === 'per100' ? ' active' : ''}`}
                  onClick={() => canEditMacros && toggleMacrosEdit(index, 'per100')}
                  disabled={!canEditMacros}
                >
                  <span className="draft-kbju-label">На 100 г</span>
                  <span>{formatMacros(per100)}</span>
                </button>
              )}
              <button
                type="button"
                className={`draft-kbju-row${macrosEdit?.index === index && macrosEdit.basis === 'portion' ? ' active' : ''}`}
                onClick={() => canEditMacros && toggleMacrosEdit(index, 'portion')}
                disabled={!canEditMacros}
              >
                <span className="draft-kbju-label">Порция</span>
                <span>{unmatched ? 'КБЖУ не заданы' : formatMacros(item)}</span>
              </button>
            </div>
            {fromLibrary && (
              <p className="muted small draft-kbju-hint">
                КБЖУ из справочника — меняйте порцию, нажмите название чтобы заменить, или отвяжите для ручного ввода.
              </p>
            )}
            {unmatched && (
              <p className="muted small draft-kbju-hint">
                Введите КБЖУ вручную, оцените через ИИ или найдите в справочнике.
              </p>
            )}

            {canEditMacros && macrosEdit?.index === index && (
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

            <div className="draft-item-footer">
              <div className="draft-item-footer-links">
                {fromLibrary && (
                  <button
                    type="button"
                    className="link-btn draft-remember-btn"
                    onClick={() => {
                      onChangeItem(index, { foodId: undefined, source: 'estimate' })
                      setMacrosEdit({ index, basis: 'portion' })
                    }}
                  >
                    Править КБЖУ вручную
                  </button>
                )}
                {unmatched && onEstimateItem && !showPickPanel && (
                  <button
                    type="button"
                    className="ghost-btn draft-action-btn"
                    disabled={estimatingItemIndex != null}
                    onClick={() => void onEstimateItem(index)}
                  >
                    {estimatingItemIndex === index ? 'Оцениваю…' : 'Оценить КБЖУ'}
                  </button>
                )}
                {!fromLibrary &&
                  onSaveToLibrary &&
                  Boolean(item.name.trim()) &&
                  !unmatched && (
                    <button
                      type="button"
                      className={`ghost-btn draft-remember-btn${estimated ? ' draft-remember-emphasis' : ''}`}
                      disabled={savingFoodIndex != null || item.kcal <= 0}
                      onClick={() => onSaveToLibrary(index)}
                    >
                      {savingFoodIndex === index
                        ? 'Сохраняю…'
                        : 'Запомнить в мои продукты'}
                    </button>
                  )}
                {!fromLibrary &&
                  onSaveToLibrary &&
                  unmatched &&
                  Boolean(item.name.trim()) &&
                  item.kcal > 0 && (
                    <button
                      type="button"
                      className="ghost-btn draft-remember-btn draft-remember-emphasis"
                      disabled={savingFoodIndex != null}
                      onClick={() => onSaveToLibrary(index)}
                    >
                      {savingFoodIndex === index
                        ? 'Сохраняю…'
                        : 'Запомнить в мои продукты'}
                    </button>
                  )}
              </div>
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
                      <span className="food-row-title">
                        <strong>{food.name}</strong>
                        {food.brand && <span className="brand-chip">{food.brand}</span>}
                      </span>
                      <span className="muted small">
                        {Math.round(food.per100g.kcal)} ккал / 100 г
                        {food.portionGrams != null && food.portionGrams > 0
                          ? ` · порция ${food.portionGrams} г → ${Math.round(scalePer100g(food.per100g, food.portionGrams).kcal)} ккал`
                          : ''}
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
