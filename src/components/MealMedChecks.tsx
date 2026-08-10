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
    <>
      {mgDose && (
        <button
          type="button"
          className={`meal-type-chip${mgAt ? ' active' : ''}`}
          aria-pressed={Boolean(mgAt)}
          onClick={() => {
            void onToggle({ date, dose: mgDose, taken: !mgAt })
          }}
        >
          Магний
          {mgAt && mgTime ? ` · ${mgTime}` : ''}
        </button>
      )}
      {showIron && (
        <button
          type="button"
          className={`meal-type-chip${ironAt ? ' active' : ''}`}
          aria-pressed={Boolean(ironAt)}
          onClick={() => {
            void onToggle({ date, dose: 'iron', taken: !ironAt })
          }}
        >
          Железо
          {ironAt && ironTime ? ` · ${ironTime}` : ''}
        </button>
      )}
    </>
  )
}
