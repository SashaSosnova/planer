import { useCallback, useMemo, useState } from 'react'
import { calcDailyKcalGoal, type BodyProfile } from '../lib/calorieGoal'
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
    profileReady,
    saveProfile,
    syncGoalFromWeight,
  }
}
