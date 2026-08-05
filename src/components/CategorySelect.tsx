import { DISH_CATEGORIES, FOOD_CATEGORIES } from '../lib/foodCategory'

type FoodProps = {
  kind: 'food'
  value: string
  onChange: (id: string) => void
  disabled?: boolean
  id?: string
  label?: string
}

type DishProps = {
  kind: 'dish'
  value: string
  onChange: (id: string) => void
  disabled?: boolean
  id?: string
  label?: string
}

export function CategorySelect(props: FoodProps | DishProps) {
  const options = props.kind === 'food' ? FOOD_CATEGORIES : DISH_CATEGORIES
  const label = props.label ?? (props.kind === 'food' ? 'Отдел' : 'Группа блюда')
  return (
    <label className="field catalog-category-field">
      <span className="visually-hidden">{label}</span>
      <select
        id={props.id}
        value={props.value}
        disabled={props.disabled}
        aria-label={label}
        onChange={(e) => props.onChange(e.target.value)}
      >
        {options.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>
    </label>
  )
}
