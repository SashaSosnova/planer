import type { AppData, WeightEntry } from '../types'
import { addDaysIso, todayIso } from './date'
import { round1 } from './nutrition'
import {
  estimateNextMorning,
  forecastFromAppData,
  type NextMorningEstimate,
  type WeightForecast,
} from './weightForecast'

export type WeightProgress = {
  hero: string
  tone: 'up' | 'down' | 'flat'
  note: string
  morning: NextMorningEstimate | null
  forecast: WeightForecast | null
}

function formatSignedDelta(delta: number, approx = false): string {
  const abs = Math.abs(delta).toFixed(1).replace('.', ',')
  const core =
    Math.abs(delta) < 0.05 ? '0 кг' : delta > 0 ? `+${abs} кг` : `−${abs} кг`
  return approx ? `≈ ${core}` : core
}

function toneFromDelta(delta: number | null | undefined): 'up' | 'down' | 'flat' {
  if (delta == null || Math.abs(delta) < 0.05) return 'flat'
  return delta > 0 ? 'up' : 'down'
}

/** One-day fat change is often &lt; 0.05 kg — keep the kcal gap visible anyway. */
function morningKcalNote(morning: NextMorningEstimate): string {
  const gap = morning.yesterdayKcal - morning.maintainKcal
  const gapLabel =
    gap === 0 ? 'как поддержка' : gap > 0 ? `+${gap} к поддержке` : `${gap} к поддержке`
  return `Вчера ${morning.yesterdayKcal} ккал (${gapLabel})`
}

function sortedWeights(weights: WeightEntry[], today: string): WeightEntry[] {
  return [...weights]
    .filter((w) => w.date <= today && w.kg >= 30 && w.kg <= 400)
    .sort((a, b) => {
      const byDate = a.date.localeCompare(b.date)
      if (byDate !== 0) return byDate
      return a.createdAt - b.createdAt
    })
}

/** Latest weigh-in on/before today minus yesterday's (or previous) weigh-in. */
export function deltaVsYesterdayWeight(
  weights: WeightEntry[],
  today: string,
): number | null {
  const sorted = sortedWeights(weights, today)
  if (sorted.length < 2) return null

  const yesterday = addDaysIso(today, -1)
  const yesterdayEntry =
    [...sorted].reverse().find((w) => w.date === yesterday) ?? null
  const current =
    [...sorted].reverse().find((w) => w.date === today) ??
    sorted[sorted.length - 1]!

  const baseline =
    yesterdayEntry ??
    [...sorted].reverse().find((w) => w.date < current.date) ??
    null
  if (!baseline || baseline.date === current.date) return null

  return round1(current.kg - baseline.kg)
}

/**
 * Forward-looking progress note (kcal + weekly tempo); hero = scale delta
 * vs yesterday's weight (not absolute kg that duplicates the note).
 */
export function buildWeightProgress(input: {
  data: AppData
  today?: string
  maintainKcal?: number | null
  dailyKcalGoal?: number | null
  targetKg?: number | null
  cycleLengthDays?: number
  periodLengthDays?: number
}): WeightProgress | null {
  const today = input.today ?? todayIso()
  const maintain =
    input.maintainKcal != null && input.maintainKcal > 0
      ? Math.round(input.maintainKcal)
      : null

  const morning =
    maintain != null
      ? estimateNextMorning({
          weights: input.data.weights,
          meals: input.data.meals,
          maintainKcal: maintain,
          today,
        })
      : null

  const forecast = forecastFromAppData(input.data, {
    today,
    maintainKcal: maintain,
    dailyKcalGoal:
      input.dailyKcalGoal != null && input.dailyKcalGoal > 0
        ? Math.round(input.dailyKcalGoal)
        : null,
    targetKg:
      input.targetKg != null && input.targetKg > 0 ? input.targetKg : null,
    cycleLengthDays: input.cycleLengthDays,
    periodLengthDays: input.periodLengthDays,
  })

  if (!morning && !forecast) return null

  const scaleDelta = deltaVsYesterdayWeight(input.data.weights, today)
  const weekRate = forecast?.weeklyRateKg ?? forecast?.onPlanRateKg ?? null
  const heroDelta = scaleDelta ?? morning?.expectedDeltaKg ?? weekRate
  if (heroDelta == null && !forecast) return null

  const noteParts: string[] = []
  if (morning) noteParts.push(morningKcalNote(morning))
  if (forecast?.summary) noteParts.push(forecast.summary)
  const note = noteParts.join(' · ') || forecast!.summary

  return {
    // Exact for scale delta; ≈ only for kcal/tempo estimates.
    hero: formatSignedDelta(heroDelta ?? 0, scaleDelta == null),
    tone: toneFromDelta(heroDelta),
    note,
    morning,
    forecast,
  }
}
