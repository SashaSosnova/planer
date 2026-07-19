import type { PeriodStart } from '../types'
import { addDaysIso } from './date'

export type CyclePhase = 'menstrual' | 'follicular' | 'ovulation' | 'luteal' | 'unknown'

export type CycleInfo = {
  phase: CyclePhase
  /** 1-based day in current cycle, if known */
  dayInCycle: number | null
  daysUntilPeriod: number | null
  lastPeriodStart: string | null
  /** Soft note about water weight in this phase */
  weightNote: string | null
}

export const DEFAULT_CYCLE_LENGTH = 28
export const DEFAULT_PERIOD_LENGTH = 5

const PHASE_LABELS: Record<CyclePhase, string> = {
  menstrual: 'месячные',
  follicular: 'фолликулярная',
  ovulation: 'овуляция',
  luteal: 'лютеиновая',
  unknown: 'неизвестно',
}

export function cyclePhaseLabel(phase: CyclePhase): string {
  return PHASE_LABELS[phase]
}

function parseIso(iso: string): Date | null {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

function daysBetween(fromIso: string, toIso: string): number | null {
  const a = parseIso(fromIso)
  const b = parseIso(toIso)
  if (!a || !b) return null
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

export function latestPeriodStart(starts: PeriodStart[]): PeriodStart | undefined {
  return [...starts].sort((a, b) => b.date.localeCompare(a.date))[0]
}

export function clampCycleLength(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_CYCLE_LENGTH
  return Math.min(45, Math.max(21, Math.round(n)))
}

export function clampPeriodLength(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_PERIOD_LENGTH
  return Math.min(10, Math.max(2, Math.round(n)))
}

/**
 * Estimate cycle phase from last period start.
 * Ovulation window ≈ cycleLength − 14 ± 1 day.
 */
export function getCycleInfo(
  periodStarts: PeriodStart[],
  todayIso: string,
  cycleLengthDays = DEFAULT_CYCLE_LENGTH,
  periodLengthDays = DEFAULT_PERIOD_LENGTH,
): CycleInfo {
  const cycleLen = clampCycleLength(cycleLengthDays)
  const periodLen = clampPeriodLength(periodLengthDays)
  const last = latestPeriodStart(periodStarts)
  if (!last) {
    return {
      phase: 'unknown',
      dayInCycle: null,
      daysUntilPeriod: null,
      lastPeriodStart: null,
      weightNote: null,
    }
  }

  const elapsed = daysBetween(last.date, todayIso)
  if (elapsed == null || elapsed < 0) {
    return {
      phase: 'unknown',
      dayInCycle: null,
      daysUntilPeriod: null,
      lastPeriodStart: last.date,
      weightNote: null,
    }
  }

  const dayInCycle = (elapsed % cycleLen) + 1
  const daysUntilPeriod = dayInCycle === 1 ? 0 : cycleLen - dayInCycle + 1
  const ovulationDay = Math.max(periodLen + 1, cycleLen - 14)

  let phase: CyclePhase
  if (dayInCycle <= periodLen) phase = 'menstrual'
  else if (dayInCycle >= ovulationDay - 1 && dayInCycle <= ovulationDay + 1) phase = 'ovulation'
  else if (dayInCycle < ovulationDay - 1) phase = 'follicular'
  else phase = 'luteal'

  let weightNote: string | null = null
  if (phase === 'luteal') {
    weightNote = 'В лютеиновой фазе вес часто +0,5–1,5 кг из‑за воды — это нормально.'
  } else if (phase === 'menstrual') {
    weightNote = 'В дни месячных вес тоже может подскакивать — смотрите на тренд, не на один день.'
  }

  return {
    phase,
    dayInCycle,
    daysUntilPeriod: daysUntilPeriod === 0 ? 0 : daysUntilPeriod,
    lastPeriodStart: last.date,
    weightNote,
  }
}

export { addDaysIso }
