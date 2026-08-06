import { App as CapApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAppData } from './hooks/useAppData'
import { useSettings } from './hooks/useSettings'
import { useSwipeBack } from './hooks/useSwipeBack'
import { buildTodayTimeline } from './lib/dayStats'
import {
  hasStepsPermission,
  isHealthStepsSupported,
  syncStepsFromHealth,
} from './lib/healthSteps'
import {
  getCachedWeekSummary,
  getWeekNutritionSummary,
} from './lib/weekSummaryLlm'
import { AddMealScreen } from './screens/AddMealScreen'
import { CareScreen } from './screens/CareScreen'
import { DiaryScreen } from './screens/DiaryScreen'
import { HistoryScreen } from './screens/HistoryScreen'
import { LibraryScreen } from './screens/LibraryScreen'
import { MealDetailScreen } from './screens/MealDetailScreen'
import { MeasuresScreen } from './screens/MeasuresScreen'
import { ProfileScreen } from './screens/ProfileScreen'
import { StepsHistoryScreen } from './screens/StepsHistoryScreen'
import { TodayScreen } from './screens/TodayScreen'
import { WeightHistoryScreen } from './screens/WeightHistoryScreen'
import type { MealType } from './types'
import './App.css'

type Overlay =
  | { type: 'add-meal'; prefillText?: string; mealType?: MealType; date?: string }
  | { type: 'edit-meal'; mealId: string }
  | { type: 'profile'; openCycleCal?: boolean }
  | { type: 'weight-history' }
  | { type: 'steps-history' }
  | { type: 'diary' }
  | { type: 'history' }
  | { type: 'measures' }
  | { type: 'library' }
  | { type: 'care' }
  | null

export default function App() {
  const [overlay, setOverlay] = useState<Overlay>(null)
  const [focusDate, setFocusDate] = useState<string | null>(null)
  const {
    data,
    ready,
    mode,
    cloudError,
    uid,
    user,
    saveFood,
    deleteFood,
    saveMeal,
    deleteMeal,
    saveWeight,
    deleteWeight,
    saveSteps,
    saveMeasurement,
    deleteMeasurement,
    saveDayNote,
    saveMedCheck,
    savePeriodStart,
    removePeriodStart,
    saveCareProduct,
    archiveCareProduct,
    toggleCareProductCheck,
    setCareSlotChecks,
    saveCareDaySkin,
    importMenuRecipes,
    dedupeMenuDishesCatalog,
  } = useAppData()

  const latestWeightKg = useMemo(() => {
    const sorted = [...data.weights].sort((a, b) => b.date.localeCompare(a.date))
    return sorted[0]?.kg
  }, [data.weights])

  const {
    settings,
    dailyKcalGoal,
    maintainKcalGoal,
    proteinGoal,
    profileReady,
    cycleLengthDays,
    periodLengthDays,
    saveProfile,
    syncGoalFromWeight,
    saveTargets,
  } = useSettings(latestWeightKg, uid)

  const latestWeightDate = useMemo(() => {
    const sorted = [...data.weights].sort((a, b) => b.date.localeCompare(a.date))
    return sorted[0]?.date
  }, [data.weights])

  const saveStepsRef = useRef(saveSteps)
  saveStepsRef.current = saveSteps
  const stepsRef = useRef(data.steps)
  stepsRef.current = data.steps
  const overlayRef = useRef(overlay)
  overlayRef.current = overlay
  const backStackRef = useRef<Array<() => boolean>>([])

  const registerBackHandler = useCallback((fn: () => boolean) => {
    backStackRef.current.push(fn)
    return () => {
      const i = backStackRef.current.lastIndexOf(fn)
      if (i >= 0) backStackRef.current.splice(i, 1)
    }
  }, [])

  const runBackHandlers = useCallback(() => {
    const stack = backStackRef.current
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i]!()) return true
    }
    return false
  }, [])

  const closeOverlay = useCallback(() => setOverlay(null), [])

  const handleOverlayBack = useCallback(() => {
    if (runBackHandlers()) return
    closeOverlay()
  }, [runBackHandlers, closeOverlay])

  // When a week just closed (Mon+), write its report once in the background.
  useEffect(() => {
    if (!ready) return
    const newest = buildTodayTimeline(data, dailyKcalGoal).historyWeeks[0]
    if (!newest || getCachedWeekSummary(newest.weekStart)) return
    void getWeekNutritionSummary(newest)
  }, [ready, data, dailyKcalGoal])

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
    if (!Capacitor.isNativePlatform()) return
    const sub = CapApp.addListener('backButton', () => {
      if (runBackHandlers()) return
      if (overlayRef.current != null) {
        setOverlay(null)
        return
      }
      void CapApp.minimizeApp()
    })
    return () => {
      void sub.then((h) => h.remove())
    }
  }, [runBackHandlers])

  const showOverlay = overlay != null
  useSwipeBack(showOverlay, handleOverlayBack)

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
            targetWeightKg={settings.targetWeightKg}
            proteinGoal={proteinGoal}
            profileReady={profileReady}
            cycleLengthDays={cycleLengthDays}
            periodLengthDays={periodLengthDays}
            onAddMeal={(opts) =>
              setOverlay({
                type: 'add-meal',
                prefillText: opts?.text,
                mealType: opts?.mealType,
                date: opts?.date,
              })
            }
            onOpenMeal={(mealId) => setOverlay({ type: 'edit-meal', mealId })}
            onOpenProfile={() => setOverlay({ type: 'profile' })}
            onOpenCycle={() => setOverlay({ type: 'profile', openCycleCal: true })}
            onOpenWeightHistory={() => setOverlay({ type: 'weight-history' })}
            onOpenStepsHistory={() => setOverlay({ type: 'steps-history' })}
            onOpenDiary={() => setOverlay({ type: 'diary' })}
            onOpenHistory={() => setOverlay({ type: 'history' })}
            onOpenMeasures={() => setOverlay({ type: 'measures' })}
            onOpenLibrary={() => setOverlay({ type: 'library' })}
            onOpenCare={() => setOverlay({ type: 'care' })}
            focusDate={focusDate}
            onFocusDateConsumed={() => setFocusDate(null)}
            registerBackHandler={registerBackHandler}
            backEnabled={!showOverlay}
            onSaveWeight={async (date, kg) => {
              const entry = await saveWeight(date, kg)
              if (!latestWeightDate || date >= latestWeightDate) {
                syncGoalFromWeight(kg)
              }
              return entry
            }}
            onSaveSteps={saveSteps}
          />
        </div>

        {overlay?.type === 'add-meal' && (
          <AddMealScreen
            data={data}
            prefillText={overlay.prefillText}
            initialMealType={overlay.mealType}
            initialDate={overlay.date}
            onBack={closeOverlay}
            onSaveMeal={saveMeal}
            onSaveFood={saveFood}
            onDeleteFood={deleteFood}
            onImportMenuRecipes={importMenuRecipes}
            onSaveMedCheck={saveMedCheck}
            registerBackHandler={registerBackHandler}
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
            onSaveMedCheck={saveMedCheck}
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
            key={`${uid ?? 'local'}-${overlay.openCycleCal ? 'cal' : 'base'}`}
            data={data}
            user={user}
            settings={settings}
            onBack={closeOverlay}
            onSaveProfile={saveProfile}
            onSaveTargets={saveTargets}
            onSavePeriodStart={savePeriodStart}
            onRemovePeriodStart={removePeriodStart}
            initialCycleCalOpen={Boolean(overlay.openCycleCal)}
            registerBackHandler={registerBackHandler}
          />
        )}

        {overlay?.type === 'measures' && (
          <MeasuresScreen
            data={data}
            onBack={closeOverlay}
            onSave={saveMeasurement}
            onDelete={deleteMeasurement}
          />
        )}

        {overlay?.type === 'library' && (
          <LibraryScreen
            data={data}
            onBack={closeOverlay}
            onSaveFood={saveFood}
            onDeleteFood={deleteFood}
            onImportMenuRecipes={importMenuRecipes}
            onDedupeMenuDishes={dedupeMenuDishesCatalog}
          />
        )}

        {overlay?.type === 'weight-history' && (
          <WeightHistoryScreen
            data={data}
            onBack={closeOverlay}
            onSave={async (date, kg) => {
              const entry = await saveWeight(date, kg)
              if (!latestWeightDate || date >= latestWeightDate) {
                syncGoalFromWeight(kg)
              }
              return entry
            }}
            onDelete={deleteWeight}
          />
        )}

        {overlay?.type === 'steps-history' && (
          <StepsHistoryScreen data={data} onBack={closeOverlay} onSave={saveSteps} />
        )}

        {overlay?.type === 'diary' && (
          <DiaryScreen
            data={data}
            onBack={closeOverlay}
            onSaveDayNote={saveDayNote}
          />
        )}

        {overlay?.type === 'history' && (
          <HistoryScreen
            data={data}
            dailyKcalGoal={dailyKcalGoal}
            maintainKcalGoal={maintainKcalGoal}
            onBack={closeOverlay}
            onOpenDay={(date) => {
              setFocusDate(date)
              closeOverlay()
            }}
            onOpenMeal={(mealId) => {
              const meal = data.meals.find((m) => m.id === mealId)
              if (meal) setFocusDate(meal.date)
              setOverlay({ type: 'edit-meal', mealId })
            }}
            onAddMeal={(date) =>
              setOverlay({ type: 'add-meal', date })
            }
          />
        )}

        {overlay?.type === 'care' && (
          <CareScreen
            careProducts={data.careProducts ?? []}
            careDays={data.careDays ?? []}
            onBack={closeOverlay}
            onToggleCheck={toggleCareProductCheck}
            onSetSlotChecks={setCareSlotChecks}
            onSaveSkin={saveCareDaySkin}
            onSaveProduct={saveCareProduct}
            onArchiveProduct={archiveCareProduct}
          />
        )}
      </main>
    </div>
  )
}
