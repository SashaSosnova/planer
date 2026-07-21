import { useEffect, useId, useRef, useState } from 'react'
import { formatIsoDot, parseDotDate, todayIso } from '../lib/date'

type Props = {
  value: string
  onChange: (iso: string) => void
  min?: string
  max?: string
  disabled?: boolean
  className?: string
  'aria-label'?: string
}

function displayFor(iso: string, editing: boolean): string {
  if (!iso) return ''
  if (!editing && iso === todayIso()) return 'Сегодня'
  return formatIsoDot(iso)
}

function parseInput(raw: string): string | null {
  const t = raw.trim().toLowerCase()
  if (t === 'сегодня' || t === 'today') return todayIso()
  return parseDotDate(raw)
}

/**
 * Date control shown as дд.мм.гггг, or «сегодня» when value is today.
 * Native calendar opens via the calendar button.
 */
export function DateField({
  value,
  onChange,
  min,
  max,
  disabled,
  className,
  'aria-label': ariaLabel = 'Дата',
}: Props) {
  const id = useId()
  const nativeRef = useRef<HTMLInputElement>(null)
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(() => displayFor(value, false))

  useEffect(() => {
    if (!editing) setText(displayFor(value, false))
  }, [value, editing])

  const openPicker = () => {
    const el = nativeRef.current
    if (!el || disabled) return
    try {
      el.showPicker?.()
    } catch {
      el.focus()
      el.click()
    }
  }

  const commitText = () => {
    setEditing(false)
    const iso = parseInput(text)
    if (iso) {
      if (min && iso < min) {
        setText(displayFor(value, false))
        return
      }
      if (max && iso > max) {
        setText(displayFor(value, false))
        return
      }
      onChange(iso)
      setText(displayFor(iso, false))
      return
    }
    setText(displayFor(value, false))
  }

  return (
    <div className={`date-field${className ? ` ${className}` : ''}`}>
      <input
        id={id}
        className="date-field-text"
        inputMode="text"
        placeholder="дд.мм.гггг"
        aria-label={ariaLabel}
        disabled={disabled}
        value={text}
        onFocus={() => {
          setEditing(true)
          setText(value ? formatIsoDot(value) : '')
        }}
        onChange={(e) => setText(e.target.value)}
        onBlur={commitText}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commitText()
            ;(e.target as HTMLInputElement).blur()
          }
        }}
      />
      <button
        type="button"
        className="date-field-cal"
        disabled={disabled}
        aria-label="Открыть календарь"
        title="Календарь"
        onClick={openPicker}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect
            x="3.5"
            y="5"
            width="17"
            height="15.5"
            rx="2"
            stroke="currentColor"
            strokeWidth="1.8"
          />
          <path
            d="M8 3.5v3.5M16 3.5v3.5M3.5 10h17"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      </button>
      <input
        ref={nativeRef}
        className="date-field-native"
        type="date"
        tabIndex={-1}
        aria-hidden
        disabled={disabled}
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const next = e.target.value
          if (!next) return
          onChange(next)
          setEditing(false)
          setText(displayFor(next, false))
        }}
      />
    </div>
  )
}
