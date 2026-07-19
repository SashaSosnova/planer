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
  chest: '#0f4c5c',
  waist: '#b85c38',
  belly: '#c4921a',
  hips: '#2f7d4c',
  thigh: '#5a7178',
  bicep: '#6b3fa0',
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
