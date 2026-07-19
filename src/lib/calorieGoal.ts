export type Sex = 'female' | 'male'

/** Typical daily activity multipliers (TDEE = BMR × factor). */
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very'

export type GoalMode = 'maintain' | 'mild' | 'loss'

export type BodyProfile = {
  sex: Sex
  age: number
  heightCm: number
  activity: ActivityLevel
  /** Deficit from TDEE for weight-loss goal */
  goalMode: GoalMode
}

export const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: 'Сидячий (мало движения)',
  light: 'Лёгкая (1–3 трен./нед)',
  moderate: 'Умеренная (3–5 трен./нед)',
  active: 'Высокая (6–7 трен./нед)',
  very: 'Очень высокая (физ. работа)',
}

export const GOAL_MODE_LABELS: Record<GoalMode, string> = {
  maintain: 'Поддержание веса',
  mild: 'Мягкое снижение (−10%)',
  loss: 'Снижение (−15%)',
}

const ACTIVITY_FACTOR: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very: 1.9,
}

/** Share of TDEE to subtract — milder than fixed −300/−500. */
const DEFICIT_RATIO: Record<GoalMode, number> = {
  maintain: 0,
  mild: 0.1,
  loss: 0.15,
}

const FALLBACK_GOAL = 1800

/** Mifflin–St Jeor BMR (kcal/day). */
export function bmrMifflin(input: {
  sex: Sex
  weightKg: number
  heightCm: number
  age: number
}): number {
  const base = 10 * input.weightKg + 6.25 * input.heightCm - 5 * input.age
  return input.sex === 'male' ? base + 5 : base - 161
}

export function calcDailyKcalGoal(profile: BodyProfile, weightKg: number): number {
  if (!(weightKg > 0) || !(profile.heightCm > 0) || !(profile.age > 0)) {
    return FALLBACK_GOAL
  }
  const bmr = bmrMifflin({
    sex: profile.sex,
    weightKg,
    heightCm: profile.heightCm,
    age: profile.age,
  })
  const tdee = bmr * ACTIVITY_FACTOR[profile.activity]
  const deficit = tdee * DEFICIT_RATIO[profile.goalMode]
  // Never below BMR — hard 1200 floor was too aggressive for many people
  const floor = Math.round(bmr)
  return Math.max(floor, Math.round(tdee - deficit))
}

/** TDEE without deficit — upper “maintain weight” band for ring colors. */
export function calcMaintainKcalGoal(profile: BodyProfile, weightKg: number): number {
  return calcDailyKcalGoal({ ...profile, goalMode: 'maintain' }, weightKg)
}

export function isProfileComplete(profile: Partial<BodyProfile> | null | undefined): boolean {
  if (!profile) return false
  return (
    (profile.sex === 'female' || profile.sex === 'male') &&
    Number(profile.age) > 0 &&
    Number(profile.heightCm) > 0 &&
    Boolean(profile.activity) &&
    Boolean(profile.goalMode)
  )
}
