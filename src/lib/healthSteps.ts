import { Capacitor } from '@capacitor/core'
import { Health } from '@capgo/capacitor-health'
import { toIsoDate } from './date'

export type DailySteps = {
  date: string
  count: number
}

export type HealthStepsAvailability =
  | { ok: true }
  | { ok: false; reason: string; canOpenSettings?: boolean }

export type SyncStepsResult = {
  updated: number
  todayCount?: number
}

/** Health Connect exists only in the Android Capacitor shell. */
export function isHealthStepsSupported(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

export async function checkHealthStepsAvailable(): Promise<HealthStepsAvailability> {
  if (!isHealthStepsSupported()) {
    return {
      ok: false,
      reason: 'Импорт шагов доступен только в Android-приложении.',
    }
  }

  try {
    const availability = await Health.isAvailable()
    if (!availability.available) {
      const detail = (availability.reason ?? '').toLowerCase()
      if (detail.includes('install') || detail.includes('not_installed')) {
        return {
          ok: false,
          reason:
            'Установите Health Connect и включите синхронизацию шагов из Samsung Health.',
          canOpenSettings: true,
        }
      }
      return {
        ok: false,
        reason: 'Health Connect недоступен на этом устройстве (нужен Android 8+).',
        canOpenSettings: true,
      }
    }
    return { ok: true }
  } catch {
    return {
      ok: false,
      reason: 'Не удалось проверить Health Connect.',
      canOpenSettings: true,
    }
  }
}

export async function hasStepsPermission(): Promise<boolean> {
  if (!isHealthStepsSupported()) return false
  try {
    const availability = await Health.isAvailable()
    if (!availability.available) return false
    const status = await Health.checkAuthorization({ read: ['steps'], write: [] })
    return status.readAuthorized.includes('steps')
  } catch {
    return false
  }
}

export async function ensureStepsPermission(): Promise<void> {
  const status = await Health.requestAuthorization({
    read: ['steps'],
    write: [],
    requestHistoryAccess: true,
  })
  if (!status.readAuthorized.includes('steps')) {
    throw new Error('Нет доступа к шагам. Разрешите чтение шагов в Health Connect.')
  }
}

export function localDayRange(daysBack: number): { start: Date; end: Date } {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysBack)
  // Exclusive end = start of tomorrow (local)
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  return { start, end }
}

/** Map Health Connect day buckets to local YYYY-MM-DD totals. */
export function mapAggregatedToDailySteps(
  samples: Array<{ startDate: string; value: number }>,
): DailySteps[] {
  const byDate = new Map<string, number>()
  for (const sample of samples) {
    if (!Number.isFinite(sample.value) || sample.value <= 0) continue
    const date = toIsoDate(new Date(sample.startDate))
    byDate.set(date, Math.round(sample.value))
  }
  return [...byDate.entries()]
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

export async function fetchDailySteps(daysBack = 30): Promise<DailySteps[]> {
  const available = await checkHealthStepsAvailable()
  if (!available.ok) throw new Error(available.reason)

  await ensureStepsPermission()

  const { start, end } = localDayRange(daysBack)
  const { samples } = await Health.queryAggregated({
    dataType: 'steps',
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    bucket: 'day',
    aggregation: 'sum',
  })

  return mapAggregatedToDailySteps(samples)
}

/**
 * Import daily step totals from Health Connect (Samsung Watch → Samsung Health → HC).
 * By default overwrites local values for each day that has data.
 */
export async function syncStepsFromHealth(
  saveSteps: (date: string, count: number) => Promise<unknown>,
  options?: {
    daysBack?: number
    /** Skip days where local count is already higher (used for quiet auto-refresh). */
    onlyIfHigherOrMissing?: boolean
    existingByDate?: Map<string, number>
  },
): Promise<SyncStepsResult> {
  const days = await fetchDailySteps(options?.daysBack ?? 30)
  const today = toIsoDate(new Date())
  let updated = 0
  let todayCount: number | undefined

  for (const day of days) {
    const existing = options?.existingByDate?.get(day.date)
    if (
      options?.onlyIfHigherOrMissing &&
      existing != null &&
      existing >= day.count
    ) {
      if (day.date === today) todayCount = existing
      continue
    }
    await saveSteps(day.date, day.count)
    updated += 1
    if (day.date === today) todayCount = day.count
  }

  return { updated, todayCount }
}

export async function openHealthConnectSettings(): Promise<void> {
  if (!isHealthStepsSupported()) return
  await Health.openHealthConnectSettings()
}
