import { describe, expect, it } from 'vitest'
import {
  bmrMifflin,
  calcDailyKcalGoal,
  isProfileComplete,
  type BodyProfile,
} from './calorieGoal'

const baseProfile: BodyProfile = {
  sex: 'female',
  age: 30,
  heightCm: 165,
  activity: 'moderate',
  goalMode: 'mild',
}

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

describe('isProfileComplete', () => {
  it('requires all fields', () => {
    expect(isProfileComplete(null)).toBe(false)
    expect(isProfileComplete({ sex: 'female' })).toBe(false)
    expect(isProfileComplete(baseProfile)).toBe(true)
  })
})
