import { describe, expect, it } from 'vitest'
import { calcProteinGoal, VEG_GOAL_G } from './macroGoals'

describe('calcProteinGoal', () => {
  it('uses 1.1 g per kg', () => {
    expect(calcProteinGoal(60)).toBe(66)
    expect(calcProteinGoal(63.6)).toBe(70)
    expect(calcProteinGoal(72.5)).toBe(80)
  })

  it('returns null without weight', () => {
    expect(calcProteinGoal(0)).toBeNull()
    expect(calcProteinGoal(-1)).toBeNull()
  })
})

describe('VEG_GOAL_G', () => {
  it('is 400 g', () => {
    expect(VEG_GOAL_G).toBe(400)
  })
})
