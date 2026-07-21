import { useEffect, useState } from 'react'

function parseNum(value: string): number | null {
  const n = Number(value.replace(',', '.'))
  if (!Number.isFinite(n) || n < 0) return null
  return n
}

function formatDecimal(value: number): string {
  if (!Number.isFinite(value)) return '0'
  return String(value)
}

/** Keeps intermediate «12.» / «12,» while typing; commits parsed number to parent. */
export function DecimalInput({
  value,
  onCommit,
  onBlurExtra,
  ariaLabel,
  className,
  autoFocus,
}: {
  value: number
  onCommit: (n: number) => void
  onBlurExtra?: () => void
  ariaLabel?: string
  className?: string
  autoFocus?: boolean
}) {
  const [focused, setFocused] = useState(false)
  const [text, setText] = useState(() => formatDecimal(value))

  useEffect(() => {
    if (!focused) setText(formatDecimal(value))
  }, [value, focused])

  return (
    <input
      className={className}
      inputMode="decimal"
      aria-label={ariaLabel}
      autoFocus={autoFocus}
      value={focused ? text : formatDecimal(value)}
      onFocus={() => {
        setFocused(true)
        setText(formatDecimal(value))
      }}
      onChange={(e) => {
        const raw = e.target.value
        if (raw !== '' && !/^\d*[.,]?\d*$/.test(raw)) return
        setText(raw)
        if (raw === '' || raw === '.' || raw === ',') return
        if (raw.endsWith('.') || raw.endsWith(',')) return
        const n = parseNum(raw)
        if (n != null) onCommit(n)
      }}
      onBlur={() => {
        setFocused(false)
        const n = parseNum(text)
        if (n != null) {
          onCommit(n)
          setText(formatDecimal(n))
        } else {
          setText(formatDecimal(value))
        }
        onBlurExtra?.()
      }}
    />
  )
}
