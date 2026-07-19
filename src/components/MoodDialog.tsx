import { MOOD_OPTIONS } from '../lib/mood'
import type { MoodLevel } from '../types'

type Props = {
  current?: MoodLevel
  busy?: boolean
  onCancel: () => void
  onSelect: (mood: MoodLevel | null) => void
}

export function MoodDialog({ current, busy = false, onCancel, onSelect }: Props) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mood-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="mood-dialog-title" className="subhead" style={{ marginTop: 0 }}>
          Настроение
        </h2>
        <p className="muted small" style={{ margin: 0 }}>
          Как вы себя чувствуете сегодня?
        </p>
        <div className="mood-row" role="group" aria-label="Настроение">
          {MOOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`mood-chip${current === opt.value ? ' active' : ''}`}
              disabled={busy}
              onClick={() => onSelect(current === opt.value ? null : opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="btn-row">
          <button type="button" className="ghost-btn" disabled={busy} onClick={onCancel}>
            Отмена
          </button>
        </div>
      </div>
    </div>
  )
}
