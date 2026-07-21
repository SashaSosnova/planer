export function todayIso(): string {
  return toIsoDate(new Date())
}

export function toIsoDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function formatRuDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return new Date(y, m - 1, d).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    weekday: 'short',
  })
}

/** e.g. «19 июля» — for chat day separators */
export function formatRuDayMonth(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return new Date(y, m - 1, d).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
  })
}

/** Calendar / date-field display: дд.мм.гггг */
export function formatIsoDot(iso: string): string {
  const [y, m, d] = iso.split('-')
  if (!y || !m || !d || !/^\d{4}$/.test(y) || !/^\d{2}$/.test(m) || !/^\d{2}$/.test(d)) {
    return iso
  }
  return `${d}.${m}.${y}`
}

/** Parse дд.мм.гггг (or дд.мм.гг) → ISO yyyy-mm-dd, or null. */
export function parseDotDate(value: string): string | null {
  const raw = value.trim()
  const m = raw.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2}|\d{4})$/)
  if (!m) return null
  const day = Number(m[1])
  const month = Number(m[2])
  let year = Number(m[3])
  if (year < 100) year += year >= 70 ? 1900 : 2000
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const dt = new Date(year, month - 1, day)
  if (dt.getFullYear() !== year || dt.getMonth() !== month - 1 || dt.getDate() !== day) {
    return null
  }
  return toIsoDate(dt)
}

/** Shift an ISO date by `delta` calendar days. */
export function addDaysIso(iso: string, delta: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + delta)
  return toIsoDate(dt)
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `id_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}
