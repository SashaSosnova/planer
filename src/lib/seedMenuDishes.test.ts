import { describe, expect, it } from 'vitest'
import { recipeEditorText } from './recipeCalc'
import {
  buildMenuDishSeedFoods,
  extractMenuDishCandidates,
  menuDishFoodId,
  menuDishSeedCount,
  menuDishSourceText,
} from './seedMenuDishes'

describe('seedMenuDishes', () => {
  it('has a full weekly-menu catalog', () => {
    expect(menuDishSeedCount()).toBeGreaterThanOrEqual(70)
  })

  it('builds dishes with sourceText from real ingredients', () => {
    const candidates = buildMenuDishSeedFoods()
    expect(candidates.length).toBe(menuDishSeedCount())
    expect(candidates.length).toBeGreaterThanOrEqual(70)
    const bolo = candidates.find((c) => c.id === menuDishFoodId('bolognese'))
    expect(bolo?.name).toBe('Болоньезе')
    expect(bolo?.kind).toBe('dish')
    expect(bolo?.per100g.kcal).toBe(120)
    expect(bolo?.recipe?.sourceText).toContain('Болоньезе\n')
    expect(bolo?.recipe?.sourceText).toContain('Говядина')
    expect(bolo?.recipe?.sourceText).not.toMatch(/Болоньезе 100/)
    expect(bolo?.recipe?.notes).toContain('Как готовить')
    expect(bolo?.recipe?.notes).not.toContain('Ингредиенты:')
  })

  it('recipeEditorText prefers sourceText over stub grams', () => {
    const thighs = buildMenuDishSeedFoods().find((c) => c.id === menuDishFoodId('thighs_soy'))!
    const text = recipeEditorText({ ...thighs, updatedAt: 1 })
    expect(text).toBe(thighs.recipe!.sourceText)
    expect(text.split('\n')[0]).toBe('Бёдра в соевом маринаде')
    expect(text).not.toContain('Бёдра в соевом маринаде 100')
  })

  it('skips dishes already in the library by id or name on first insert', () => {
    const all = extractMenuDishCandidates([])
    const first = all[0]!
    const byId = extractMenuDishCandidates([
      { id: first.id, name: 'Другое', kind: 'dish' },
    ])
    expect(byId.find((c) => c.id === first.id)).toBeUndefined()

    const byName = extractMenuDishCandidates([
      { id: 'x', name: first.name, kind: 'ingredient' },
    ])
    expect(byName.find((c) => c.name === first.name)).toBeUndefined()
  })

  it('menuDishSourceText joins title and ingredient lines', () => {
    expect(menuDishSourceText('Суп', ['Картофель 200 г', 'Лук 1 шт'])).toBe(
      'Суп\nКартофель 200 г\nЛук 1 шт',
    )
  })
})
