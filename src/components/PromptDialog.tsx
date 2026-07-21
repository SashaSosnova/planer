import { useEffect, useRef, useState } from 'react'
import { CloseIcon } from './CloseIcon'

type Props = {
  title: string
  label: string
  placeholder?: string
  inputMode?: 'decimal' | 'numeric' | 'text'
  /** Native input type; use `date` for calendar pickers */
  type?: 'text' | 'date'
  min?: string
  max?: string
  initialValue?: string
  confirmLabel?: string
  busy?: boolean
  error?: string | null
  hint?: string | null
  onCancel: () => void
  onConfirm: (value: string) => void
}

export function PromptDialog({
  title,
  label,
  placeholder,
  inputMode = 'decimal',
  type = 'text',
  min,
  max,
  initialValue = '',
  confirmLabel = 'Сохранить',
  busy = false,
  error = null,
  hint = null,
  onCancel,
  onConfirm,
}: Props) {
  const [value, setValue] = useState(initialValue)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setValue(initialValue)
  }, [initialValue])

  useEffect(() => {
    const t = window.setTimeout(() => inputRef.current?.focus(), 50)
    return () => window.clearTimeout(t)
  }, [])

  return (
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="prompt-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-card-head">
          <h2 id="prompt-dialog-title" className="subhead">
            {title}
          </h2>
          <button
            type="button"
            className="icon-btn sm"
            aria-label="Закрыть"
            title="Закрыть"
            disabled={busy}
            onClick={onCancel}
          >
            <CloseIcon size={18} />
          </button>
        </div>
        <label className="field">
          <span>{label}</span>
          <input
            ref={inputRef}
            className="day-log-input"
            type={type}
            inputMode={type === 'date' ? undefined : inputMode}
            min={min}
            max={max}
            value={value}
            placeholder={placeholder}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !busy) onConfirm(value)
              if (e.key === 'Escape') onCancel()
            }}
          />
        </label>
        {hint && <p className="muted small">{hint}</p>}
        {error && <p className="form-msg error">{error}</p>}
        <div className="btn-row">
          <button
            type="button"
            className="primary-btn"
            disabled={busy}
            onClick={() => onConfirm(value)}
          >
            {busy ? 'Сохраняю…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
