import {
  ageFromBirthDate,
  anchoredFormulaWeight,
  calcDailyKcalGoal,
  calcOptimalWeightKg,
  isProfileComplete,
  type ActivityLevel,
  type BodyProfile,
  type GoalMode,
  type Sex,
} from './calorieGoal'
import { calcProteinGoal, VEG_GOAL_G } from './macroGoals'

const DEFAULT_CYCLE_LENGTH = 28
const DEFAULT_PERIOD_LENGTH = 5

function clampCycleLength(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_CYCLE_LENGTH
  return Math.min(45, Math.max(21, Math.round(n)))
}

function clampPeriodLength(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_PERIOD_LENGTH
  return Math.min(10, Math.max(2, Math.round(n)))
}

const KEY = 'planer-settings-v1'
/** Which auth uid currently owns local settings (prevents cross-account seed). */
const OWNER_KEY = 'planer-settings-uid-v1'
const FALLBACK_GOAL = 1800

export type AppSettings = {
  profile: BodyProfile | null
  /** Cached goal; recalculated from profile + the anchored formula weight */
  dailyKcalGoal: number
  /** Weight (kg) the calorie and protein formulas currently use. */
  formulaWeightKg: number | null
  /** Desired weight, kg */
  targetWeightKg: number | null
  /** Daily protein goal, grams. Null = 1.1 g per kg. */
  proteinGoalG: number | null
  /** Daily vegetable goal, grams. Null = default 400 g. */
  vegGoalG: number | null
  /** Daily sweets budget, kcal. Null = default 300 kcal. */
  sweetGoalKcal: number | null
  cycleLengthDays: number
  periodLengthDays: number
  /** True after the user explicitly saved cycle lengths in profile */
  cycleConfigured: boolean
}

const DEFAULT_PROFILE: BodyProfile = {
  sex: 'female',
  birthDate: null,
  age: 30,
  heightCm: 165,
  activity: 'light',
  goalMode: 'mild',
}

function parseProfile(raw: unknown): BodyProfile | null {
  if (!raw || typeof raw !== 'object') return null
  const p = raw as Partial<BodyProfile>
  const sex = p.sex === 'male' || p.sex === 'female' ? (p.sex as Sex) : null
  const birthDate =
    typeof p.birthDate === 'string' && ageFromBirthDate(p.birthDate) != null ? p.birthDate : null
  const storedAge = Number(p.age)
  const fromBirth = birthDate ? ageFromBirthDate(birthDate) : null
  const heightCm = Number(p.heightCm)
  const activity = p.activity as ActivityLevel | undefined
  const goalMode = (p.goalMode as GoalMode | undefined) ?? 'mild'
  const profile: BodyProfile = {
    sex: sex ?? DEFAULT_PROFILE.sex,
    birthDate,
    age: fromBirth ?? (Number.isFinite(storedAge) && storedAge > 0 ? Math.round(storedAge) : 0),
    heightCm: Number.isFinite(heightCm) && heightCm > 0 ? Math.round(heightCm) : 0,
    activity: activity && activity in { sedentary: 1, light: 1, moderate: 1, active: 1, very: 1 }
      ? activity
      : DEFAULT_PROFILE.activity,
    goalMode: goalMode in { maintain: 1, mild: 1, loss: 1 } ? goalMode : 'mild',
  }
  return isProfileComplete(profile) ? profile : null
}

function parseTargetWeight(raw: unknown): number | null {
  if (raw == null || raw === '') return null
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 30 || n > 400) return null
  return Math.round(n * 100) / 100
}

function parseGoalInt(raw: unknown, min: number, max: number): number | null {
  if (raw == null || raw === '') return null
  const n = Number(raw)
  if (!Number.isFinite(n) || n < min || n > max) return null
  return Math.round(n)
}

export function defaultSettings(): AppSettings {
  return {
    profile: null,
    dailyKcalGoal: FALLBACK_GOAL,
    formulaWeightKg: null,
    targetWeightKg: null,
    proteinGoalG: null,
    vegGoalG: null,
    sweetGoalKcal: null,
    cycleLengthDays: DEFAULT_CYCLE_LENGTH,
    periodLengthDays: DEFAULT_PERIOD_LENGTH,
    cycleConfigured: false,
  }
}

export function getSettingsOwnerUid(): string | null {
  try {
    return localStorage.getItem(OWNER_KEY)
  } catch {
    return null
  }
}

export function setSettingsOwnerUid(uid: string | null): void {
  try {
    if (uid == null) localStorage.removeItem(OWNER_KEY)
    else localStorage.setItem(OWNER_KEY, uid)
  } catch {
    // ignore quota / private mode
  }
}

/** Wipe local settings to defaults (used on account switch). */
export function resetSettings(): AppSettings {
  return replaceSettings(defaultSettings())
}

/** Parse settings from localStorage JSON or Firestore doc. */
export function parseSettingsBlob(raw: unknown): AppSettings {
  if (!raw || typeof raw !== 'object') return defaultSettings()
  const parsed = raw as Partial<AppSettings> & { dailyKcalGoal?: number }
  const profile = parseProfile(parsed.profile)
  const goal = Number(parsed.dailyKcalGoal)
  return {
    profile,
    dailyKcalGoal: Number.isFinite(goal) && goal > 0 ? Math.round(goal) : FALLBACK_GOAL,
    formulaWeightKg: parseTargetWeight(parsed.formulaWeightKg),
    targetWeightKg: parseTargetWeight(parsed.targetWeightKg),
    proteinGoalG: parseGoalInt(parsed.proteinGoalG, 20, 300),
    vegGoalG: parseGoalInt(parsed.vegGoalG, 50, 1500),
    sweetGoalKcal: parseGoalInt(parsed.sweetGoalKcal, 0, 1500),
    cycleLengthDays: clampCycleLength(
      Number(parsed.cycleLengthDays) || DEFAULT_CYCLE_LENGTH,
    ),
    periodLengthDays: clampPeriodLength(
      Number(parsed.periodLengthDays) || DEFAULT_PERIOD_LENGTH,
    ),
    cycleConfigured: Boolean(parsed.cycleConfigured),
  }
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return defaultSettings()
    return parseSettingsBlob(JSON.parse(raw))
  } catch {
    return defaultSettings()
  }
}

export function replaceSettings(next: AppSettings): AppSettings {
  const normalized = parseSettingsBlob(next)
  localStorage.setItem(KEY, JSON.stringify(normalized))
  return normalized
}

export function saveSettings(patch: Partial<AppSettings>): AppSettings {
  const prev = loadSettings()
  const next: AppSettings = {
    profile: patch.profile !== undefined ? patch.profile : prev.profile,
    dailyKcalGoal: patch.dailyKcalGoal ?? prev.dailyKcalGoal,
    formulaWeightKg:
      patch.formulaWeightKg !== undefined
        ? patch.formulaWeightKg
        : prev.formulaWeightKg,
    targetWeightKg:
      patch.targetWeightKg !== undefined ? patch.targetWeightKg : prev.targetWeightKg,
    proteinGoalG:
      patch.proteinGoalG !== undefined
        ? parseGoalInt(patch.proteinGoalG, 20, 300)
        : prev.proteinGoalG,
    vegGoalG:
      patch.vegGoalG !== undefined ? parseGoalInt(patch.vegGoalG, 50, 1500) : prev.vegGoalG,
    sweetGoalKcal:
      patch.sweetGoalKcal !== undefined
        ? parseGoalInt(patch.sweetGoalKcal, 0, 1500)
        : prev.sweetGoalKcal,
    cycleLengthDays:
      patch.cycleLengthDays !== undefined
        ? clampCycleLength(patch.cycleLengthDays)
        : prev.cycleLengthDays,
    periodLengthDays:
      patch.periodLengthDays !== undefined
        ? clampPeriodLength(patch.periodLengthDays)
        : prev.periodLengthDays,
    cycleConfigured:
      patch.cycleConfigured !== undefined ? patch.cycleConfigured : prev.cycleConfigured,
  }
  if (next.dailyKcalGoal <= 0) next.dailyKcalGoal = FALLBACK_GOAL
  next.dailyKcalGoal = Math.round(next.dailyKcalGoal)
  if (next.targetWeightKg != null) {
    next.targetWeightKg = parseTargetWeight(next.targetWeightKg)
  }
  if (next.formulaWeightKg != null) {
    next.formulaWeightKg = parseTargetWeight(next.formulaWeightKg)
  }
  return replaceSettings(next)
}

function sameGoalNumbers(a: number | null, b: number | null): boolean {
  if (a == null || b == null) return a == null && b == null
  return Math.abs(a - b) < 0.05
}

/**
 * Pin calorie and protein formulas to the latest weigh-in once it has moved
 * by a kilogram, and drop saved targets that are still the automatic numbers.
 */
export function reconcileWeightFormulas(latestKg: number): AppSettings {
  const s = loadSettings()
  if (!(latestKg > 0)) return s
  const anchor = anchoredFormulaWeight(s.formulaWeightKg, latestKg)
  const weightChanged = anchor != null && anchor !== s.formulaWeightKg
  const basis = anchor ?? latestKg
  const previousBasis = s.formulaWeightKg ?? basis
  const proteinAuto = calcProteinGoal(basis)
  const proteinWasAuto = calcProteinGoal(previousBasis)
  const optimal = s.profile ? calcOptimalWeightKg(s.profile.sex, s.profile.heightCm) : null
  const clearProtein =
    s.proteinGoalG != null &&
    ((proteinAuto != null && s.proteinGoalG === proteinAuto) ||
      (proteinWasAuto != null && s.proteinGoalG === proteinWasAuto))
  const clearVeg = s.vegGoalG != null && s.vegGoalG === VEG_GOAL_G
  const clearTarget = s.targetWeightKg != null && sameGoalNumbers(s.targetWeightKg, optimal)
  if (!weightChanged && !clearProtein && !clearVeg && !clearTarget) return s
  const dailyKcalGoal =
    weightChanged && s.profile ? calcDailyKcalGoal(s.profile, basis) : s.dailyKcalGoal
  return saveSettings({
    ...(weightChanged && anchor != null ? { formulaWeightKg: anchor, dailyKcalGoal } : {}),
    ...(clearProtein ? { proteinGoalG: null } : {}),
    ...(clearVeg ? { vegGoalG: null } : {}),
    ...(clearTarget ? { targetWeightKg: null } : {}),
  })
}

/** Persist profile and recompute daily goal from weight (kg). */
export function saveBodyProfile(profile: BodyProfile, weightKg: number): AppSettings {
  const dailyKcalGoal = calcDailyKcalGoal(profile, weightKg)
  return saveSettings({ profile, dailyKcalGoal })
}

/** Refresh the anchored formula weight when a new weigh-in is significant. */
export function refreshGoalFromWeight(weightKg: number): AppSettings {
  return reconcileWeightFormulas(weightKg)
}

export function resolveDailyKcalGoal(latestWeightKg?: number): number {
  const s = loadSettings()
  const basis = anchoredFormulaWeight(s.formulaWeightKg, latestWeightKg)
  if (s.profile && basis != null && basis > 0) {
    return calcDailyKcalGoal(s.profile, basis)
  }
  return s.dailyKcalGoal > 0 ? s.dailyKcalGoal : FALLBACK_GOAL
}

export function hasBodyProfile(): boolean {
  return isProfileComplete(loadSettings().profile)
}
