import type { Meal } from '../types'
import type { WeekStats } from './dayStats'
import { calcProteinGoal, VEG_GOAL_G } from './macroGoals'
import { SWEET_BUDGET_KCAL } from './sweets'

const SKIP_FOOD =
  /^(кофе|чай|вода|соль|сахар|специи|перец|масло|соус|молоко|сливки)$/i

const PROTEIN_STAPLE =
  /куриц|индейк|минтай|треск|рыб|форел|лосос|говяд|телятин|творог|яйц|гречк|чечевиц|нут/i

export type WeekReview = {
  good: string[]
  ok: string[]
  tweak: string[]
  text: string
}

function foodDays(week: WeekStats): number {
  const n = week.days.filter((d) => d.meals.some((m) => !m.planned)).length
  return n > 0 ? n : 1
}

function eatenMeals(week: WeekStats): Meal[] {
  return week.days.flatMap((d) => d.meals.filter((m) => !m.planned))
}

function avg(total: number, days: number): number {
  return days > 0 ? total / days : 0
}

function formatNum(n: number): string {
  return Math.round(n).toLocaleString('ru-RU')
}

function stapleHint(meals: Meal[]): string | null {
  const hits = new Set<string>()
  for (const meal of meals) {
    for (const item of meal.items) {
      const name = item.name.trim()
      if (name.length < 3 || SKIP_FOOD.test(name)) continue
      if (PROTEIN_STAPLE.test(name.toLowerCase().replace(/ё/g, 'е'))) {
        hits.add(name.split(/[,(]/)[0]!.trim().toLowerCase())
      }
    }
  }
  if (hits.size > 0) {
    return `в основе ${[...hits].slice(0, 3).join(', ')} — сытная база`
  }
  const blob = meals.map((m) => m.rawText).join(' ')
  if (PROTEIN_STAPLE.test(blob.toLowerCase())) {
    return 'в основе рыба, птица или крупы — сытная база'
  }
  return null
}

type Bucket = 'good' | 'ok' | 'tweak'
type Fact = { bucket: Bucket; priority: number; text: string }

function pick(facts: Fact[], bucket: Bucket, n: number): string[] {
  return facts
    .filter((f) => f.bucket === bucket)
    .sort((a, b) => a.priority - b.priority)
    .slice(0, n)
    .map((f) => f.text)
}

/**
 * Calm week review: what went well, what's normal, what is worth a small tweak.
 * Sweets and carbs are not treated as mistakes by default.
 */
export function buildWeekReview(week: WeekStats): WeekReview {
  const days = foodDays(week)
  const calendarDays = Math.max(week.days.length, 1)
  const avgKcal = Math.round(avg(week.totals.kcal, days))
  const dailyGoal = week.kcalGoal > 0 ? week.kcalGoal / calendarDays : 0
  const proteinDay = avg(week.totals.protein, days)
  const weightKg = week.weightStart ?? week.weightEnd
  const proteinGoal = weightKg != null ? calcProteinGoal(weightKg) : null
  const vegDay = avg(
    week.days.reduce((s, d) => s + d.vegGrams, 0),
    days,
  )
  const sweetDay = avg(
    week.days.reduce((s, d) => s + d.sweetKcal, 0),
    days,
  )
  const sweetShare =
    week.totals.kcal > 0 ? week.days.reduce((s, d) => s + d.sweetKcal, 0) / week.totals.kcal : 0
  const outDays = week.days.filter((d) => d.meals.some((m) => m.eatingOut && !m.planned)).length
  const meals = eatenMeals(week)
  const hasDayDetail = week.days.some((d) => d.meals.length > 0)

  const facts: Fact[] = []
  const add = (bucket: Bucket, priority: number, text: string) => {
    facts.push({ bucket, priority, text })
  }

  if (dailyGoal > 0) {
    const ratio = avgKcal / dailyGoal
    if (ratio >= 0.9 && ratio <= 1.08) {
      add('good', 1, `средние ${formatNum(avgKcal)} ккал — около цели`)
    } else if (ratio >= 0.8 && ratio < 0.9) {
      add(
        'ok',
        3,
        `средние ${formatNum(avgKcal)} ккал, чуть ниже цели — нормальный мягкий дефицит, если дни записаны целиком`,
      )
    } else if (ratio > 1.08 && ratio <= 1.18) {
      add('ok', 3, `средние ${formatNum(avgKcal)} ккал чуть выше цели — обычная вариация недели`)
    } else if (ratio > 1.18) {
      add(
        'tweak',
        1,
        `средние ${formatNum(avgKcal)} ккал заметно выше цели — имеет смысл вернуть обычные дни, не устраивать голод`,
      )
    } else if (ratio < 0.8) {
      add(
        'tweak',
        1,
        `средние ${formatNum(avgKcal)} ккал низкие: либо недоел, либо день не закрыт. Лучше дописать, чем ещё резать`,
      )
    }
  } else {
    add('ok', 3, `средние ${formatNum(avgKcal)} ккал/день`)
  }

  const staples = stapleHint(meals)
  if (staples) add('good', 2, staples)

  if (proteinGoal != null) {
    if (proteinDay >= proteinGoal * 0.95) {
      add('good', 3, `белка хватает (~${formatNum(proteinDay)} г/день)`)
    } else if (proteinDay >= proteinGoal * 0.75) {
      add(
        'ok',
        5,
        `белка около ${formatNum(proteinDay)} г — нормально, можно чуть добавить рыбы или творога`,
      )
    } else {
      add(
        'tweak',
        2,
        `белка маловато (~${formatNum(proteinDay)} г при ориентире ~${proteinGoal} г) — ещё одна порция рыбы, птицы или творога`,
      )
    }
  } else if (proteinDay >= 70) {
    add('good', 3, `белка достаточно (~${formatNum(proteinDay)} г/день)`)
  } else if (proteinDay > 0 && proteinDay < 50) {
    add('tweak', 2, `белка маловато (~${formatNum(proteinDay)} г/день)`)
  }

  if (hasDayDetail) {
    if (vegDay >= VEG_GOAL_G * 0.75) {
      add('good', 4, 'овощей достаточно')
    } else if (vegDay >= 150) {
      add(
        'ok',
        4,
        `овощей ~${formatNum(vegDay)} г — нормально, ещё одна порция салата полезнее, чем резать калории`,
      )
    } else {
      add(
        'tweak',
        3,
        `овощей мало (~${formatNum(vegDay)} г). Салат или тушёные овощи к обеду закроют разрыв без урезания еды`,
      )
    }

    if (sweetDay > SWEET_BUDGET_KCAL || sweetShare > 0.18) {
      add(
        'tweak',
        4,
        `сладкое часто сверху бюджета (~${formatNum(sweetDay)} ккал/день). Не убирать совсем — чуть меньше порция или не каждый вечер`,
      )
    } else if (sweetDay >= 80) {
      add(
        'ok',
        2,
        `сладкое в бюджете (~${formatNum(sweetDay)} ккал/день) — в таких пределах это часть рациона`,
      )
    }
  }

  if (week.avgSteps != null && week.avgSteps > 0) {
    const s = week.avgSteps
    if (s >= 8000) add('good', 5, `много ходьбы (~${formatNum(s)} шагов)`)
    else if (s >= 4000) {
      add('ok', 1, `шаги ~${formatNum(s)} — обычная городская неделя`)
    } else {
      add(
        'tweak',
        5,
        `шагов ~${formatNum(s)}. Если есть силы, +2–3 тысячи прогулкой — для самочувствия, не как наказание`,
      )
    }
  }

  if (outDays >= 4) {
    add('tweak', 6, 'много приёмов вне дома — оценки калорий грубее, ориентир менее точный')
  } else if (outDays >= 2) {
    add('ok', 6, `вне дома ${outDays} дн. — нормально`)
  }

  const good = pick(facts, 'good', 3)
  const ok = pick(facts, 'ok', 3)
  const tweak = pick(facts, 'tweak', 3)

  if (good.length === 0 && ok.length === 0 && tweak.length === 0) {
    ok.push('неделя записана — этого уже достаточно, чтобы не гадать')
  }

  const text = [
    good.length ? `Хорошо: ${good.join('; ')}.` : '',
    ok.length ? `Нормально: ${ok.join('; ')}.` : '',
    tweak.length ? `Можно подкрутить: ${tweak.join('; ')}.` : '',
  ]
    .filter(Boolean)
    .join('\n')

  return { good, ok, tweak, text }
}

/** Compact facts for the LLM — no weekly BJU dump, no drink list. */
export function weekReviewFacts(week: WeekStats): string {
  const review = buildWeekReview(week)
  const days = foodDays(week)
  const calendarDays = Math.max(week.days.length, 1)
  const avgKcal = Math.round(avg(week.totals.kcal, days))
  const dailyGoal = week.kcalGoal > 0 ? Math.round(week.kcalGoal / calendarDays) : 0
  const proteinDay = Math.round(avg(week.totals.protein, days))
  const weightKg = week.weightStart ?? week.weightEnd
  const proteinGoal = weightKg != null ? calcProteinGoal(weightKg) : null
  const vegDay = Math.round(
    avg(
      week.days.reduce((s, d) => s + d.vegGrams, 0),
      days,
    ),
  )
  const sweetDay = Math.round(
    avg(
      week.days.reduce((s, d) => s + d.sweetKcal, 0),
      days,
    ),
  )
  const steps =
    week.avgSteps != null && week.avgSteps > 0
      ? week.avgSteps >= 8000
        ? `${week.avgSteps}/день (высокая активность — не пиши, что шагов мало)`
        : week.avgSteps >= 4000
          ? `${week.avgSteps}/день (обычная городская неделя — это нормально, не мало)`
          : `${week.avgSteps}/день (можно мягко добавить прогулку, без нравоучений)`
      : 'нет данных'
  return [
    `Средние ккал: ${avgKcal} при цели ${dailyGoal || 'нет'}`,
    `Белок: ${proteinDay} г/день${proteinGoal != null ? ` (ориентир ${proteinGoal} г)` : ''}`,
    `Овощи: ${vegDay} г/день (ориентир ${VEG_GOAL_G} г)`,
    `Сладкое: ${sweetDay} ккал/день (бюджет ${SWEET_BUDGET_KCAL}; в бюджете — норма, не промах)`,
    `Шаги: ${steps}`,
    `Черновик: ${review.text}`,
  ].join('\n')
}
