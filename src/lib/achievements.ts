import type { AppData } from '../types'
import { addDaysIso } from './cycle'
import { todayIso } from './date'
import { calcProteinGoal, VEG_GOAL_G } from './macroGoals'
import { vegGramsFromMeals } from './vegetables'

export type AchievementId =
  | 'first_meal'
  | 'diary_3'
  | 'diary_7'
  | 'diary_30'
  | 'weigh_first'
  | 'weigh_week'
  | 'weigh_month'
  | 'veg_day'
  | 'veg_week'
  | 'protein_day'
  | 'protein_3'
  | 'steps_week'
  | 'measure_first'
  | 'measure_progress'
  | 'own_food'
  | 'own_recipe'
  | 'mood_3'
  | 'mood_7'
  | 'sleep_3'
  | 'sleep_good'
  | 'cycle_start'
  | 'target_set'
  | 'lost_1kg'
  | 'halfway'
  | 'goal_reached'

export type StickerUniverse =
  | 'jujutsu'
  | 'aot'
  | 'lotr'
  | 'expedition33'
  | 'witcher'

export type AchievementSticker = {
  character: string
  universe: StickerUniverse
  /** Asset key under public/stickers/ when art is ready */
  artKey: string
}

export type AchievementDef = {
  id: AchievementId
  title: string
  description: string
  group: 'habits' | 'body' | 'wellness'
  sticker: AchievementSticker
}

export type AchievementStatus = AchievementDef & {
  unlocked: boolean
}

export const ACHIEVEMENT_CATALOG: AchievementDef[] = [
  {
    id: 'first_meal',
    title: 'Первая запись',
    description: 'Добавили приём пищи в дневник',
    group: 'habits',
    sticker: { character: 'Гюстав', universe: 'expedition33', artKey: 'gustave' },
  },
  {
    id: 'diary_3',
    title: '3 дня подряд',
    description: 'Дневник питания три дня подряд',
    group: 'habits',
    sticker: { character: 'Сэм', universe: 'lotr', artKey: 'sam' },
  },
  {
    id: 'diary_7',
    title: 'Неделя дневника',
    description: '7 дней подряд с едой в дневнике',
    group: 'habits',
    sticker: { character: 'Юдзи', universe: 'jujutsu', artKey: 'yuji' },
  },
  {
    id: 'diary_30',
    title: 'Месяц привычки',
    description: '30 дней подряд с записями о еде',
    group: 'habits',
    sticker: { character: 'Фродо', universe: 'lotr', artKey: 'frodo' },
  },
  {
    id: 'weigh_first',
    title: 'Точка отсчёта',
    description: 'Первое взвешивание',
    group: 'body',
    sticker: { character: 'Геральт', universe: 'witcher', artKey: 'geralt' },
  },
  {
    id: 'weigh_week',
    title: 'Вес под контролем',
    description: 'Взвешивались 4 раза за 28 дней',
    group: 'body',
    sticker: { character: 'Леви', universe: 'aot', artKey: 'levi' },
  },
  {
    id: 'weigh_month',
    title: 'Регулярный вес',
    description: 'Взвешивания в 4 разных неделях',
    group: 'body',
    sticker: { character: 'Микаса', universe: 'aot', artKey: 'mikasa' },
  },
  {
    id: 'veg_day',
    title: 'Зелёный день',
    description: `День с ${VEG_GOAL_G} г овощей`,
    group: 'habits',
    sticker: { character: 'Плотва', universe: 'witcher', artKey: 'roach' },
  },
  {
    id: 'veg_week',
    title: 'Овощная неделя',
    description: `5 дней с нормой овощей за 7 дней`,
    group: 'habits',
    sticker: { character: 'Трисс', universe: 'witcher', artKey: 'triss' },
  },
  {
    id: 'protein_day',
    title: 'Белковый день',
    description: 'День в зоне цели по белку',
    group: 'habits',
    sticker: { character: 'Леви', universe: 'aot', artKey: 'levi' },
  },
  {
    id: 'protein_3',
    title: 'Белок в привычке',
    description: '3 дня подряд с нормой белка',
    group: 'habits',
    sticker: { character: 'Нобара', universe: 'jujutsu', artKey: 'nobara' },
  },
  {
    id: 'steps_week',
    title: 'На ногах',
    description: 'Шаги отмечены 7 дней подряд',
    group: 'habits',
    sticker: { character: 'Мегуми', universe: 'jujutsu', artKey: 'megumi' },
  },
  {
    id: 'measure_first',
    title: 'Сантиметр',
    description: 'Первые обмеры',
    group: 'body',
    sticker: { character: 'Ханджи', universe: 'aot', artKey: 'hange' },
  },
  {
    id: 'measure_progress',
    title: 'Динамика фигуры',
    description: 'Повторные обмеры через 2+ недели',
    group: 'body',
    sticker: { character: 'Ханджи', universe: 'aot', artKey: 'hange' },
  },
  {
    id: 'own_food',
    title: 'Своя полка',
    description: 'Добавили продукт в библиотеку',
    group: 'habits',
    sticker: { character: 'Люна', universe: 'expedition33', artKey: 'lune' },
  },
  {
    id: 'own_recipe',
    title: 'Свой рецепт',
    description: 'Сохранили блюдо с рецептом',
    group: 'habits',
    sticker: { character: 'Трисс', universe: 'witcher', artKey: 'triss' },
  },
  {
    id: 'mood_3',
    title: 'Как я сегодня',
    description: 'Настроение отмечено 3 дня',
    group: 'wellness',
    sticker: { character: 'Галадриэль', universe: 'lotr', artKey: 'galadriel' },
  },
  {
    id: 'mood_7',
    title: 'Неделя чувств',
    description: 'Настроение 7 дней подряд',
    group: 'wellness',
    sticker: { character: 'Йеннифер', universe: 'witcher', artKey: 'yennefer' },
  },
  {
    id: 'sleep_3',
    title: 'Сон в фокусе',
    description: 'Сон записан 3 дня',
    group: 'wellness',
    sticker: { character: 'Маэль', universe: 'expedition33', artKey: 'maelle' },
  },
  {
    id: 'sleep_good',
    title: 'Выспалась',
    description: '≥7 часов сна три дня подряд',
    group: 'wellness',
    sticker: { character: 'Галадриэль', universe: 'lotr', artKey: 'galadriel' },
  },
  {
    id: 'cycle_start',
    title: 'Цикл учтён',
    description: 'Отметили начало месячных',
    group: 'wellness',
    sticker: { character: 'Йеннифер', universe: 'witcher', artKey: 'yennefer' },
  },
  {
    id: 'target_set',
    title: 'Есть куда идти',
    description: 'Задан целевой вес',
    group: 'body',
    sticker: { character: 'Годжо', universe: 'jujutsu', artKey: 'gojo' },
  },
  {
    id: 'lost_1kg',
    title: 'Минус килограмм',
    description: 'Минимум на 1 кг ниже стартового веса',
    group: 'body',
    sticker: { character: 'Эрен', universe: 'aot', artKey: 'eren' },
  },
  {
    id: 'halfway',
    title: 'Середина пути',
    description: 'Прошли половину пути к целевому весу',
    group: 'body',
    sticker: { character: 'Цири', universe: 'witcher', artKey: 'ciri' },
  },
  {
    id: 'goal_reached',
    title: 'Цель рядом',
    description: 'Достигли целевого веса (или почти)',
    group: 'body',
    sticker: { character: 'Арагорн', universe: 'lotr', artKey: 'aragorn' },
  },
]

const GROUP_ORDER: AchievementDef['group'][] = ['habits', 'body', 'wellness']

export const ACHIEVEMENT_GROUP_LABELS: Record<AchievementDef['group'], string> = {
  habits: 'Привычки',
  body: 'Вес и тело',
  wellness: 'Самочувствие',
}

function uniqueSortedDates(dates: string[]): string[] {
  return [...new Set(dates)].sort()
}

/** Longest streak of consecutive ISO dates ending on or before `endDate`. */
export function streakEndingOn(dates: string[], endDate: string): number {
  const set = new Set(dates)
  if (!set.has(endDate)) {
    // allow streak ending yesterday if today empty
    const y = addDaysIso(endDate, -1)
    if (!set.has(y)) return 0
    endDate = y
  }
  let n = 0
  let cursor = endDate
  while (set.has(cursor)) {
    n++
    cursor = addDaysIso(cursor, -1)
  }
  return n
}

function hasStreak(dates: string[], min: number, today: string): boolean {
  if (streakEndingOn(dates, today) >= min) return true
  // also accept any historical streak of that length
  const sorted = uniqueSortedDates(dates)
  let run = 0
  let prev: string | null = null
  for (const d of sorted) {
    if (prev && addDaysIso(prev, 1) === d) run++
    else run = 1
    if (run >= min) return true
    prev = d
  }
  return false
}

function mealsByDate(data: AppData): Map<string, typeof data.meals> {
  const map = new Map<string, typeof data.meals>()
  for (const m of data.meals) {
    const list = map.get(m.date) ?? []
    list.push(m)
    map.set(m.date, list)
  }
  return map
}

function weekKey(iso: string): string {
  // Monday-based week id via ISO date of week start approximation using local parse
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y!, m! - 1, d!)
  const day = (dt.getDay() + 6) % 7
  dt.setDate(dt.getDate() - day)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

export type AchievementContext = {
  targetWeightKg?: number | null
  today?: string
}

export function evaluateAchievements(
  data: AppData,
  ctx: AchievementContext = {},
): AchievementStatus[] {
  const today = ctx.today ?? todayIso()
  const mealDates = uniqueSortedDates(data.meals.map((m) => m.date))
  const weightDates = uniqueSortedDates(data.weights.map((w) => w.date))
  const stepDates = uniqueSortedDates(data.steps.filter((s) => s.count > 0).map((s) => s.date))
  const moodDates = uniqueSortedDates(
    data.checkIns.filter((c) => c.mood != null).map((c) => c.date),
  )
  const sleepDates = uniqueSortedDates(
    data.checkIns.filter((c) => c.sleepHours != null).map((c) => c.date),
  )
  const goodSleepDates = uniqueSortedDates(
    data.checkIns
      .filter((c) => c.sleepHours != null && c.sleepHours >= 7)
      .map((c) => c.date),
  )

  const byDate = mealsByDate(data)
  const vegDays: string[] = []
  const proteinDays: string[] = []
  const latestWeight = [...data.weights].sort((a, b) => b.date.localeCompare(a.date))[0]
  const proteinGoal = latestWeight ? calcProteinGoal(latestWeight.kg) : null

  for (const [date, meals] of byDate) {
    if (vegGramsFromMeals(meals) >= VEG_GOAL_G) vegDays.push(date)
    if (proteinGoal != null) {
      const protein = meals.reduce((s, m) => s + m.totals.protein, 0)
      if (protein >= proteinGoal * 0.9) proteinDays.push(date)
    }
  }

  // veg week: any rolling 7-day window with ≥5 veg days
  let vegWeek = false
  const vegSet = new Set(vegDays)
  for (const start of vegDays) {
    let count = 0
    for (let i = 0; i < 7; i++) {
      if (vegSet.has(addDaysIso(start, i))) count++
    }
    if (count >= 5) {
      vegWeek = true
      break
    }
  }

  const weightsSorted = [...data.weights].sort((a, b) => a.date.localeCompare(b.date))
  const startKg = weightsSorted[0]?.kg
  const minKg = weightsSorted.length
    ? Math.min(...weightsSorted.map((w) => w.kg))
    : undefined
  const currentKg = latestWeight?.kg
  const target = ctx.targetWeightKg

  const weighIn28 = weightDates.filter((d) => d >= addDaysIso(today, -27)).length
  const distinctWeeks = new Set(weightDates.map(weekKey)).size

  const measures = [...data.measurements].sort((a, b) => a.date.localeCompare(b.date))
  let measureProgress = false
  if (measures.length >= 2) {
    const first = measures[0]!
    const last = measures[measures.length - 1]!
    const span =
      (new Date(last.date).getTime() - new Date(first.date).getTime()) / 86_400_000
    measureProgress = span >= 14
  }

  let halfway = false
  let goalReached = false
  let lost1 = false
  if (startKg != null && currentKg != null && minKg != null) {
    lost1 = startKg - minKg >= 1
    if (target != null && target < startKg) {
      const total = startKg - target
      const done = startKg - currentKg
      halfway = total > 0 && done >= total * 0.5
      goalReached = currentKg <= target + 0.3
    } else if (target != null && target > startKg) {
      const total = target - startKg
      const done = currentKg - startKg
      halfway = total > 0 && done >= total * 0.5
      goalReached = currentKg >= target - 0.3
    }
  }

  const unlocked = new Set<AchievementId>()
  if (data.meals.length > 0) unlocked.add('first_meal')
  if (hasStreak(mealDates, 3, today)) unlocked.add('diary_3')
  if (hasStreak(mealDates, 7, today)) unlocked.add('diary_7')
  if (hasStreak(mealDates, 30, today)) unlocked.add('diary_30')
  if (data.weights.length > 0) unlocked.add('weigh_first')
  if (weighIn28 >= 4) unlocked.add('weigh_week')
  if (distinctWeeks >= 4) unlocked.add('weigh_month')
  if (vegDays.length > 0) unlocked.add('veg_day')
  if (vegWeek) unlocked.add('veg_week')
  if (proteinDays.length > 0) unlocked.add('protein_day')
  if (hasStreak(proteinDays, 3, today)) unlocked.add('protein_3')
  if (hasStreak(stepDates, 7, today)) unlocked.add('steps_week')
  if (data.measurements.length > 0) unlocked.add('measure_first')
  if (measureProgress) unlocked.add('measure_progress')
  if (data.foods.some((f) => !f.recipe)) unlocked.add('own_food')
  if (data.foods.some((f) => f.kind === 'dish' || f.recipe)) unlocked.add('own_recipe')
  if (moodDates.length >= 3) unlocked.add('mood_3')
  if (hasStreak(moodDates, 7, today)) unlocked.add('mood_7')
  if (sleepDates.length >= 3) unlocked.add('sleep_3')
  if (hasStreak(goodSleepDates, 3, today)) unlocked.add('sleep_good')
  if (data.periodStarts.length > 0) unlocked.add('cycle_start')
  if (target != null && target >= 30) unlocked.add('target_set')
  if (lost1) unlocked.add('lost_1kg')
  if (halfway) unlocked.add('halfway')
  if (goalReached) unlocked.add('goal_reached')

  return ACHIEVEMENT_CATALOG.map((def) => ({
    ...def,
    unlocked: unlocked.has(def.id),
  })).sort((a, b) => {
    const g = GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group)
    if (g !== 0) return g
    if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1
    return 0
  })
}

export function unlockedCount(statuses: AchievementStatus[]): {
  unlocked: number
  total: number
} {
  return {
    unlocked: statuses.filter((s) => s.unlocked).length,
    total: statuses.length,
  }
}
