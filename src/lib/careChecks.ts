import { todayIso } from './date'

const KEY = 'planer-care-checks-v1'

export type CareSlot = 'morning' | 'evening'

type DayChecks = {
  morning: string[]
  evening: string[]
}

type Store = Record<string, DayChecks>

function emptyDay(): DayChecks {
  return { morning: [], evening: [] }
}

function loadStore(): Store {
  try {
    if (typeof localStorage === 'undefined') return {}
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Store
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function saveStore(store: Store): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(KEY, JSON.stringify(store))
}

export function loadCareChecks(date = todayIso()): DayChecks {
  const day = loadStore()[date]
  if (!day) return emptyDay()
  return {
    morning: Array.isArray(day.morning) ? day.morning.map(String) : [],
    evening: Array.isArray(day.evening) ? day.evening.map(String) : [],
  }
}

export function toggleCareCheck(
  slot: CareSlot,
  stepId: string,
  date = todayIso(),
): DayChecks {
  const store = loadStore()
  const day = store[date] ? { ...emptyDay(), ...store[date] } : emptyDay()
  const list = new Set(day[slot])
  if (list.has(stepId)) list.delete(stepId)
  else list.add(stepId)
  const next: DayChecks = {
    morning: slot === 'morning' ? [...list] : day.morning,
    evening: slot === 'evening' ? [...list] : day.evening,
  }
  store[date] = next
  // Keep last ~60 days to avoid unbounded growth
  const keys = Object.keys(store).sort()
  if (keys.length > 60) {
    for (const k of keys.slice(0, keys.length - 60)) delete store[k]
  }
  saveStore(store)
  return next
}

export function isCareStepDone(checks: DayChecks, slot: CareSlot, stepId: string): boolean {
  return checks[slot].includes(stepId)
}
