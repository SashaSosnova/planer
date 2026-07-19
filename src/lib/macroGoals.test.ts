import { describe, expect, it } from 'vitest'
import { calcProteinGoal, VEG_GOAL_G } from './macroGoals'

describe('calcProteinGoal', () => {
  it('uses 1.6 g per kg', () => {
    expect(calcProteinGoal(60)).toBe(96)
    expect(calcProteinGoal(72.5)).toBe(116)
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
