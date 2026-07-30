import { newId } from '../lib/date'
import { sanitizeAppData, sanitizeMedDay } from '../lib/sanitize'
import type { AppData, MedDayEntry } from '../types'

const KEY = 'planer-app-data-v1'
const SETTINGS_KEY = 'planer-settings-v1'
/** One-time wipe after removing demo seed data */
const DEMO_WIPED_KEY = 'planer-demo-wiped-v1'
/** Legacy local-only med checks (pre-AppData sync) */
const LEGACY_MED_CHECKS_KEY = 'planer-med-checks-v1'

export const emptyAppData = (): AppData => ({
  foods: [],
  meals: [],
  weights: [],
  measurements: [],
  steps: [],
  dayNotes: [],
  periodStarts: [],
  medDays: [],
})

function wipeDemoIfNeeded(): void {
  if (typeof localStorage === 'undefined') return
  if (localStorage.getItem(DEMO_WIPED_KEY)) return
  try {
    const raw = localStorage.getItem(KEY)
    if (raw?.includes('"mock_')) {
      localStorage.removeItem(KEY)
      localStorage.removeItem(SETTINGS_KEY)
    }
  } catch {
    /* ignore */
  }
  localStorage.setItem(DEMO_WIPED_KEY, '1')
}

wipeDemoIfNeeded()

export { sanitizeAppData }

/** Map legacy dose ids → MedDayEntry *At fields. */
const LEGACY_DOSE_MAP: Record<string, keyof MedDayEntry> = {
  iron: 'ironAt',
  'mg-breakfast': 'mgBreakfastAt',
  'mg-lunch': 'mgLunchAt',
  'mg-dinner': 'mgDinnerAt',
}

function migrateLegacyMedChecks(data: AppData): AppData {
  if (typeof localStorage === 'undefined') return data
  let raw: string | null
  try {
    raw = localStorage.getItem(LEGACY_MED_CHECKS_KEY)
  } catch {
    return data
  }
  if (!raw) return data

  try {
    const store = JSON.parse(raw) as Record<string, Record<string, string>>
    if (!store || typeof store !== 'object') {
      localStorage.removeItem(LEGACY_MED_CHECKS_KEY)
      return data
    }

    const byDate = new Map(data.medDays.map((m) => [m.date, m]))
    let changed = false
    const now = Date.now()

    for (const [date, doses] of Object.entries(store)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !doses || typeof doses !== 'object') continue
      const existing = byDate.get(date)
      const draft: MedDayEntry = existing
        ? { ...existing }
        : { id: newId(), date, createdAt: now, updatedAt: now }

      for (const [doseId, at] of Object.entries(doses)) {
        const field = LEGACY_DOSE_MAP[doseId]
        if (!field || typeof at !== 'string' || !at.trim()) continue
        if (!draft[field]) {
          ;(draft as Record<string, unknown>)[field] = at
          changed = true
        }
      }

      const sanitized = sanitizeMedDay(draft)
      if (sanitized) byDate.set(date, sanitized)
    }

    localStorage.removeItem(LEGACY_MED_CHECKS_KEY)
    if (!changed && byDate.size === data.medDays.length) return data

    const next = {
      ...data,
      medDays: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
    }
    saveLocalData(next)
    return next
  } catch {
    try {
      localStorage.removeItem(LEGACY_MED_CHECKS_KEY)
    } catch {
      /* ignore */
    }
    return data
  }
}

export function loadLocalData(): AppData {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return migrateLegacyMedChecks(emptyAppData())
    const parsed = JSON.parse(raw) as Partial<AppData>
    return migrateLegacyMedChecks(sanitizeAppData(parsed))
  } catch {
    return migrateLegacyMedChecks(emptyAppData())
  }
}

export function saveLocalData(data: AppData): void {
  localStorage.setItem(KEY, JSON.stringify(data))
}
