import { describe, expect, it } from 'vitest'
import type { FoodRef } from '../types'
import { findBestFood, scoreFoodMatch } from './foodMatch'

const pasta: FoodRef = {
  id: '1',
  name: 'Паста',
  aliases: [],
  per100g: { kcal: 150, protein: 5, fat: 3, carbs: 25 },
  kind: 'ingredient',
}

const pastaDish: FoodRef = {
  id: '2',
  name: 'Паста с кабачком и курицей',
  aliases: [],
  per100g: { kcal: 120, protein: 10, fat: 4, carbs: 12 },
  kind: 'dish',
}

describe('scoreFoodMatch', () => {
  it('exact name scores 100', () => {
    expect(scoreFoodMatch('паста', pasta)).toBe(100)
  })

  it('short query does not strongly match long dish', () => {
    expect(scoreFoodMatch('паста', pastaDish)).toBeLessThan(70)
  })
})

describe('findBestFood', () => {
  it('prefers exact ingredient over weak dish match', () => {
    const best = findBestFood('паста', [pasta, pastaDish], 55)
    expect(best?.id).toBe('1')
  })
})
