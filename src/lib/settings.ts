import {
  calcDailyKcalGoal,
  isProfileComplete,
  type ActivityLevel,
  type BodyProfile,
  type GoalMode,
  type Sex,
} from './calorieGoal'

const KEY = 'planer-settings-v1'
const FALLBACK_GOAL = 1800

export type AppSettings = {
  profile: BodyProfile | null
  /** Cached goal; recalculated from profile + latest weight */
  dailyKcalGoal: number
}

const DEFAULT_PROFILE: BodyProfile = {
  sex: 'female',
  age: 30,
  heightCm: 165,
  activity: 'light',
  goalMode: 'mild',
}

function parseProfile(raw: unknown): BodyProfile | null {
  if (!raw || typeof raw !== 'object') return null
  const p = raw as Partial<BodyProfile>
  const sex = p.sex === 'male' || p.sex === 'female' ? (p.sex as Sex) : null
  const age = Number(p.age)
  const heightCm = Number(p.heightCm)
  const activity = p.activity as ActivityLevel | undefined
  const goalMode = (p.goalMode as GoalMode | undefined) ?? 'mild'
  const profile: BodyProfile = {
    sex: sex ?? DEFAULT_PROFILE.sex,
    age: Number.isFinite(age) && age > 0 ? Math.round(age) : 0,
    heightCm: Number.isFinite(heightCm) && heightCm > 0 ? Math.round(heightCm) : 0,
    activity: activity && activity in { sedentary: 1, light: 1, moderate: 1, active: 1, very: 1 }
      ? activity
      : DEFAULT_PROFILE.activity,
    goalMode: goalMode in { maintain: 1, mild: 1, loss: 1 } ? goalMode : 'mild',
  }
  return isProfileComplete(profile) ? profile : null
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { profile: null, dailyKcalGoal: FALLBACK_GOAL }
    const parsed = JSON.parse(raw) as Partial<AppSettings> & { dailyKcalGoal?: number }
    const profile = parseProfile(parsed.profile)
    const goal = Number(parsed.dailyKcalGoal)
    return {
      profile,
      dailyKcalGoal: Number.isFinite(goal) && goal > 0 ? Math.round(goal) : FALLBACK_GOAL,
    }
  } catch {
    return { profile: null, dailyKcalGoal: FALLBACK_GOAL }
  }
}

export function saveSettings(patch: Partial<AppSettings>): AppSettings {
  const prev = loadSettings()
  const next: AppSettings = {
    profile: patch.profile !== undefined ? patch.profile : prev.profile,
    dailyKcalGoal: patch.dailyKcalGoal ?? prev.dailyKcalGoal,
  }
  if (next.dailyKcalGoal <= 0) next.dailyKcalGoal = FALLBACK_GOAL
  next.dailyKcalGoal = Math.round(next.dailyKcalGoal)
  localStorage.setItem(KEY, JSON.stringify(next))
  return next
}

/** Persist profile and recompute daily goal from weight (kg). */
export function saveBodyProfile(profile: BodyProfile, weightKg: number): AppSettings {
  const dailyKcalGoal = calcDailyKcalGoal(profile, weightKg)
  return saveSettings({ profile, dailyKcalGoal })
}

/** Refresh goal when weight changes; no-op without profile. */
export function refreshGoalFromWeight(weightKg: number): AppSettings {
  const s = loadSettings()
  if (!s.profile || !(weightKg > 0)) return s
  const dailyKcalGoal = calcDailyKcalGoal(s.profile, weightKg)
  return saveSettings({ dailyKcalGoal })
}

export function resolveDailyKcalGoal(latestWeightKg?: number): number {
  const s = loadSettings()
  if (s.profile && latestWeightKg != null && latestWeightKg > 0) {
    return calcDailyKcalGoal(s.profile, latestWeightKg)
  }
  return s.dailyKcalGoal > 0 ? s.dailyKcalGoal : FALLBACK_GOAL
}

export function hasBodyProfile(): boolean {
  return isProfileComplete(loadSettings().profile)
}
