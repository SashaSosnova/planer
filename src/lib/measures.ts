import type { MeasurementEntry } from '../types'

export const MEASURE_FIELDS = [
  { key: 'chest', label: 'Грудь' },
  { key: 'waist', label: 'Талия' },
  { key: 'belly', label: 'Живот' },
  { key: 'hips', label: 'Бёдра' },
  { key: 'thigh', label: 'Бедро' },
  { key: 'bicep', label: 'Бицепс' },
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
