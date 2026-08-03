import {
  formatMedTakenAt,
  mgDoseKeyForMealType,
  medTakenAt,
  type MedDoseKey,
} from '../lib/medRoutine'
import type { MealType, MedDayEntry } from '../types'

type Props = {
  date: string
  mealType: MealType
  entry: MedDayEntry | undefined
  onToggle: (input: { date: string; dose: MedDoseKey; taken: boolean }) => void | Promise<unknown>
}

export function MealMedChecks({ date, mealType, entry, onToggle }: Props) {
  const mgDose = mgDoseKeyForMealType(mealType)
  const showIron = mealType === 'breakfast'
  if (!mgDose && !showIron) return null

  const mgAt = mgDose ? medTakenAt(entry, mgDose) : undefined
  const ironAt = showIron ? medTakenAt(entry, 'iron') : undefined
  const mgTime = formatMedTakenAt(mgAt)
  const ironTime = formatMedTakenAt(ironAt)

  return (
    <div className="meal-med-checks" role="group" aria-label="Добавки">
      {mgDose && (
        <label className="check-row">
          <input
            type="checkbox"
            checked={Boolean(mgAt)}
            onChange={(e) => {
              void onToggle({ date, dose: mgDose, taken: e.target.checked })
            }}
          />
          <span>
            Магний
            {mgAt && mgTime ? <span className="meal-med-time"> · {mgTime}</span> : null}
          </span>
        </label>
      )}
      {showIron && (
        <label className="check-row">
          <input
            type="checkbox"
            checked={Boolean(ironAt)}
            onChange={(e) => {
              void onToggle({ date, dose: 'iron', taken: e.target.checked })
            }}
          />
          <span>
            Железо
            {ironAt && ironTime ? <span className="meal-med-time"> · {ironTime}</span> : null}
          </span>
        </label>
      )}
    </div>
  )
}
