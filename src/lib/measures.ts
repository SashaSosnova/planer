import type { MeasurementEntry } from '../types'
import { round1 } from './nutrition'

export const MEASURE_FIELDS = [
  { key: 'chest', label: 'Грудь', down: 'уменьшилась', up: 'увеличилась' },
  { key: 'waist', label: 'Талия', down: 'уменьшилась', up: 'увеличилась' },
  { key: 'belly', label: 'Живот', down: 'уменьшился', up: 'увеличился' },
  { key: 'hips', label: 'Бёдра', down: 'уменьшились', up: 'увеличились' },
  { key: 'thigh', label: 'Бедро', down: 'уменьшилось', up: 'увеличилось' },
  { key: 'bicep', label: 'Бицепс', down: 'уменьшился', up: 'увеличился' },
] as const

export type MeasureKey = (typeof MEASURE_FIELDS)[number]['key']

export const MEASURE_COLORS: Record<MeasureKey, string> = {
  chest: '#7d5f9c',
  waist: '#e6d59a',
  belly: '#c9a03a',
  hips: '#5e8a48',
  thigh: '#71687a',
  bicep: '#9a7db0',
}

export function measureFilled(m: MeasurementEntry | undefined): boolean {
  if (!m) return false
  return MEASURE_FIELDS.some(({ key }) => m[key] != null)
}

export function formatMeasure(m: MeasurementEntry): string {
  return MEASURE_FIELDS.filter(({ key }) => m[key] != null)
    .map(({ key, label }) => `${label.toLowerCase()} ${m[key]}`)
    .join(' · ')
}

export type MeasureChange = {
  key: MeasureKey
  label: string
  /** Last − first, cm. Negative = smaller. */
  deltaCm: number
  text: string
}

function formatCm(n: number): string {
  const v = round1(Math.abs(n))
  const s = Number.isInteger(v) ? String(v) : String(v).replace('.', ',')
  return `${s} см`
}

/**
 * Change of each measure from its first logged value to the latest.
 * Skips fields with only one reading or no real change.
 */
export function measureChangesFromFirst(entries: MeasurementEntry[]): MeasureChange[] {
  const sorted = [...entries].sort(
    (a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt,
  )
  const out: MeasureChange[] = []
  for (const field of MEASURE_FIELDS) {
    const values = sorted
      .map((m) => m[field.key])
      .filter((v): v is number => v != null && Number.isFinite(v) && v > 0)
    if (values.length < 2) continue
    const first = values[0]!
    const last = values[values.length - 1]!
    const deltaCm = round1(last - first)
    if (Math.abs(deltaCm) < 0.05) continue
    const verb = deltaCm < 0 ? field.down : field.up
    out.push({
      key: field.key,
      label: field.label,
      deltaCm,
      text: `${field.label} ${verb} на ${formatCm(deltaCm)}`,
    })
  }
  return out
}
