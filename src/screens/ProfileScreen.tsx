import { useMemo, useState } from 'react'
import {
  ACTIVITY_LABELS,
  GOAL_MODE_LABELS,
  calcDailyKcalGoal,
  type ActivityLevel,
  type BodyProfile,
  type GoalMode,
  type Sex,
} from '../lib/calorieGoal'
import { loadSettings } from '../lib/settings'
import type { AppData } from '../types'

type Props = {
  data: AppData
  onBack: () => void
  onSaveProfile: (profile: BodyProfile, weightKg: number) => { dailyKcalGoal: number }
}

function latestWeight(data: AppData): number | undefined {
  const sorted = [...data.weights].sort((a, b) => b.date.localeCompare(a.date))
  return sorted[0]?.kg
}

export function ProfileScreen({ data, onBack, onSaveProfile }: Props) {
  const saved = loadSettings()
  const savedProfile = saved.profile
  const weightKg = latestWeight(data)

  const [sex, setSex] = useState<Sex>(savedProfile?.sex ?? 'female')
  const [age, setAge] = useState(savedProfile?.age?.toString() ?? '')
  const [heightCm, setHeightCm] = useState(savedProfile?.heightCm?.toString() ?? '')
  const [activity, setActivity] = useState<ActivityLevel>(savedProfile?.activity ?? 'light')
  const [goalMode, setGoalMode] = useState<GoalMode>(savedProfile?.goalMode ?? 'mild')
  const [error, setError] = useState<string | null>(null)

  const previewGoal = useMemo(() => {
    const ageN = Number(age.replace(',', '.'))
    const h = Number(heightCm.replace(',', '.'))
    if (!Number.isFinite(ageN) || !Number.isFinite(h) || weightKg == null) return null
    return calcDailyKcalGoal(
      {
        sex,
        age: Math.round(ageN),
        heightCm: Math.round(h),
        activity,
        goalMode,
      },
      weightKg,
    )
  }, [sex, age, heightCm, activity, goalMode, weightKg])

  const liveGoal =
    savedProfile && weightKg != null
      ? calcDailyKcalGoal(savedProfile, weightKg)
      : saved.dailyKcalGoal

  const save = () => {
    const ageN = Number(age.replace(',', '.'))
    const h = Number(heightCm.replace(',', '.'))
    if (!Number.isFinite(ageN) || ageN < 14 || ageN > 100) {
      setError('Укажите возраст')
      return
    }
    if (!Number.isFinite(h) || h < 120 || h > 230) {
      setError('Укажите рост в см')
      return
    }
    if (weightKg == null || weightKg < 30) {
      setError('Сначала укажите вес на экране «Сегодня»')
      return
    }
    onSaveProfile(
      {
        sex,
        age: Math.round(ageN),
        heightCm: Math.round(h),
        activity,
        goalMode,
      },
      weightKg,
    )
    onBack()
  }

  return (
    <section className="screen">
      <header className="screen-header">
        <button type="button" className="link-btn" onClick={onBack}>
          ← Назад
        </button>
        <h1>Профиль</h1>
        <p className="muted">Норма калорий по весу, росту и активности</p>
      </header>

      {savedProfile && (
        <p className="profile-goal-preview">
          Сейчас: <strong>{liveGoal} ккал/день</strong>
          {weightKg != null ? ` · вес ${weightKg} кг` : ''}
        </p>
      )}

      <div className="panel">
        <div className="form-grid">
          <label className="field">
            <span>Пол</span>
            <select value={sex} onChange={(e) => setSex(e.target.value as Sex)}>
              <option value="female">Женский</option>
              <option value="male">Мужской</option>
            </select>
          </label>
          <label className="field">
            <span>Возраст</span>
            <input
              inputMode="numeric"
              value={age}
              onChange={(e) => setAge(e.target.value)}
              placeholder="лет"
            />
          </label>
          <label className="field">
            <span>Рост, см</span>
            <input
              inputMode="decimal"
              value={heightCm}
              onChange={(e) => setHeightCm(e.target.value)}
              placeholder="см"
            />
          </label>
          <label className="field">
            <span>Активность</span>
            <select value={activity} onChange={(e) => setActivity(e.target.value as ActivityLevel)}>
              {(Object.keys(ACTIVITY_LABELS) as ActivityLevel[]).map((key) => (
                <option key={key} value={key}>
                  {ACTIVITY_LABELS[key]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="field">
          <span>Цель</span>
          <select value={goalMode} onChange={(e) => setGoalMode(e.target.value as GoalMode)}>
            {(Object.keys(GOAL_MODE_LABELS) as GoalMode[]).map((key) => (
              <option key={key} value={key}>
                {GOAL_MODE_LABELS[key]}
              </option>
            ))}
          </select>
        </label>

        {previewGoal != null && (
          <p className="profile-goal-preview">
            Новая норма: <strong>{previewGoal} ккал/день</strong>
          </p>
        )}

        <button type="button" className="primary-btn" onClick={save}>
          Сохранить
        </button>
        {error && <p className="form-msg error">{error}</p>}
      </div>
    </section>
  )
}
