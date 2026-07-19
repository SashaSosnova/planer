import { foodVariants } from '../lib/foodVariants'
import { round1, scalePer100g, sumMacros } from '../lib/nutrition'
import type { AppData, FoodItem, MacroSet, MealItem, ParsedMealDraft } from '../types'

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

function formatPer100(m: MacroSet): string {
  return `${Math.round(m.kcal)} ккал · Б ${m.protein} · Ж ${m.fat} · У ${m.carbs}`
}

function parseNum(value: string): number | null {
  const n = Number(value.replace(',', '.'))
  if (!Number.isFinite(n) || n < 0) return null
  return n
}

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
  onSaveToLibrary?: (index: number) => void
  savingFoodIndex?: number | null
}

export function MealDraftEditor({
  data,
  items,
  onChangeItem,
  onSaveToLibrary,
  savingFoodIndex = null,
}: Props) {
  return (
    <ul className="draft-list">
      {items.map((item, index) => {
        const linked = item.foodId ? data.foods.find((f) => f.id === item.foodId) : undefined
        const fromLibrary = item.source === 'library' && linked
        const per100 = fromLibrary ? linked.per100g : per100FromPortion(item)
        const variants = fromLibrary && linked ? foodVariants(linked, data.foods) : []

        return (
          <li key={`${item.name}-${index}`} className="draft-item">
            <div className="draft-item-top">
              <label className="field grow">
                <span>Название</span>
                <input
                  value={item.name}
                  onChange={(e) => onChangeItem(index, { name: e.target.value })}
                />
              </label>
              <span className={fromLibrary ? 'badge ok' : 'badge'}>
                {fromLibrary ? 'ваши КБЖУ' : 'примерно'}
              </span>
            </div>

            {per100 && (
              <p className="draft-per100">
                <span className="draft-per100-label">На 100 г</span>
                <span>{formatPer100(per100)}</span>
              </p>
            )}

            <label className="field">
              <span>Сколько съели, г</span>
              <input
                inputMode="decimal"
                value={item.grams}
                onChange={(e) => {
                  const grams = parseNum(e.target.value)
                  if (grams != null) onChangeItem(index, { grams })
                }}
              />
            </label>

            <div className="draft-macros">
              <p className="muted small">КБЖУ порции</p>
              <div className="form-grid four">
                <label className="field">
                  <span>Ккал</span>
                  <input
                    inputMode="decimal"
                    value={item.kcal}
                    onChange={(e) => {
                      const kcal = parseNum(e.target.value)
                      if (kcal != null) onChangeItem(index, { kcal })
                    }}
                  />
                </label>
                <label className="field">
                  <span>Белки</span>
                  <input
                    inputMode="decimal"
                    value={item.protein}
                    onChange={(e) => {
                      const protein = parseNum(e.target.value)
                      if (protein != null) onChangeItem(index, { protein })
                    }}
                  />
                </label>
                <label className="field">
                  <span>Жиры</span>
                  <input
                    inputMode="decimal"
                    value={item.fat}
                    onChange={(e) => {
                      const fat = parseNum(e.target.value)
                      if (fat != null) onChangeItem(index, { fat })
                    }}
                  />
                </label>
                <label className="field">
                  <span>Углев.</span>
                  <input
                    inputMode="decimal"
                    value={item.carbs}
                    onChange={(e) => {
                      const carbs = parseNum(e.target.value)
                      if (carbs != null) onChangeItem(index, { carbs })
                    }}
                  />
                </label>
              </div>
            </div>

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

            {!fromLibrary && onSaveToLibrary && (
              <button
                type="button"
                className="ghost-btn"
                disabled={savingFoodIndex != null}
                onClick={() => onSaveToLibrary(index)}
              >
                {savingFoodIndex === index ? 'Сохраняю…' : 'Запомнить в мои продукты'}
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}
