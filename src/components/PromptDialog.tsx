import { useEffect, useRef, useState } from 'react'

type Props = {
  title: string
  label: string
  placeholder?: string
  inputMode?: 'decimal' | 'numeric' | 'text'
  initialValue?: string
  confirmLabel?: string
  busy?: boolean
  error?: string | null
  onCancel: () => void
  onConfirm: (value: string) => void
}

export function PromptDialog({
  title,
  label,
  placeholder,
  inputMode = 'decimal',
  initialValue = '',
  confirmLabel = 'Сохранить',
  busy = false,
  error = null,
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
        <h2 id="prompt-dialog-title" className="subhead" style={{ marginTop: 0 }}>
          {title}
        </h2>
        <label className="field">
          <span>{label}</span>
          <input
            ref={inputRef}
            className="day-log-input"
            inputMode={inputMode}
            value={value}
            placeholder={placeholder}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !busy) onConfirm(value)
              if (e.key === 'Escape') onCancel()
            }}
          />
        </label>
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
          <button type="button" className="ghost-btn" disabled={busy} onClick={onCancel}>
            Отмена
          </button>
        </div>
      </div>
    </div>
  )
}
