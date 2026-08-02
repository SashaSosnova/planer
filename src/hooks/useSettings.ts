import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { calcDailyKcalGoal, calcMaintainKcalGoal, type BodyProfile } from '../lib/calorieGoal'
import { calcProteinGoal } from '../lib/macroGoals'
import {
  getSettingsOwnerUid,
  loadSettings,
  parseSettingsBlob,
  refreshGoalFromWeight,
  replaceSettings,
  resetSettings,
  saveBodyProfile,
  saveSettings,
  setSettingsOwnerUid,
  type AppSettings,
} from '../lib/settings'
import { subscribeSettings, upsertSettings } from '../storage/cloudSync'

/**
 * Bind local settings to the current auth uid.
 * On uid switch: reset local defaults so we never seed another account's prefs.
 * First attach with no owner: claim existing local (migration / same device guest).
 */
function adoptSettingsForUid(uid: string): AppSettings {
  const owner = getSettingsOwnerUid()
  if (owner == null) {
    setSettingsOwnerUid(uid)
    return loadSettings()
  }
  if (owner === uid) return loadSettings()
  const next = resetSettings()
  setSettingsOwnerUid(uid)
  return next
}

export function useSettings(latestWeightKg?: number, uid?: string | null) {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings())
  const seededCloud = useRef(false)
  const uidRef = useRef(uid)

  const commit = useCallback(
    (next: AppSettings) => {
      setSettings(next)
      if (uid) {
        void upsertSettings(uid, next).catch(() => {
          // keep local; cloud may catch up later
        })
      }
      return next
    },
    [uid],
  )

  useLayoutEffect(() => {
    if (!uid) return
    if (uidRef.current === uid && getSettingsOwnerUid() === uid) return
    uidRef.current = uid
    seededCloud.current = false
    setSettings(adoptSettingsForUid(uid))
  }, [uid])

  useEffect(() => {
    seededCloud.current = false
    if (!uid) return
    return subscribeSettings(uid, {
      onSettings: (raw) => {
        if (raw == null) {
          if (!seededCloud.current && getSettingsOwnerUid() === uid) {
            seededCloud.current = true
            const local = loadSettings()
            void upsertSettings(uid, local)
          }
          return
        }
        seededCloud.current = true
        const parsed = parseSettingsBlob(raw)
        replaceSettings(parsed)
        setSettingsOwnerUid(uid)
        setSettings(parsed)
      },
    })
  }, [uid])

  const dailyKcalGoal = useMemo(() => {
    if (settings.profile && latestWeightKg != null && latestWeightKg > 0) {
      return calcDailyKcalGoal(settings.profile, latestWeightKg)
    }
    return settings.dailyKcalGoal
  }, [settings, latestWeightKg])

  const maintainKcalGoal = useMemo(() => {
    if (settings.profile && latestWeightKg != null && latestWeightKg > 0) {
      return calcMaintainKcalGoal(settings.profile, latestWeightKg)
    }
    return dailyKcalGoal
  }, [settings.profile, latestWeightKg, dailyKcalGoal])

  const proteinGoal = useMemo(
    () => (latestWeightKg != null ? calcProteinGoal(latestWeightKg) : null),
    [latestWeightKg],
  )

  const profileReady = Boolean(settings.profile)

  const saveProfile = useCallback(
    (profile: BodyProfile, weightKg: number) => commit(saveBodyProfile(profile, weightKg)),
    [commit],
  )

  const syncGoalFromWeight = useCallback(
    (weightKg: number) => commit(refreshGoalFromWeight(weightKg)),
    [commit],
  )

  const saveTargets = useCallback(
    (input: {
      targetWeightKg?: number | null
      cycleLengthDays?: number
      periodLengthDays?: number
    }) => {
      const savingCycle =
        input.cycleLengthDays != null || input.periodLengthDays != null
      return commit(
        saveSettings({
          ...(input.targetWeightKg !== undefined
            ? { targetWeightKg: input.targetWeightKg }
            : {}),
          ...(input.cycleLengthDays != null ? { cycleLengthDays: input.cycleLengthDays } : {}),
          ...(input.periodLengthDays != null
            ? { periodLengthDays: input.periodLengthDays }
            : {}),
          ...(savingCycle ? { cycleConfigured: true } : {}),
        }),
      )
    },
    [commit],
  )

  return {
    settings,
    dailyKcalGoal,
    maintainKcalGoal,
    proteinGoal,
    profileReady,
    targetWeightKg: settings.targetWeightKg,
    cycleLengthDays: settings.cycleLengthDays,
    periodLengthDays: settings.periodLengthDays,
    cycleConfigured: settings.cycleConfigured,
    saveProfile,
    syncGoalFromWeight,
    saveTargets,
  }
}
