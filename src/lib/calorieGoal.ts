export type Sex = 'female' | 'male'

/** Typical daily activity multipliers (TDEE = BMR × factor). */
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very'

export type GoalMode = 'maintain' | 'mild' | 'loss'

export type BodyProfile = {
  sex: Sex
  /** YYYY-MM-DD. When set, age is calculated from this date. */
  birthDate: string | null
  /** Completed years. Recomputed from birthDate; kept for profiles saved before the date existed. */
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

/** Recalculate weight-based goals only after the scale moves by at least this much. */
export const SIGNIFICANT_WEIGHT_DELTA_KG = 1

/**
 * Weight plugged into the calorie and protein formulas.
 * The first weigh-in becomes the anchor. Later ones replace it only after a shift of 1 kg or more.
 */
export function anchoredFormulaWeight(
  anchorKg: number | null | undefined,
  latestKg: number | null | undefined,
): number | null {
  const latest = latestKg != null && latestKg > 0 ? latestKg : null
  const anchor = anchorKg != null && anchorKg > 0 ? anchorKg : null
  if (latest == null) return anchor
  if (anchor == null) return latest
  if (Math.abs(latest - anchor) >= SIGNIFICANT_WEIGHT_DELTA_KG - 1e-9) return latest
  return anchor
}

/** Lorentz ideal weight from sex and height. For 160 cm female this is 55 kg. */
export function calcOptimalWeightKg(sex: Sex, heightCm: number): number | null {
  if (!(heightCm >= 120 && heightCm <= 230)) return null
  const over = heightCm - 150
  const kg = sex === 'male' ? heightCm - 100 - over / 4 : heightCm - 100 - over / 2
  const rounded = Math.round(kg * 10) / 10
  if (rounded < 30 || rounded > 400) return null
  return rounded
}

/** Completed years on `today`. Null when the date is missing, impossible, or in the future. */
export function ageFromBirthDate(birthDate: string, today = new Date()): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const born = new Date(year, month - 1, day)
  if (born.getFullYear() !== year || born.getMonth() !== month - 1 || born.getDate() !== day) {
    return null
  }
  const now = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  if (born > now) return null
  let age = now.getFullYear() - year
  const monthDiff = now.getMonth() - born.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < born.getDate())) age -= 1
  if (age < 0 || age > 130) return null
  return age
}

/** Age for the calorie formula: from the birth date when it is stored, otherwise the saved number. */
export function profileAge(
  profile: { age?: number; birthDate?: string | null },
  today = new Date(),
): number {
  if (profile.birthDate) {
    const fromDate = ageFromBirthDate(profile.birthDate, today)
    if (fromDate != null) return fromDate
  }
  return profile.age != null && profile.age > 0 ? profile.age : 0
}

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

export function calcDailyKcalGoal(
  profile: BodyProfile,
  weightKg: number,
  today = new Date(),
): number {
  const age = profileAge(profile, today)
  if (!(weightKg > 0) || !(profile.heightCm > 0) || !(age > 0)) {
    return FALLBACK_GOAL
  }
  const bmr = bmrMifflin({
    sex: profile.sex,
    weightKg,
    heightCm: profile.heightCm,
    age,
  })
  const tdee = bmr * ACTIVITY_FACTOR[profile.activity]
  const deficit = tdee * DEFICIT_RATIO[profile.goalMode]
  // Never below BMR — hard 1200 floor was too aggressive for many people
  const floor = Math.round(bmr)
  return Math.max(floor, Math.round(tdee - deficit))
}

/** TDEE without deficit — upper “maintain weight” band for ring colors. */
export function calcMaintainKcalGoal(
  profile: BodyProfile,
  weightKg: number,
  today = new Date(),
): number {
  return calcDailyKcalGoal({ ...profile, goalMode: 'maintain' }, weightKg, today)
}

export function isProfileComplete(profile: Partial<BodyProfile> | null | undefined): boolean {
  if (!profile) return false
  return (
    (profile.sex === 'female' || profile.sex === 'male') &&
    profileAge(profile) > 0 &&
    Number(profile.heightCm) > 0 &&
    Boolean(profile.activity) &&
    Boolean(profile.goalMode)
  )
}
