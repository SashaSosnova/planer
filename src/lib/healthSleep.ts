import { Health, type HealthSample, type SleepState } from '@capgo/capacitor-health'
import { toIsoDate } from './date'
import {
  checkHealthStepsAvailable,
  isHealthStepsSupported,
  localDayRange,
  type HealthStepsAvailability,
} from './healthSteps'

export type DailySleep = {
  date: string
  /** Hours, half-hour precision */
  hours: number
}

export type SyncSleepResult = {
  updated: number
  todayHours?: number
}

const ASLEEP: ReadonlySet<SleepState> = new Set(['asleep', 'rem', 'deep', 'light'])

/** Same Android / Health Connect shell as steps. */
export function isHealthSleepSupported(): boolean {
  return isHealthStepsSupported()
}

export async function checkHealthSleepAvailable(): Promise<HealthStepsAvailability> {
  const base = await checkHealthStepsAvailable()
  if (!base.ok) {
    if (base.reason.includes('шагов')) {
      return {
        ...base,
        reason:
          'Установите Health Connect и включите синхронизацию сна из Samsung Health.',
      }
    }
    return base
  }
  return base
}

export async function hasSleepPermission(): Promise<boolean> {
  if (!isHealthSleepSupported()) return false
  try {
    const availability = await Health.isAvailable()
    if (!availability.available) return false
    const status = await Health.checkAuthorization({ read: ['sleep'], write: [] })
    return status.readAuthorized.includes('sleep')
  } catch {
    return false
  }
}

export async function ensureSleepPermission(): Promise<void> {
  const status = await Health.requestAuthorization({
    read: ['sleep'],
    write: [],
    requestHistoryAccess: true,
  })
  if (!status.readAuthorized.includes('sleep')) {
    throw new Error('Нет доступа ко сну. Разрешите чтение сна в Health Connect.')
  }
}

/** Minutes of actual sleep from one Health Connect / HealthKit sample. */
export function minutesFromSleepSample(sample: HealthSample): number {
  if (sample.hasStageData && sample.stages && sample.stages.length > 0) {
    return sample.stages
      .filter((s) => ASLEEP.has(s.stage))
      .reduce((sum, s) => sum + (Number.isFinite(s.durationMinutes) ? s.durationMinutes : 0), 0)
  }
  if (sample.sleepState === 'awake' || sample.sleepState === 'inBed') return 0
  if (sample.sleepState && !ASLEEP.has(sample.sleepState)) return 0
  const v = sample.value
  if (!Number.isFinite(v) || v <= 0) return 0
  return v
}

/**
 * Attribute sleep to the wake-up calendar day (end of session).
 * Matches check-in: «сон прошлой ночью» for today.
 */
export function mapSleepSamplesToDailyHours(
  samples: Array<Pick<HealthSample, 'value' | 'startDate' | 'endDate' | 'sleepState' | 'stages' | 'hasStageData'>>,
): DailySleep[] {
  const minutesByDate = new Map<string, number>()
  for (const sample of samples) {
    const mins = minutesFromSleepSample(sample as HealthSample)
    if (mins <= 0) continue
    const end = sample.endDate ? new Date(sample.endDate) : new Date(sample.startDate)
    if (Number.isNaN(end.getTime())) continue
    const date = toIsoDate(end)
    minutesByDate.set(date, (minutesByDate.get(date) ?? 0) + mins)
  }

  return [...minutesByDate.entries()]
    .map(([date, minutes]) => {
      const hours = Math.round((minutes / 60) * 2) / 2
      return { date, hours: Math.min(16, Math.max(0, hours)) }
    })
    .filter((d) => d.hours > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
}

export async function fetchDailySleep(daysBack = 14): Promise<DailySleep[]> {
  const available = await checkHealthSleepAvailable()
  if (!available.ok) throw new Error(available.reason)

  await ensureSleepPermission()

  const { start, end } = localDayRange(daysBack)
  const { samples } = await Health.readSamples({
    dataType: 'sleep',
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    limit: 1000,
    ascending: true,
  })

  return mapSleepSamplesToDailyHours(samples)
}

/**
 * Import nightly sleep from Health Connect (Samsung Watch → Samsung Health → HC).
 */
export async function syncSleepFromHealth(
  saveSleep: (date: string, hours: number) => Promise<unknown>,
  options?: {
    daysBack?: number
    /** Skip days that already have a local sleep value (quiet auto-refresh). */
    onlyIfMissing?: boolean
    existingByDate?: Map<string, number>
  },
): Promise<SyncSleepResult> {
  const days = await fetchDailySleep(options?.daysBack ?? 14)
  const today = toIsoDate(new Date())
  let updated = 0
  let todayHours: number | undefined

  for (const day of days) {
    const existing = options?.existingByDate?.get(day.date)
    if (options?.onlyIfMissing && existing != null && existing > 0) {
      if (day.date === today) todayHours = existing
      continue
    }
    await saveSleep(day.date, day.hours)
    updated += 1
    if (day.date === today) todayHours = day.hours
  }

  return { updated, todayHours }
}
