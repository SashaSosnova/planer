import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppData } from './hooks/useAppData'
import { useSettings } from './hooks/useSettings'
import {
  hasStepsPermission,
  isHealthStepsSupported,
  syncStepsFromHealth,
} from './lib/healthSteps'
import { hasSleepPermission, syncSleepFromHealth } from './lib/healthSleep'
import { AchievementsScreen } from './screens/AchievementsScreen'
import { AddMealScreen } from './screens/AddMealScreen'
import { MealDetailScreen } from './screens/MealDetailScreen'
import { ProfileScreen } from './screens/ProfileScreen'
import { StepsHistoryScreen } from './screens/StepsHistoryScreen'
import { TodayScreen } from './screens/TodayScreen'
import { WeightHistoryScreen } from './screens/WeightHistoryScreen'
import { WellnessScreen } from './screens/WellnessScreen'
import './App.css'

type Overlay =
  | { type: 'add-meal' }
  | { type: 'edit-meal'; mealId: string }
  | { type: 'profile' }
  | { type: 'weight-history' }
  | { type: 'steps-history' }
  | { type: 'achievements' }
  | { type: 'wellness' }
  | null

export default function App() {
  const [overlay, setOverlay] = useState<Overlay>(null)
  const {
    data,
    ready,
    mode,
    cloudError,
    saveFood,
    deleteFood,
    saveMeal,
    deleteMeal,
    saveWeight,
    saveSteps,
    saveMeasurement,
    saveCheckIn,
    savePeriodStart,
    removePeriodStart,
  } = useAppData()

  const latestWeightKg = useMemo(() => {
    const sorted = [...data.weights].sort((a, b) => b.date.localeCompare(a.date))
    return sorted[0]?.kg
  }, [data.weights])

  const {
    dailyKcalGoal,
    maintainKcalGoal,
    proteinGoal,
    profileReady,
    targetWeightKg,
    cycleLengthDays,
    periodLengthDays,
    saveProfile,
    syncGoalFromWeight,
    saveTargets,
  } = useSettings(latestWeightKg)

  const saveStepsRef = useRef(saveSteps)
  saveStepsRef.current = saveSteps
  const stepsRef = useRef(data.steps)
  stepsRef.current = data.steps
  const saveCheckInRef = useRef(saveCheckIn)
  saveCheckInRef.current = saveCheckIn
  const checkInsRef = useRef(data.checkIns)
  checkInsRef.current = data.checkIns

  // Quiet refresh from Health Connect when permission was already granted.
  useEffect(() => {
    if (!ready || !isHealthStepsSupported()) return
    let cancelled = false
    void (async () => {
      if (!(await hasStepsPermission())) return
      if (cancelled) return
      try {
        await syncStepsFromHealth(saveStepsRef.current, {
          daysBack: 7,
          onlyIfHigherOrMissing: true,
          existingByDate: new Map(
            stepsRef.current.map((s) => [s.date, s.count] as const),
          ),
        })
      } catch {
        // Ignore background sync failures.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [ready])

  useEffect(() => {
    if (!ready || !isHealthStepsSupported()) return
    let cancelled = false
    void (async () => {
      if (!(await hasSleepPermission())) return
      if (cancelled) return
      try {
        await syncSleepFromHealth(
          async (date, hours) => {
            await saveCheckInRef.current({ date, sleepHours: hours })
          },
          {
            daysBack: 7,
            onlyIfMissing: true,
            existingByDate: new Map(
              checkInsRef.current
                .filter((c) => c.sleepHours != null)
                .map((c) => [c.date, c.sleepHours!] as const),
            ),
          },
        )
      } catch {
        // Ignore background sync failures.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [ready])

  const editMeal =
    overlay?.type === 'edit-meal'
      ? data.meals.find((m) => m.id === overlay.mealId)
      : undefined

  if (!ready) {
    return (
      <div className="app-shell">
        <main className="app-main no-nav">
          <p className="muted center">Загрузка…</p>
        </main>
      </div>
    )
  }

  const showOverlay = overlay != null
  const closeOverlay = () => setOverlay(null)

  return (
    <div className="app-shell">
      <main className="app-main no-nav">
        {mode === 'local' && !showOverlay && (
          <p className="banner">
            Локальный режим — данные на устройстве. Добавьте .env с Firebase для облака.
          </p>
        )}
        {cloudError && !showOverlay && <p className="banner error">{cloudError}</p>}

        <div className={showOverlay ? 'tab-panel hidden' : undefined} hidden={showOverlay}>
          <TodayScreen
            data={data}
            dailyKcalGoal={dailyKcalGoal}
            maintainKcalGoal={maintainKcalGoal}
            proteinGoal={proteinGoal}
            profileReady={profileReady}
            targetWeightKg={targetWeightKg}
            cycleLengthDays={cycleLengthDays}
            periodLengthDays={periodLengthDays}
            onAddMeal={() => setOverlay({ type: 'add-meal' })}
            onOpenMeal={(mealId) => setOverlay({ type: 'edit-meal', mealId })}
            onOpenProfile={() => setOverlay({ type: 'profile' })}
            onOpenWeightHistory={() => setOverlay({ type: 'weight-history' })}
            onOpenStepsHistory={() => setOverlay({ type: 'steps-history' })}
            onOpenAchievements={() => setOverlay({ type: 'achievements' })}
            onOpenWellness={() => setOverlay({ type: 'wellness' })}
            onSaveWeight={async (date, kg) => {
              const entry = await saveWeight(date, kg)
              syncGoalFromWeight(kg)
              return entry
            }}
            onSaveSteps={saveSteps}
          />
        </div>

        {overlay?.type === 'add-meal' && (
          <AddMealScreen
            data={data}
            onBack={closeOverlay}
            onSaveMeal={saveMeal}
            onSaveFood={saveFood}
            onDeleteFood={deleteFood}
          />
        )}

        {overlay?.type === 'edit-meal' && editMeal && (
          <MealDetailScreen
            data={data}
            meal={editMeal}
            onBack={closeOverlay}
            onSave={saveMeal}
            onDelete={deleteMeal}
            onSaveFood={saveFood}
          />
        )}

        {overlay?.type === 'edit-meal' && !editMeal && (
          <section className="screen">
            <p className="muted">Приём не найден.</p>
            <button type="button" className="link-btn" onClick={closeOverlay}>
              ← Назад
            </button>
          </section>
        )}

        {overlay?.type === 'profile' && (
          <ProfileScreen
            data={data}
            onBack={closeOverlay}
            onSaveProfile={saveProfile}
            onSaveTargets={saveTargets}
            onSaveMeasurement={saveMeasurement}
          />
        )}

        {overlay?.type === 'weight-history' && (
          <WeightHistoryScreen
            data={data}
            targetWeightKg={targetWeightKg}
            maintainKcalGoal={maintainKcalGoal}
            cycleLengthDays={cycleLengthDays}
            periodLengthDays={periodLengthDays}
            onBack={closeOverlay}
            onSave={async (date, kg) => {
              const entry = await saveWeight(date, kg)
              syncGoalFromWeight(kg)
              return entry
            }}
          />
        )}

        {overlay?.type === 'steps-history' && (
          <StepsHistoryScreen data={data} onBack={closeOverlay} onSave={saveSteps} />
        )}

        {overlay?.type === 'achievements' && (
          <AchievementsScreen
            data={data}
            targetWeightKg={targetWeightKg}
            onBack={closeOverlay}
          />
        )}

        {overlay?.type === 'wellness' && (
          <WellnessScreen
            data={data}
            cycleLengthDays={cycleLengthDays}
            periodLengthDays={periodLengthDays}
            onBack={closeOverlay}
            onSaveCheckIn={saveCheckIn}
            onSavePeriodStart={savePeriodStart}
            onRemovePeriodStart={removePeriodStart}
          />
        )}
      </main>
    </div>
  )
}
