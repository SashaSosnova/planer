import type { PeriodStart, WeightEntry } from '../types'
import { getCycleInfo, type CyclePhase } from './cycle'
import { todayIso } from './date'
import { round1 } from './nutrition'

export type ProgressMotivator = {
  /** Short supportive line under the kg hero */
  text: string
  /** Optional day-to-day delta label, e.g. «с прошлого раза +0,8 кг» */
  deltaLabel: string | null
  tone: 'up' | 'down' | 'flat' | 'soft'
}

function fmtKg(n: number): string {
  return Math.abs(n).toFixed(1).replace('.', ',')
}

function parseIsoMs(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y!, m! - 1, d!).getTime()
}

function daysBetween(a: string, b: string): number {
  return Math.round((parseIsoMs(b) - parseIsoMs(a)) / 86_400_000)
}

function sortedWeights(weights: WeightEntry[]): WeightEntry[] {
  return [...weights]
    .filter((w) => w.kg >= 30 && w.kg <= 400)
    .sort((a, b) => {
      const byDate = a.date.localeCompare(b.date)
      if (byDate !== 0) return byDate
      return a.createdAt - b.createdAt
    })
}

function waterRetentionLikely(phase: CyclePhase, jumpKg: number, spanDays: number): boolean {
  if (jumpKg < 0.6) return false
  if (spanDays <= 3 && jumpKg >= 0.7) return true
  if ((phase === 'luteal' || phase === 'menstrual') && jumpKg >= 0.5) return true
  return false
}

/**
 * Motivational progress copy from morning weigh-ins.
 * Reacts to day-to-day jumps (edema / travel) without treating them as fat gain.
 */
export function buildProgressMotivator(input: {
  weights: WeightEntry[]
  periodStarts?: PeriodStart[]
  cycleLengthDays?: number
  periodLengthDays?: number
  targetKg?: number | null
  today?: string
}): ProgressMotivator | null {
  const today = input.today ?? todayIso()
  const sorted = sortedWeights(input.weights)
  if (sorted.length === 0) return null

  const latest = sorted[sorted.length - 1]!
  const start = sorted[0]!
  const prev = sorted.length >= 2 ? sorted[sorted.length - 2]! : null
  const totalDelta = round1(latest.kg - start.kg)
  const lostTotal = round1(start.kg - latest.kg)

  const cycle = getCycleInfo(
    input.periodStarts ?? [],
    today,
    input.cycleLengthDays,
    input.periodLengthDays,
  )

  if (!prev) {
    return {
      text: 'Точка отсчёта зафиксирована — дальше смотрим на тренд, не на один день.',
      deltaLabel: null,
      tone: 'soft',
    }
  }

  const dayDelta = round1(latest.kg - prev.kg)
  const spanDays = Math.max(1, daysBetween(prev.date, latest.date))
  const dailyish = dayDelta / spanDays

  const deltaLabel =
    dayDelta === 0
      ? 'с прошлого раза без изменений'
      : dayDelta > 0
        ? `с прошлого раза +${fmtKg(dayDelta)} кг`
        : `с прошлого раза −${fmtKg(dayDelta)} кг`

  const nearTarget =
    input.targetKg != null &&
    Number.isFinite(input.targetKg) &&
    Math.abs(latest.kg - input.targetKg) < 0.2

  if (nearTarget) {
    return {
      text: 'Вы у цели — держите мягкий режим и не гонитесь за минусом каждый день.',
      deltaLabel,
      tone: 'down',
    }
  }

  // Sharp upward jump → edema / salt / travel / hormones
  if (waterRetentionLikely(cycle.phase, dayDelta, spanDays) || dailyish >= 0.45) {
    const why =
      cycle.phase === 'luteal' || cycle.phase === 'menstrual'
        ? 'часто вода и гормоны'
        : 'часто вода, соль, перелёт или недосып'
    return {
      text: `Весы подскочили — это не жир за сутки. Скорее ${why}. Тренд важнее одного утра.`,
      deltaLabel,
      tone: 'soft',
    }
  }

  // Nice drop
  if (dayDelta <= -0.3) {
    const overall =
      lostTotal >= 1
        ? ` Всего уже −${fmtKg(lostTotal)} кг со старта — вы реально двигаетесь.`
        : ''
    return {
      text: `Минус на весах — приятно. Держите привычный ритм, без жёсткости.${overall}`,
      deltaLabel,
      tone: 'down',
    }
  }

  // Flat day
  if (Math.abs(dayDelta) < 0.15) {
    if (lostTotal >= 0.5) {
      return {
        text: `Плато на день — нормально. Со старта уже −${fmtKg(lostTotal)} кг: прогресс никуда не делся.`,
        deltaLabel,
        tone: 'flat',
      }
    }
    return {
      text: 'Вес стоит — иногда так и бывает. Важны неделя и самочувствие, не каждое утро.',
      deltaLabel,
      tone: 'flat',
    }
  }

  // Mild gain, not edema-sized
  if (dayDelta > 0) {
    if (lostTotal > 0.3) {
      return {
        text: `Сегодня чуть выше, но общий путь −${fmtKg(lostTotal)} кг. Одно утро не отменяет результат.`,
        deltaLabel,
        tone: 'soft',
      }
    }
    if (totalDelta > 0 && totalDelta < 1.5) {
      return {
        text: 'Небольшой плюс — бывает после дороги, соли или цикла. Завтра снова точка на графике.',
        deltaLabel,
        tone: 'soft',
      }
    }
    return {
      text: 'Вес выше прошлого раза. Спокойно: смотрим на несколько точек, а не на одно взвешивание.',
      deltaLabel,
      tone: 'up',
    }
  }

  // Small loss
  if (lostTotal >= 1) {
    return {
      text: `Ещё чуть вниз. Со старта −${fmtKg(lostTotal)} кг — это уже история, а не случайность.`,
      deltaLabel,
      tone: 'down',
    }
  }

  return {
    text: 'Маленький минус тоже считается. Продолжайте в том же духе.',
    deltaLabel,
    tone: 'down',
  }
}
