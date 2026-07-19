import type { MacroSet } from '../types'

type Props = {
  totals: MacroSet
  /** When true, only BJU — kcal shown elsewhere (e.g. calorie ring). */
  hideKcal?: boolean
}

export function MacroBar({ totals, hideKcal }: Props) {
  return (
    <div className={`macro-bar${hideKcal ? ' macros-only' : ''}`}>
      {!hideKcal && (
        <div className="macro-main">
          <span className="macro-kcal">{Math.round(totals.kcal)}</span>
          <span className="macro-unit">ккал</span>
        </div>
      )}
      <div className="macro-grid">
        <div>
          <strong>{totals.protein}</strong>
          <span>белки</span>
        </div>
        <div>
          <strong>{totals.fat}</strong>
          <span>жиры</span>
        </div>
        <div>
          <strong>{totals.carbs}</strong>
          <span>углеводы</span>
        </div>
      </div>
    </div>
  )
}
