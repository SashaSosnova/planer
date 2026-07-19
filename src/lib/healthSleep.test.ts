import { describe, expect, it } from 'vitest'
import { toIsoDate } from './date'
import { mapSleepSamplesToDailyHours, minutesFromSleepSample } from './healthSleep'
import type { HealthSample } from '@capgo/capacitor-health'

function sample(partial: Partial<HealthSample> & Pick<HealthSample, 'startDate' | 'endDate'>): HealthSample {
  return {
    dataType: 'sleep',
    value: 0,
    unit: 'minute',
    ...partial,
  }
}

describe('minutesFromSleepSample', () => {
  it('sums asleep stages when present', () => {
    const mins = minutesFromSleepSample(
      sample({
        startDate: '2026-07-18T23:00:00.000Z',
        endDate: '2026-07-19T07:00:00.000Z',
        value: 999,
        hasStageData: true,
        stages: [
          {
            startDate: '2026-07-18T23:00:00.000Z',
            endDate: '2026-07-19T01:00:00.000Z',
            stage: 'light',
            durationMinutes: 120,
          },
          {
            startDate: '2026-07-19T01:00:00.000Z',
            endDate: '2026-07-19T01:20:00.000Z',
            stage: 'awake',
            durationMinutes: 20,
          },
          {
            startDate: '2026-07-19T01:20:00.000Z',
            endDate: '2026-07-19T07:00:00.000Z',
            stage: 'deep',
            durationMinutes: 340,
          },
        ],
      }),
    )
    expect(mins).toBe(460)
  })

  it('ignores awake / inBed samples', () => {
    expect(
      minutesFromSleepSample(
        sample({
          startDate: '2026-07-19T01:00:00.000Z',
          endDate: '2026-07-19T01:15:00.000Z',
          value: 15,
          sleepState: 'awake',
        }),
      ),
    ).toBe(0)
  })
})

describe('mapSleepSamplesToDailyHours', () => {
  it('attributes sleep to local wake-up day', () => {
    const wake = new Date(2026, 6, 19, 7, 30, 0)
    const start = new Date(2026, 6, 18, 23, 0, 0)
    const days = mapSleepSamplesToDailyHours([
      {
        startDate: start.toISOString(),
        endDate: wake.toISOString(),
        value: 450,
        sleepState: 'asleep',
      },
    ])
    expect(days).toEqual([{ date: toIsoDate(wake), hours: 7.5 }])
  })
})
