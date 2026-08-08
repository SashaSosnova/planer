import type { MacroSet } from '../types'

type Props = {
  totals: MacroSet
  /** When true, only BJU — kcal shown elsewhere (e.g. calorie ring). */
  hideKcal?: boolean
  /** Some rows still need catalog pick / macros — totals are partial. */
  incomplete?: boolean
}

export function MacroBar({ totals, hideKcal, incomplete }: Props) {
  return (
    <div className={`macro-bar${hideKcal ? ' macros-only' : ''}${incomplete ? ' incomplete' : ''}`}>
      {!hideKcal && (
        <div className="macro-kcal-block">
          <span className="macro-label">ккал{incomplete ? ' · неполный' : ''}</span>
          <span className="macro-kcal">{Math.round(totals.kcal)}</span>
        </div>
      )}
      <div className="macro-bju-row">
        <div className="macro-bju-cell">
          <span className="macro-label">белки</span>
          <strong>{totals.protein}</strong>
        </div>
        <div className="macro-bju-cell">
          <span className="macro-label">жиры</span>
          <strong>{totals.fat}</strong>
        </div>
        <div className="macro-bju-cell">
          <span className="macro-label">углеводы</span>
          <strong>{totals.carbs}</strong>
        </div>
      </div>
    </div>
  )
}
