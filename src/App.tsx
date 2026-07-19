import { useMemo, useState } from 'react'
import { useAppData } from './hooks/useAppData'
import { useSettings } from './hooks/useSettings'
import { AddMealScreen } from './screens/AddMealScreen'
import { MeasuresScreen } from './screens/MeasuresScreen'
import { MealDetailScreen } from './screens/MealDetailScreen'
import { ProfileScreen } from './screens/ProfileScreen'
import { StepsHistoryScreen } from './screens/StepsHistoryScreen'
import { TodayScreen } from './screens/TodayScreen'
import { WeightHistoryScreen } from './screens/WeightHistoryScreen'
import './App.css'

type Overlay =
  | { type: 'add-meal' }
  | { type: 'edit-meal'; mealId: string }
  | { type: 'profile' }
  | { type: 'measures' }
  | { type: 'weight-history' }
  | { type: 'steps-history' }
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
  } = useAppData()

  const latestWeightKg = useMemo(() => {
    const sorted = [...data.weights].sort((a, b) => b.date.localeCompare(a.date))
    return sorted[0]?.kg
  }, [data.weights])

  const { dailyKcalGoal, profileReady, saveProfile, syncGoalFromWeight } =
    useSettings(latestWeightKg)

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
            profileReady={profileReady}
            onAddMeal={() => setOverlay({ type: 'add-meal' })}
            onOpenMeal={(mealId) => setOverlay({ type: 'edit-meal', mealId })}
            onOpenProfile={() => setOverlay({ type: 'profile' })}
            onOpenMeasures={() => setOverlay({ type: 'measures' })}
            onOpenWeightHistory={() => setOverlay({ type: 'weight-history' })}
            onOpenStepsHistory={() => setOverlay({ type: 'steps-history' })}
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
          <ProfileScreen data={data} onBack={closeOverlay} onSaveProfile={saveProfile} />
        )}

        {overlay?.type === 'measures' && (
          <MeasuresScreen data={data} onBack={closeOverlay} onSave={saveMeasurement} />
        )}

        {overlay?.type === 'weight-history' && (
          <WeightHistoryScreen
            data={data}
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
      </main>
    </div>
  )
}
