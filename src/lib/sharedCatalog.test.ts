import { describe, expect, it } from 'vitest'
import { foodsToCopyIntoShared } from './sharedCatalog'
import type { FoodItem } from '../types'

function food(id: string, name = id): FoodItem {
  return {
    id,
    name,
    aliases: [],
    per100g: { kcal: 1, protein: 0, fat: 0, carbs: 0 },
    updatedAt: 1,
  }
}

describe('foodsToCopyIntoShared', () => {
  it('copies personal foods missing from the shared catalog', () => {
    const copy = foodsToCopyIntoShared(
      [food('shared')],
      [food('shared'), food('mine', 'Творог')],
      [],
      new Set(),
    )
    expect(copy.map((f) => f.id)).toEqual(['mine'])
  })

  it('keeps a local-only food and skips suppressed ids', () => {
    const copy = foodsToCopyIntoShared(
      [],
      [],
      [food('local'), food('gone')],
      new Set(['gone']),
    )
    expect(copy.map((f) => f.id)).toEqual(['local'])
  })

  it('does not duplicate an id that exists in both personal and local', () => {
    const copy = foodsToCopyIntoShared([], [food('a')], [food('a')], new Set())
    expect(copy).toHaveLength(1)
  })
})