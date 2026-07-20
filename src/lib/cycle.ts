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

/** Short practical tip for Today — no phase name, starts with «Обычно…». */
export function cyclePhaseTip(phase: CyclePhase): string | null {
  switch (phase) {
    case 'menstrual':
      return 'Обычно энергия ниже; вес может подскакивать — смотрите на тренд.'
    case 'follicular':
      return 'Обычно легче держать план и больше двигаться.'
    case 'ovulation':
      return 'Обычно больше энергии; голод чаще ровный.'
    case 'luteal':
      return 'Обычно аппетит выше, вес +0,5–1,5 кг из‑за воды — это нормально.'
    default:
      return null
  }
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

/** Most recent period start on or before `dateIso`. */
export function applicablePeriodStart(
  starts: PeriodStart[],
  dateIso: string,
): PeriodStart | undefined {
  return [...starts]
    .filter((s) => s.date <= dateIso)
    .sort((a, b) => b.date.localeCompare(a.date))[0]
}

export function clampCycleLength(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_CYCLE_LENGTH
  return Math.min(45, Math.max(21, Math.round(n)))
}

export function clampPeriodLength(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_PERIOD_LENGTH
  return Math.min(10, Math.max(2, Math.round(n)))
}

/** Mean gap between consecutive period starts (needs ≥2 starts). */
export function averageCycleLength(starts: PeriodStart[]): number | null {
  const sorted = [...starts].sort((a, b) => a.date.localeCompare(b.date))
  if (sorted.length < 2) return null
  const gaps: number[] = []
  for (let i = 1; i < sorted.length; i++) {
    const gap = daysBetween(sorted[i - 1]!.date, sorted[i]!.date)
    if (gap != null && gap >= 18 && gap <= 45) gaps.push(gap)
  }
  if (!gaps.length) return null
  return clampCycleLength(gaps.reduce((s, g) => s + g, 0) / gaps.length)
}

function phaseForDay(dayInCycle: number, cycleLen: number, periodLen: number): CyclePhase {
  const ovulationDay = Math.max(periodLen + 1, cycleLen - 14)
  if (dayInCycle <= periodLen) return 'menstrual'
  if (dayInCycle >= ovulationDay - 1 && dayInCycle <= ovulationDay + 1) return 'ovulation'
  if (dayInCycle < ovulationDay - 1) return 'follicular'
  return 'luteal'
}

/**
 * Estimate cycle phase from period starts on/before the given day.
 * Uses the applicable start (not modulo from the latest only).
 */
export function getCycleInfo(
  periodStarts: PeriodStart[],
  todayIso: string,
  cycleLengthDays = DEFAULT_CYCLE_LENGTH,
  periodLengthDays = DEFAULT_PERIOD_LENGTH,
): CycleInfo {
  const cycleLen = clampCycleLength(cycleLengthDays)
  const periodLen = clampPeriodLength(periodLengthDays)
  const start = applicablePeriodStart(periodStarts, todayIso)
  if (!start) {
    return {
      phase: 'unknown',
      dayInCycle: null,
      daysUntilPeriod: null,
      lastPeriodStart: latestPeriodStart(periodStarts)?.date ?? null,
      weightNote: null,
    }
  }

  const elapsed = daysBetween(start.date, todayIso)
  if (elapsed == null || elapsed < 0) {
    return {
      phase: 'unknown',
      dayInCycle: null,
      daysUntilPeriod: null,
      lastPeriodStart: start.date,
      weightNote: null,
    }
  }

  const dayInCycle = elapsed + 1
  const daysUntilPeriod =
    dayInCycle <= 1 ? 0 : dayInCycle > cycleLen ? 0 : cycleLen - dayInCycle + 1
  const phaseDay = Math.min(dayInCycle, cycleLen)
  const phase = phaseForDay(phaseDay, cycleLen, periodLen)

  let weightNote: string | null = null
  if (phase === 'luteal') {
    weightNote = 'В лютеиновой фазе вес часто +0,5–1,5 кг из‑за воды — это нормально.'
  } else if (phase === 'menstrual') {
    weightNote = 'В дни месячных вес тоже может подскакивать — смотрите на тренд, не на один день.'
  }

  return {
    phase,
    dayInCycle,
    daysUntilPeriod,
    lastPeriodStart: start.date,
    weightNote,
  }
}

export { addDaysIso }
