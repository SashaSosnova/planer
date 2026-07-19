import { sanitizeAppData } from '../lib/sanitize'
import type { AppData } from '../types'

const KEY = 'planer-app-data-v1'
const SETTINGS_KEY = 'planer-settings-v1'
/** One-time wipe after removing demo seed data */
const DEMO_WIPED_KEY = 'planer-demo-wiped-v1'

export const emptyAppData = (): AppData => ({
  foods: [],
  meals: [],
  weights: [],
  measurements: [],
  steps: [],
  checkIns: [],
  periodStarts: [],
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

export function loadLocalData(): AppData {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return emptyAppData()
    const parsed = JSON.parse(raw) as Partial<AppData>
    return sanitizeAppData(parsed)
  } catch {
    return emptyAppData()
  }
}

export function saveLocalData(data: AppData): void {
  localStorage.setItem(KEY, JSON.stringify(data))
}
