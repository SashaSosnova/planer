import { describe, expect, it } from 'vitest'
import type { MeasurementEntry } from '../types'
import { measureChangesFromFirst } from './measures'

function row(
  date: string,
  fields: Partial<Pick<MeasurementEntry, 'chest' | 'waist' | 'belly' | 'hips' | 'thigh' | 'bicep'>>,
  createdAt = 1,
): MeasurementEntry {
  return { id: date, date, createdAt, ...fields }
}

describe('measureChangesFromFirst', () => {
  it('compares each field to its first reading, not the latest minus previous', () => {
    const changes = measureChangesFromFirst([
      row('2026-06-01', { waist: 70, belly: 80 }),
      row('2026-07-01', { waist: 69, belly: 79 }),
      row('2026-08-01', { waist: 68, belly: 77 }),
    ])
    expect(changes.map((c) => c.text)).toEqual([
      'Талия уменьшилась на 2 см',
      'Живот уменьшился на 3 см',
    ])
  })

  it('uses the first time a field appears if it was added later', () => {
    const changes = measureChangesFromFirst([
      row('2026-06-01', { waist: 70 }),
      row('2026-07-01', { waist: 69, hips: 98 }),
      row('2026-08-01', { waist: 68, hips: 96 }),
    ])
    expect(changes.find((c) => c.key === 'hips')?.text).toBe('Бёдра уменьшились на 2 см')
    expect(changes.find((c) => c.key === 'waist')?.text).toBe('Талия уменьшилась на 2 см')
  })

  it('skips a field with only one reading or no real change', () => {
    const changes = measureChangesFromFirst([
      row('2026-06-01', { waist: 70, bicep: 28 }),
      row('2026-08-01', { waist: 70, bicep: 28.04 }),
    ])
    expect(changes).toEqual([])
  })

  it('says when a measure went up, and uses comma decimals', () => {
    const changes = measureChangesFromFirst([
      row('2026-06-01', { thigh: 54, chest: 88 }),
      row('2026-08-01', { thigh: 54.5, chest: 86 }),
    ])
    expect(changes.map((c) => c.text)).toEqual([
      'Грудь уменьшилась на 2 см',
      'Бедро увеличилось на 0,5 см',
    ])
  })

  it('sorts by date, not array order', () => {
    const changes = measureChangesFromFirst([
      row('2026-08-20', { waist: 66 }),
      row('2026-06-01', { waist: 70 }),
    ])
    expect(changes[0]?.deltaCm).toBe(-4)
  })
})
