import { useCallback, useMemo, useState } from 'react'
import { calcDailyKcalGoal, calcMaintainKcalGoal, type BodyProfile } from '../lib/calorieGoal'
import { calcProteinGoal } from '../lib/macroGoals'
import {
  loadSettings,
  refreshGoalFromWeight,
  saveBodyProfile,
  type AppSettings,
} from '../lib/settings'

export function useSettings(latestWeightKg?: number) {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings())

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

  const saveProfile = useCallback((profile: BodyProfile, weightKg: number) => {
    const next = saveBodyProfile(profile, weightKg)
    setSettings(next)
    return next
  }, [])

  const syncGoalFromWeight = useCallback((weightKg: number) => {
    const next = refreshGoalFromWeight(weightKg)
    setSettings(next)
    return next
  }, [])

  return {
    settings,
    dailyKcalGoal,
    maintainKcalGoal,
    proteinGoal,
    profileReady,
    saveProfile,
    syncGoalFromWeight,
  }
}
