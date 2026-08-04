import { describe, expect, it } from 'vitest'
import type { Meal } from '../types'
import {
  calcSweetBudgetKcal,
  isSweetName,
  sweetKcalFromMeals,
  sweetScaleZone,
} from './sweets'

function meal(partial: Partial<Meal> & Pick<Meal, 'id' | 'date'>): Meal {
  return {
    mealType: 'snack',
    rawText: 'тест',
    items: [],
    totals: { kcal: 0, protein: 0, fat: 0, carbs: 0 },
    isApproximate: false,
    eatingOut: false,
    createdAt: 1,
    ...partial,
  }
}

describe('isSweetName', () => {
  it('detects common treats', () => {
    expect(isSweetName('Шоколад молочный')).toBe(true)
    expect(isSweetName('мороженое пломбир')).toBe(true)
    expect(isSweetName('печенье овсяное')).toBe(true)
    expect(isSweetName('торт Наполеон')).toBe(true)
    expect(isSweetName('бисквитный рулет')).toBe(true)
  })

  it('detects a wide range of sweets and pastry', () => {
    const sweets = [
      'бисквитный рулет',
      'рулет с маком',
      'медовик',
      'эклер с кремом',
      'профитроли',
      'безе',
      'меренга',
      'пудинг ванильный',
      'панна котта',
      'крем-брюле',
      'пахлава',
      'baklava',
      'шарлотка',
      'штрудель яблочный',
      'кулич',
      'ромовая баба',
      'тарталетки',
      'синнабон',
      'чуррос',
      'заварной крем',
      'трубочки с кремом',
      'яблочный пирог',
      'пирог с вишней',
      'глазированный сырок',
      'сырок',
      'сырники',
      'зефир',
      'пастила',
      'мармелад',
      'халва',
      'лукум',
      'козинаки',
      'ирис',
      'леденцы',
      'сгущенка',
      'варенье вишневое',
      'джем',
      'нутелла',
      'мед',
      'какао',
      'милкшейк',
      'сладкая вата',
      'попкорн карамельный',
      'сладкое',
      'батончик Snickers',
      'Raffaello',
      'Milka',
      'печенюшки',
      'коврижка',
      'булочка с корицей',
    ]
    for (const name of sweets) {
      expect(isSweetName(name), name).toBe(true)
    }
  })

  it('skips savory false positives', () => {
    expect(isSweetName('перец сладкий')).toBe(false)
    expect(isSweetName('куриная грудка')).toBe(false)
    expect(isSweetName('салат цезарь')).toBe(false)
    expect(isSweetName('мясной рулет')).toBe(false)
    expect(isSweetName('рулет из курицы')).toBe(false)
    expect(isSweetName('капустный рулет')).toBe(false)
    expect(isSweetName('кисло-сладкий соус')).toBe(false)
    expect(isSweetName('сладкий картофель')).toBe(false)
    expect(isSweetName('какао-порошок')).toBe(false)
    expect(isSweetName('пирог с капустой')).toBe(false)
    expect(isSweetName('булочка с сыром')).toBe(false)
  })
})

describe('calcSweetBudgetKcal', () => {
  it('is a fixed 300 kcal', () => {
    expect(calcSweetBudgetKcal(1400)).toBe(300)
    expect(calcSweetBudgetKcal(500)).toBe(300)
    expect(calcSweetBudgetKcal()).toBe(300)
  })
})

describe('sweetKcalFromMeals', () => {
  it('sums matching item kcal', () => {
    const meals = [
      meal({
        id: '1',
        date: '2026-08-04',
        items: [
          {
            name: 'Шоколад',
            grams: 30,
            kcal: 160,
            protein: 2,
            fat: 10,
            carbs: 15,
            source: 'library',
          },
          {
            name: 'Яблоко',
            grams: 100,
            kcal: 52,
            protein: 0,
            fat: 0,
            carbs: 14,
            source: 'library',
          },
        ],
        totals: { kcal: 212, protein: 2, fat: 10, carbs: 29 },
      }),
    ]
    expect(sweetKcalFromMeals(meals)).toBe(160)
  })

  it('counts a pure treat snack from raw text when items miss the name', () => {
    const meals = [
      meal({
        id: '1',
        date: '2026-08-04',
        rawText: 'мороженое',
        mealType: 'snack',
        items: [
          {
            name: 'Пломбир',
            grams: 80,
            kcal: 180,
            protein: 3,
            fat: 10,
            carbs: 18,
            source: 'estimate',
          },
        ],
        totals: { kcal: 180, protein: 3, fat: 10, carbs: 18 },
      }),
    ]
    expect(sweetKcalFromMeals(meals)).toBe(180)
  })
})

describe('sweetScaleZone', () => {
  it('marks over budget', () => {
    expect(sweetScaleZone(100, 140)).toBe('ok')
    expect(sweetScaleZone(150, 140)).toBe('warn')
    expect(sweetScaleZone(180, 140)).toBe('over')
  })
})
