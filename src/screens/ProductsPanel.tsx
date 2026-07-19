import { useMemo, useState } from 'react'
import { generateAliases } from '../lib/foodAliases'
import type { AppData, FoodItem, MacroSet } from '../types'

function formatKbjuLine(m: MacroSet): string {
  return `${m.kcal} ${m.protein} ${m.fat} ${m.carbs}`
}

function parseKbjuLine(line: string): MacroSet | null {
  const parts = line
    .trim()
    .split(/[\s;|/]+/)
    .map((p) => p.replace(',', '.'))
    .filter(Boolean)
  if (parts.length !== 4) return null
  const nums = parts.map(Number)
  if (nums.some((n) => !Number.isFinite(n))) return null
  return { kcal: nums[0], protein: nums[1], fat: nums[2], carbs: nums[3] }
}

type Props = {
  data: AppData
  onSave: (input: Omit<FoodItem, 'id' | 'updatedAt'> & { id?: string }) => Promise<FoodItem>
  onDelete: (id: string) => Promise<void>
}

export function ProductsPanel({ data, onSave, onDelete }: Props) {
  const [name, setName] = useState('')
  const [kbju, setKbju] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const products = useMemo(
    () =>
      data.foods
        .filter((f) => f.kind !== 'dish')
        .sort((a, b) => a.name.localeCompare(b.name, 'ru')),
    [data.foods],
  )

  const resetForm = () => {
    setEditId(null)
    setName('')
    setKbju('')
    setError(null)
  }

  const startEdit = (food: FoodItem) => {
    setEditId(food.id)
    setName(food.name)
    setKbju(formatKbjuLine(food.per100g))
    setError(null)
    setInfo(null)
  }

  const submit = async () => {
    setBusy(true)
    setError(null)
    setInfo(null)
    try {
      if (!name.trim()) throw new Error('Укажите название')
      const per100g = parseKbjuLine(kbju)
      if (!per100g) {
        throw new Error('КБЖУ: четыре числа через пробел, например 140 20 6 0')
      }
      await onSave({
        id: editId ?? undefined,
        name,
        aliases: generateAliases(name),
        per100g,
        kind: 'ingredient',
      })
      setInfo(editId ? 'Продукт обновлён' : 'Продукт добавлен')
      resetForm()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="panel-stack">
      <div className="panel">
        <h2 className="subhead" style={{ marginTop: 0 }}>
          {editId ? 'Изменить продукт' : 'Новый продукт'}
        </h2>
        <label className="field">
          <span>Название</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Форель слабосоленая"
          />
        </label>
        <label className="field">
          <span>Ккал · белки · жиры · углеводы (на 100 г)</span>
          <input
            inputMode="text"
            enterKeyHint="done"
            value={kbju}
            onChange={(e) => setKbju(e.target.value)}
            placeholder="140 20 6 0"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
          />
        </label>
        <div className="btn-row">
          <button
            type="button"
            className="primary-btn"
            disabled={busy}
            onClick={() => void submit()}
          >
            {busy ? 'Сохраняю…' : editId ? 'Сохранить' : 'Добавить'}
          </button>
          {editId && (
            <button type="button" className="ghost-btn" onClick={resetForm}>
              Отмена
            </button>
          )}
        </div>
        {error && <p className="form-msg error">{error}</p>}
        {info && <p className="form-msg">{info}</p>}
      </div>

      <div className="section-head">
        <h2>В справочнике</h2>
      </div>
      <ul className="food-list">
        {products.length === 0 && (
          <li className="muted">Пока нет простых продуктов.</li>
        )}
        {products.map((food) => (
          <li key={food.id} className="food-row">
            <div>
              <strong>{food.name}</strong>
              <p className="muted small">
                {food.per100g.kcal} ккал · Б {food.per100g.protein} · Ж {food.per100g.fat} · У{' '}
                {food.per100g.carbs}
              </p>
            </div>
            <div className="btn-row tight">
              <button type="button" className="ghost-btn" onClick={() => startEdit(food)}>
                Изменить
              </button>
              <button
                type="button"
                className="ghost-btn danger"
                onClick={() => void onDelete(food.id)}
              >
                Удалить
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
