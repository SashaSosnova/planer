import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  anchoredFormulaWeight,
  calcDailyKcalGoal,
  calcMaintainKcalGoal,
  calcOptimalWeightKg,
  type BodyProfile,
} from '../lib/calorieGoal'
import { calcProteinGoal, VEG_GOAL_G } from '../lib/macroGoals'
import { calcSweetBudgetKcal } from '../lib/sweets'
import {
  getSettingsOwnerUid,
  loadSettings,
  parseSettingsBlob,
  reconcileWeightFormulas,
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

  const formulaKg = useMemo(
    () => anchoredFormulaWeight(settings.formulaWeightKg, latestWeightKg),
    [settings.formulaWeightKg, latestWeightKg],
  )

  useEffect(() => {
    if (latestWeightKg == null || !(latestWeightKg > 0)) return
    const next = reconcileWeightFormulas(latestWeightKg)
    if (
      next.formulaWeightKg === settings.formulaWeightKg &&
      next.proteinGoalG === settings.proteinGoalG &&
      next.vegGoalG === settings.vegGoalG &&
      next.targetWeightKg === settings.targetWeightKg &&
      next.dailyKcalGoal === settings.dailyKcalGoal
    ) {
      return
    }
    commit(next)
  }, [
    latestWeightKg,
    settings.formulaWeightKg,
    settings.proteinGoalG,
    settings.vegGoalG,
    settings.targetWeightKg,
    settings.dailyKcalGoal,
    settings.profile,
    commit,
  ])

  const dailyKcalGoal = useMemo(() => {
    if (settings.profile && formulaKg != null && formulaKg > 0) {
      return calcDailyKcalGoal(settings.profile, formulaKg)
    }
    return settings.dailyKcalGoal
  }, [settings, formulaKg])

  const maintainKcalGoal = useMemo(() => {
    if (settings.profile && formulaKg != null && formulaKg > 0) {
      return calcMaintainKcalGoal(settings.profile, formulaKg)
    }
    return dailyKcalGoal
  }, [settings.profile, formulaKg, dailyKcalGoal])

  const proteinGoal = useMemo(() => {
    if (settings.proteinGoalG != null) return settings.proteinGoalG
    return formulaKg != null ? calcProteinGoal(formulaKg) : null
  }, [settings.proteinGoalG, formulaKg])

  const targetWeightKg = useMemo(() => {
    if (settings.targetWeightKg != null) return settings.targetWeightKg
    if (!settings.profile) return null
    return calcOptimalWeightKg(settings.profile.sex, settings.profile.heightCm)
  }, [settings.targetWeightKg, settings.profile])

  const vegGoalG = settings.vegGoalG ?? VEG_GOAL_G
  const sweetGoalKcal = settings.sweetGoalKcal ?? calcSweetBudgetKcal()

  const profileReady = Boolean(settings.profile)

  const saveProfile = useCallback(
    (profile: BodyProfile, weightKg: number) => commit(saveBodyProfile(profile, weightKg)),
    [commit],
  )

  const syncGoalFromWeight = useCallback(
    (weightKg: number) => {
      const next = refreshGoalFromWeight(weightKg)
      if (
        next.formulaWeightKg === settings.formulaWeightKg &&
        next.proteinGoalG === settings.proteinGoalG &&
        next.vegGoalG === settings.vegGoalG &&
        next.targetWeightKg === settings.targetWeightKg &&
        next.dailyKcalGoal === settings.dailyKcalGoal
      ) {
        return next
      }
      return commit(next)
    },
    [
      commit,
      settings.formulaWeightKg,
      settings.proteinGoalG,
      settings.vegGoalG,
      settings.targetWeightKg,
      settings.dailyKcalGoal,
    ],
  )

  const saveTargets = useCallback(
    (input: {
      targetWeightKg?: number | null
      proteinGoalG?: number | null
      vegGoalG?: number | null
      sweetGoalKcal?: number | null
    }) => {
      return commit(
        saveSettings({
          ...(input.targetWeightKg !== undefined
            ? { targetWeightKg: input.targetWeightKg }
            : {}),
          ...(input.proteinGoalG !== undefined ? { proteinGoalG: input.proteinGoalG } : {}),
          ...(input.vegGoalG !== undefined ? { vegGoalG: input.vegGoalG } : {}),
          ...(input.sweetGoalKcal !== undefined ? { sweetGoalKcal: input.sweetGoalKcal } : {}),
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
    vegGoalG,
    sweetGoalKcal,
    profileReady,
    targetWeightKg,
    saveProfile,
    syncGoalFromWeight,
    saveTargets,
  }
}
