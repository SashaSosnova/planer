import { describe, expect, it } from 'vitest'
import {
  ageFromBirthDate,
  anchoredFormulaWeight,
  bmrMifflin,
  calcDailyKcalGoal,
  calcMaintainKcalGoal,
  calcOptimalWeightKg,
  isProfileComplete,
  profileAge,
  type BodyProfile,
} from './calorieGoal'

const baseProfile: BodyProfile = {
  sex: 'female',
  birthDate: null,
  age: 30,
  heightCm: 165,
  activity: 'moderate',
  goalMode: 'mild',
}

describe('anchoredFormulaWeight', () => {
  it('adopts the first weigh-in and ignores smaller swings', () => {
    expect(anchoredFormulaWeight(null, 64.7)).toBe(64.7)
    expect(anchoredFormulaWeight(64.7, 65.4)).toBe(64.7)
    expect(anchoredFormulaWeight(64.7, 63.8)).toBe(64.7)
  })

  it('moves the anchor after a shift of 1 kg', () => {
    expect(anchoredFormulaWeight(64.7, 65.7)).toBe(65.7)
    expect(anchoredFormulaWeight(64.7, 63.7)).toBe(63.7)
  })
})

describe('calcOptimalWeightKg', () => {
  it('uses the Lorentz formula', () => {
    expect(calcOptimalWeightKg('female', 160)).toBe(55)
    expect(calcOptimalWeightKg('male', 180)).toBe(72.5)
    expect(calcOptimalWeightKg('female', 100)).toBeNull()
  })
})

describe('ageFromBirthDate', () => {
  const today = new Date(2026, 10, 19)

  it('counts completed years', () => {
    expect(ageFromBirthDate('1994-11-19', today)).toBe(32)
    expect(ageFromBirthDate('1994-11-20', today)).toBe(31)
    expect(ageFromBirthDate('1992-02-29', today)).toBe(34)
  })

  it('rejects impossible and future dates', () => {
    expect(ageFromBirthDate('1994-02-29', today)).toBeNull()
    expect(ageFromBirthDate('2027-01-01', today)).toBeNull()
    expect(ageFromBirthDate('19.04.1994', today)).toBeNull()
  })

  it('uses the birth date instead of a stale stored age', () => {
    const profile: BodyProfile = { ...baseProfile, birthDate: '1990-01-01', age: 99 }
    expect(profileAge(profile, today)).toBe(36)
    expect(calcDailyKcalGoal(profile, 60, today)).toBe(
      calcDailyKcalGoal({ ...baseProfile, age: 36 }, 60, today),
    )
  })
})

describe('bmrMifflin', () => {
  it('computes Mifflin–St Jeor for female', () => {
    // 10*60 + 6.25*165 - 5*30 - 161 = 600 + 1031.25 - 150 - 161 = 1320.25
    expect(bmrMifflin({ sex: 'female', weightKg: 60, heightCm: 165, age: 30 })).toBeCloseTo(
      1320.25,
      2,
    )
  })

  it('computes Mifflin–St Jeor for male', () => {
    // 10*80 + 6.25*180 - 5*35 + 5 = 800 + 1125 - 175 + 5 = 1755
    expect(bmrMifflin({ sex: 'male', weightKg: 80, heightCm: 180, age: 35 })).toBe(1755)
  })
})

describe('calcDailyKcalGoal', () => {
  it('returns fallback when weight missing', () => {
    expect(calcDailyKcalGoal(baseProfile, 0)).toBe(1800)
  })

  it('never goes below BMR', () => {
    const aggressive: BodyProfile = { ...baseProfile, activity: 'sedentary', goalMode: 'loss' }
    const bmr = Math.round(bmrMifflin({ sex: 'female', weightKg: 55, heightCm: 160, age: 45 }))
    const goal = calcDailyKcalGoal(aggressive, 55)
    expect(goal).toBeGreaterThanOrEqual(bmr)
  })

  it('maintain is higher than loss for same body', () => {
    const maintain = calcDailyKcalGoal({ ...baseProfile, goalMode: 'maintain' }, 60)
    const loss = calcDailyKcalGoal({ ...baseProfile, goalMode: 'loss' }, 60)
    expect(maintain).toBeGreaterThan(loss)
  })
})

describe('calcMaintainKcalGoal', () => {
  it('matches goalMode maintain', () => {
    const withLoss = { ...baseProfile, goalMode: 'loss' as const }
    expect(calcMaintainKcalGoal(withLoss, 60)).toBe(
      calcDailyKcalGoal({ ...baseProfile, goalMode: 'maintain' }, 60),
    )
    expect(calcMaintainKcalGoal(withLoss, 60)).toBeGreaterThan(
      calcDailyKcalGoal(withLoss, 60),
    )
  })
})

describe('isProfileComplete', () => {
  it('requires all fields', () => {
    expect(isProfileComplete(null)).toBe(false)
    expect(isProfileComplete({ sex: 'female' })).toBe(false)
    expect(isProfileComplete(baseProfile)).toBe(true)
  })
})
