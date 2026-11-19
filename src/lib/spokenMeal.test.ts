import { describe, expect, it } from 'vitest'
import { parseMealLocal } from './parseMealLocal'
import { resolveSpokenMeal } from './spokenMeal'
import type { FoodRef } from '../types'

const FOODS: FoodRef[] = [
  {
    id: 'milk',
    name: 'Молоко',
    aliases: ['молоко', 'молока'],
    per100g: { kcal: 52, protein: 2.9, fat: 2.5, carbs: 4.7 },
  },
  {
    id: 'bread',
    name: 'Хлеб',
    aliases: ['хлеб', 'хлеба'],
    per100g: { kcal: 265, protein: 9, fat: 3, carbs: 49 },
  },
]

describe('resolveSpokenMeal', () => {
  it('drops the corrected amount and keeps the final products', () => {
    expect(
      resolveSpokenMeal('я съела молоко 100 грамм, хлеб 10 грамм, ой нет хлеб 20 грамм'),
    ).toEqual({
      text: 'Молоко 100 г\nХлеб 20 г',
      mealType: null,
    })
  })

  it('understands number words and a correction without commas', () => {
    expect(
      resolveSpokenMeal(
        'я съела молоко сто грамм хлеб десять грамм ой нет хлеб двадцать грамм',
      ).text,
    ).toBe('Молоко 100 г\nХлеб 20 г')
  })

  it('replaces only the grams of the last product', () => {
    expect(resolveSpokenMeal('творог 150 грамм, ой нет, 200 грамм').text).toBe('Творог 200 г')
  })

  it('joins a split «ой, нет» with the corrected grams', () => {
    expect(resolveSpokenMeal('хлеб 10 грамм, ой, нет, 20 грамм').text).toBe('Хлеб 20 г')
  })

  it('corrects an earlier product by name', () => {
    expect(
      resolveSpokenMeal(
        'молоко 100 грамм, хлеб 10 грамм, яблоко 80 грамм, ой нет хлеб 25 грамм',
      ).text,
    ).toBe('Молоко 100 г\nХлеб 25 г\nЯблоко 80 г')
  })

  it('applies «не 10 а 20»', () => {
    expect(resolveSpokenMeal('хлеб 10 грамм не 10 а 20 грамм').text).toBe('Хлеб 20 г')
  })

  it('replaces the product itself', () => {
    expect(resolveSpokenMeal('хлеб 30 грамм, ой нет не хлеб а батон 40 грамм').text).toBe(
      'Батон 40 г',
    )
  })

  it('keeps the meal type and strips the preamble', () => {
    expect(resolveSpokenMeal('я съела на завтрак овсянка 200 грамм')).toEqual({
      text: 'Овсянка 200 г',
      mealType: 'breakfast',
    })
  })

  it('lets the later mention win', () => {
    expect(resolveSpokenMeal('молоко 100 грамм, молоко 150 грамм').text).toBe('Молоко 150 г')
  })

  it('adds grams when the next mention is «ещё»', () => {
    expect(resolveSpokenMeal('молоко 100 грамм и ещё молоко 50 грамм').text).toBe('Молоко 150 г')
  })

  it('splits two products joined by «и»', () => {
    expect(resolveSpokenMeal('молоко 100 грамм и хлеб 20 грамм').text).toBe(
      'Молоко 100 г\nХлеб 20 г',
    )
  })

  it('removes a product that was taken back', () => {
    expect(resolveSpokenMeal('хлеб 30 грамм, ой нет').text).toBe('')
  })

  it('understands полкило', () => {
    expect(resolveSpokenMeal('творог полкило').text).toBe('Творог 500 г')
  })

  it('keeps a dish name that contains «и»', () => {
    expect(resolveSpokenMeal('паста с кабачком и курицей 300 грамм').text).toBe(
      'Паста с кабачком и курицей 300 г',
    )
  })

  it('accepts bare numbers', () => {
    expect(resolveSpokenMeal('молоко 100, хлеб 20, ой нет хлеб 25').text).toBe(
      'Молоко 100 г\nХлеб 25 г',
    )
  })

  it('feeds the final lines into the meal parser', () => {
    const spoken = resolveSpokenMeal(
      'я съела молоко 100 грамм, хлеб 10 грамм, ой нет хлеб 20 грамм',
    )
    const draft = parseMealLocal(spoken.text, FOODS)
    expect(draft.items.map((item) => [item.name, item.grams, item.foodId])).toEqual([
      ['Молоко', 100, 'milk'],
      ['Хлеб', 20, 'bread'],
    ])
  })
})
