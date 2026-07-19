import { describe, expect, it } from 'vitest'
import { evaluateAchievements, streakEndingOn } from './achievements'
import type { AppData } from '../types'

const empty = (): AppData => ({
  foods: [],
  meals: [],
  weights: [],
  measurements: [],
  steps: [],
  checkIns: [],
  periodStarts: [],
})

describe('streakEndingOn', () => {
  it('counts consecutive days', () => {
    expect(streakEndingOn(['2026-07-17', '2026-07-18', '2026-07-19'], '2026-07-19')).toBe(3)
  })
})

describe('evaluateAchievements', () => {
  it('unlocks first meal and weigh-in', () => {
    const data = empty()
    data.meals.push({
      id: 'm1',
      date: '2026-07-19',
      mealType: 'lunch',
      rawText: 'салат',
      items: [
        {
          name: 'Салат',
          grams: 100,
          kcal: 50,
          protein: 2,
          fat: 1,
          carbs: 5,
          source: 'estimate',
        },
      ],
      totals: { kcal: 50, protein: 2, fat: 1, carbs: 5 },
      isApproximate: false,
      eatingOut: false,
      createdAt: 1,
    })
    data.weights.push({ id: 'w1', date: '2026-07-19', kg: 65, createdAt: 1 })
    const statuses = evaluateAchievements(data, { today: '2026-07-19', targetWeightKg: 60 })
    const map = Object.fromEntries(statuses.map((s) => [s.id, s.unlocked]))
    expect(map.first_meal).toBe(true)
    expect(map.weigh_first).toBe(true)
    expect(map.target_set).toBe(true)
    expect(map.diary_7).toBe(false)
  })
})
