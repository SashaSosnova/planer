import { describe, expect, it } from 'vitest'
import type { FoodRef } from '../types'
import { generateAliases } from './foodAliases'
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

const tvorog: FoodRef = {
  id: 't1',
  name: 'Творог',
  aliases: generateAliases('Творог'),
  per100g: { kcal: 100, protein: 16, fat: 5, carbs: 3 },
  kind: 'ingredient',
}

const tvorozhnySyr: FoodRef = {
  id: 't2',
  name: 'Творожный сыр',
  aliases: generateAliases('Творожный сыр'),
  per100g: { kcal: 250, protein: 6, fat: 24, carbs: 3 },
  kind: 'ingredient',
}

describe('scoreFoodMatch', () => {
  it('exact name scores 100', () => {
    expect(scoreFoodMatch('паста', pasta)).toBe(100)
  })

  it('short query does not strongly match long dish', () => {
    expect(scoreFoodMatch('паста', pastaDish)).toBeLessThan(70)
  })

  it('творог / творога match Творог, not Творожный сыр', () => {
    expect(scoreFoodMatch('творог', tvorog)).toBeGreaterThan(scoreFoodMatch('творог', tvorozhnySyr))
    expect(scoreFoodMatch('творога', tvorog)).toBeGreaterThan(scoreFoodMatch('творога', tvorozhnySyr))
    expect(scoreFoodMatch('творог', tvorozhnySyr)).toBeLessThan(55)
    expect(scoreFoodMatch('творога', tvorozhnySyr)).toBeLessThan(55)
  })
})

describe('findBestFood', () => {
  it('prefers exact ingredient over weak dish match', () => {
    const best = findBestFood('паста', [pasta, pastaDish], 55)
    expect(best?.id).toBe('1')
  })

  it('prefers Творог over Творожный сыр', () => {
    expect(findBestFood('творог', [tvorog, tvorozhnySyr])?.name).toBe('Творог')
    expect(findBestFood('творога', [tvorozhnySyr, tvorog])?.name).toBe('Творог')
    expect(findBestFood('200 гр творога', [tvorog, tvorozhnySyr])?.name).toBe('Творог')
  })

  it('on equal exact scores prefers shorter name', () => {
    const creamWithAlias: FoodRef = {
      ...tvorozhnySyr,
      aliases: ['творог'],
    }
    expect(findBestFood('творог', [creamWithAlias, tvorog])?.name).toBe('Творог')
    expect(findBestFood('творог', [tvorog, creamWithAlias])?.name).toBe('Творог')
  })

  it('does not match Творожный сыр for творог when Творог absent', () => {
    expect(findBestFood('творог', [tvorozhnySyr])).toBeNull()
    expect(findBestFood('творога', [tvorozhnySyr])).toBeNull()
    expect(findBestFood('200 гр творог', [tvorozhnySyr])).toBeNull()
    const withBadAlias = {
      ...tvorozhnySyr,
      aliases: ['творог', ...tvorozhnySyr.aliases],
    }
    expect(scoreFoodMatch('творог', withBadAlias)).toBeLessThan(55)
    expect(findBestFood('творог', [withBadAlias])).toBeNull()
  })
})
