import { useEffect, useMemo, useState } from 'react'
import type { User } from 'firebase/auth'
import { AccountPanel } from '../components/AccountPanel'
import {
  ACTIVITY_LABELS,
  GOAL_MODE_LABELS,
  ageFromBirthDate,
  anchoredFormulaWeight,
  calcDailyKcalGoal,
  calcOptimalWeightKg,
  profileAge,
  type ActivityLevel,
  type BodyProfile,
  type GoalMode,
  type Sex,
} from '../lib/calorieGoal'
import { calcProteinGoal, VEG_GOAL_G } from '../lib/macroGoals'
import { formatKg } from '../lib/nutrition'
import { calcSweetBudgetKcal } from '../lib/sweets'
import type { AppSettings } from '../lib/settings'
import type { AppData } from '../types'

const SEX_LABELS: Record<Sex, string> = {
  female: 'Женский',
  male: 'Мужской',
}

type Props = {
  data: AppData
  user: User | null
  settings: AppSettings
  onBack: () => void
  onSaveProfile: (profile: BodyProfile, weightKg: number) => { dailyKcalGoal: number }
  onSaveTargets: (input: {
    targetWeightKg?: number | null
    proteinGoalG?: number | null
    vegGoalG?: number | null
    sweetGoalKcal?: number | null
  }) => unknown
  onImportDiary?: (
    raw: unknown,
    onProgress?: (msg: string) => void,
  ) => Promise<{ meals: number; weights: number }>
}

function latestWeight(data: AppData): number | undefined {
  const sorted = [...data.weights].sort((a, b) => b.date.localeCompare(a.date))
  return sorted[0]?.kg
}

export function ProfileScreen({
  data,
  user,
  settings,
  onBack,
  onSaveProfile,
  onSaveTargets,
  onImportDiary,
}: Props) {
  const savedProfile = settings.profile
  const weightKg = latestWeight(data)

  const [editing, setEditing] = useState(!savedProfile)
  const [sex, setSex] = useState<Sex>(savedProfile?.sex ?? 'female')
  const [birthDate, setBirthDate] = useState(savedProfile?.birthDate ?? '')
  const [heightCm, setHeightCm] = useState(savedProfile?.heightCm?.toString() ?? '')
  const [activity, setActivity] = useState<ActivityLevel>(savedProfile?.activity ?? 'light')
  const [goalMode, setGoalMode] = useState<GoalMode>(savedProfile?.goalMode ?? 'mild')
  const [error, setError] = useState<string | null>(null)

  const [targetKg, setTargetKg] = useState(
    settings.targetWeightKg != null ? String(settings.targetWeightKg) : '',
  )
  const [targetError, setTargetError] = useState<string | null>(null)
  const [targetTouched, setTargetTouched] = useState(false)
  const [proteinTouched, setProteinTouched] = useState(false)
  const [proteinInput, setProteinInput] = useState('')
  const [vegInput, setVegInput] = useState('')
  const [sweetInput, setSweetInput] = useState('')
  const [macroError, setMacroError] = useState<string | null>(null)

  useEffect(() => {
    const p = settings.profile
    setEditing(!p)
    setSex(p?.sex ?? 'female')
    setBirthDate(p?.birthDate ?? '')
    setHeightCm(p?.heightCm?.toString() ?? '')
    setActivity(p?.activity ?? 'light')
    setGoalMode(p?.goalMode ?? 'mild')
    setError(null)
    const weight = anchoredFormulaWeight(settings.formulaWeightKg, latestWeight(data))
    const optimal = p ? calcOptimalWeightKg(p.sex, p.heightCm) : null
    const storedTarget = settings.targetWeightKg
    const targetCustom =
      storedTarget != null && (optimal == null || Math.abs(storedTarget - optimal) >= 0.05)
    setTargetTouched(targetCustom)
    setTargetKg(
      storedTarget != null ? String(storedTarget) : optimal != null ? String(optimal) : '',
    )
    setTargetError(null)
    const autoProtein = weight != null ? calcProteinGoal(weight) : null
    const storedProtein = settings.proteinGoalG
    setProteinTouched(storedProtein != null && storedProtein !== autoProtein)
    setProteinInput(
      storedProtein != null ? String(storedProtein) : autoProtein != null ? String(autoProtein) : '',
    )
    setVegInput(String(settings.vegGoalG ?? VEG_GOAL_G))
    setSweetInput(String(settings.sweetGoalKcal ?? calcSweetBudgetKcal()))
    setMacroError(null)
  }, [settings])

  const enteredAge = ageFromBirthDate(birthDate)
  const heightDraft = Number(heightCm.replace(',', '.'))
  const formulaKg = anchoredFormulaWeight(settings.formulaWeightKg, weightKg)
  const suggestedTarget =
    Number.isFinite(heightDraft) && heightDraft >= 120 && heightDraft <= 230
      ? calcOptimalWeightKg(sex, Math.round(heightDraft))
      : null
  const suggestedProtein = formulaKg != null ? calcProteinGoal(formulaKg) : null
  const targetField =
    !targetTouched && suggestedTarget != null ? String(suggestedTarget) : targetKg
  const proteinField =
    !proteinTouched && suggestedProtein != null ? String(suggestedProtein) : proteinInput

  const previewGoal = useMemo(() => {
    const h = Number(heightCm.replace(',', '.'))
    const basis = formulaKg ?? weightKg
    if (enteredAge == null || !Number.isFinite(h) || basis == null) return null
    return calcDailyKcalGoal(
      {
        sex,
        birthDate,
        age: enteredAge,
        heightCm: Math.round(h),
        activity,
        goalMode,
      },
      basis,
    )
  }, [sex, birthDate, enteredAge, heightCm, activity, goalMode, formulaKg, weightKg])

  const liveGoal =
    savedProfile && formulaKg != null
      ? calcDailyKcalGoal(savedProfile, formulaKg)
      : settings.dailyKcalGoal

  const proteinGoal = settings.proteinGoalG ?? suggestedProtein
  const shownTarget =
    settings.targetWeightKg ??
    (savedProfile ? calcOptimalWeightKg(savedProfile.sex, savedProfile.heightCm) : null)
  const vegGoal = settings.vegGoalG ?? VEG_GOAL_G
  const sweetGoal = settings.sweetGoalKcal ?? calcSweetBudgetKcal()

  const save = () => {
    setError(null)
    setTargetError(null)
    setMacroError(null)
    const ageN = enteredAge
    const h = Number(heightCm.replace(',', '.'))
    if (ageN == null || ageN < 14 || ageN > 100) {
      setError('Укажите дату рождения: возраст от 14 до 100 лет')
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
    const proteinRaw = proteinField.trim()
    const vegRaw = vegInput.trim()
    const sweetRaw = sweetInput.trim()
    const protein = proteinRaw ? Number(proteinRaw.replace(',', '.')) : null
    const veg = vegRaw ? Number(vegRaw.replace(',', '.')) : null
    const sweet = sweetRaw ? Number(sweetRaw.replace(',', '.')) : null
    if (protein != null && (!Number.isFinite(protein) || protein < 20 || protein > 300)) {
      setMacroError('Белок от 20 до 300 г')
      return
    }
    if (veg != null && (!Number.isFinite(veg) || veg < 50 || veg > 1500)) {
      setMacroError('Овощи от 50 до 1500 г')
      return
    }
    if (sweet != null && (!Number.isFinite(sweet) || sweet < 0 || sweet > 1500)) {
      setMacroError('Сладкое от 0 до 1500 ккал')
      return
    }
    let nextTarget: number | null = null
    const targetRaw = targetField.trim()
    if (targetRaw) {
      const t = Number(targetRaw.replace(',', '.'))
      if (!Number.isFinite(t) || t < 30 || t > 400) {
        setTargetError('Целевой вес от 30 до 400 кг')
        return
      }
      const rounded = Math.round(t * 100) / 100
      nextTarget =
        suggestedTarget != null && Math.abs(rounded - suggestedTarget) < 0.05 ? null : rounded
    }
    const nextProtein =
      protein == null || (suggestedProtein != null && Math.round(protein) === suggestedProtein)
        ? null
        : Math.round(protein)
    const nextVeg = veg == null || Math.round(veg) === VEG_GOAL_G ? null : Math.round(veg)
    const nextSweet =
      sweet == null || Math.round(sweet) === calcSweetBudgetKcal() ? null : Math.round(sweet)
    onSaveProfile(
      {
        sex,
        birthDate,
        age: ageN,
        heightCm: Math.round(h),
        activity,
        goalMode,
      },
      formulaKg ?? weightKg,
    )
    onSaveTargets({
      targetWeightKg: nextTarget,
      proteinGoalG: nextProtein,
      vegGoalG: nextVeg,
      sweetGoalKcal: nextSweet,
    })
    setError(null)
    setTargetError(null)
    setMacroError(null)
    setEditing(false)
  }

  const cancelEdit = () => {
    if (!savedProfile) return
    setSex(savedProfile.sex)
    setBirthDate(savedProfile.birthDate ?? '')
    setHeightCm(savedProfile.heightCm.toString())
    setActivity(savedProfile.activity)
    setGoalMode(savedProfile.goalMode)
    setTargetKg(shownTarget != null ? String(shownTarget) : '')
    setProteinInput(proteinGoal != null ? String(proteinGoal) : '')
    setVegInput(String(vegGoal))
    setSweetInput(String(sweetGoal))
    setTargetTouched(settings.targetWeightKg != null)
    setProteinTouched(settings.proteinGoalG != null)
    setError(null)
    setTargetError(null)
    setMacroError(null)
    setEditing(false)
  }

  return (
    <section className="screen">
      <header className="screen-header">
        <button type="button" className="link-btn" onClick={onBack}>
          ← Назад
        </button>
        <h1>Профиль</h1>
        <p className="muted">Аккаунт и параметры</p>
      </header>

      <AccountPanel user={user} onImportDiary={onImportDiary} />

      {savedProfile && !editing ? (
        <div className="panel">
          <div className="profile-summary">
            <div className="profile-summary-text">
              <strong>{liveGoal} ккал/день</strong>
              <p className="muted small">
                {[
                  weightKg != null ? `${formatKg(weightKg)} кг` : null,
                  shownTarget != null ? `цель ${formatKg(shownTarget)} кг` : null,
                  proteinGoal != null ? `белок ${proteinGoal} г` : null,
                  `овощи ${vegGoal} г`,
                  `сладкое до ${sweetGoal} ккал`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              <p className="muted small">
                {SEX_LABELS[savedProfile.sex]} · {profileAge(savedProfile)} лет ·{' '}
                {savedProfile.heightCm} см · {ACTIVITY_LABELS[savedProfile.activity]} ·{' '}
                {GOAL_MODE_LABELS[savedProfile.goalMode]}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="ghost-btn"
            onClick={() => {
              setProteinInput(proteinGoal != null ? String(proteinGoal) : '')
              setVegInput(String(vegGoal))
              setSweetInput(String(sweetGoal))
              setTargetKg(shownTarget != null ? String(shownTarget) : '')
              setTargetTouched(settings.targetWeightKg != null)
              setProteinTouched(settings.proteinGoalG != null)
              setError(null)
              setTargetError(null)
              setMacroError(null)
              setEditing(true)
            }}
          >
            Изменить параметры
          </button>
        </div>
      ) : (
        <div className="panel">
          <div className="profile-fields">
            <div className="profile-fields-row cols-2">
              <label className="field">
                <span>Пол</span>
                <select value={sex} onChange={(e) => setSex(e.target.value as Sex)}>
                  <option value="female">Женский</option>
                  <option value="male">Мужской</option>
                </select>
              </label>
              <label className="field">
                <span>
                  Дата рождения
                  {enteredAge != null ? ` · ${enteredAge} лет` : ''}
                </span>
                <input
                  type="date"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                />
              </label>
            </div>
            <div className="profile-fields-row cols-3">
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
                <span>Вес, кг</span>
                <input readOnly value={weightKg != null ? formatKg(weightKg) : '—'} />
              </label>
              <label className="field">
                <span>Целевой, кг</span>
                <input
                  inputMode="decimal"
                  value={targetField}
                  onChange={(e) => {
                    setTargetTouched(true)
                    setTargetKg(e.target.value)
                  }}
                  placeholder="55"
                />
              </label>
            </div>
            <div className="profile-fields-row cols-3">
              <label className="field">
                <span>Белок, г</span>
                <input
                  inputMode="numeric"
                  value={proteinField}
                  onChange={(e) => {
                    setProteinTouched(true)
                    setProteinInput(e.target.value)
                  }}
                  placeholder="70"
                />
              </label>
              <label className="field">
                <span>Овощи, г</span>
                <input
                  inputMode="numeric"
                  value={vegInput}
                  onChange={(e) => setVegInput(e.target.value)}
                  placeholder="400"
                />
              </label>
              <label className="field">
                <span>Сладкое, ккал</span>
                <input
                  inputMode="numeric"
                  value={sweetInput}
                  onChange={(e) => setSweetInput(e.target.value)}
                  placeholder="300"
                />
              </label>
            </div>
            <label className="field">
              <span>Активность</span>
              <select
                value={activity}
                onChange={(e) => setActivity(e.target.value as ActivityLevel)}
              >
                {(Object.keys(ACTIVITY_LABELS) as ActivityLevel[]).map((key) => (
                  <option key={key} value={key}>
                    {ACTIVITY_LABELS[key]}
                  </option>
                ))}
              </select>
            </label>
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
          </div>

          {previewGoal != null && (
            <p className="profile-goal-preview">
              Норма калорий: <strong>{previewGoal} ккал/день</strong>
            </p>
          )}

          <div className="btn-row">
            <button type="button" className="primary-btn" onClick={save}>
              Сохранить
            </button>
            {savedProfile && (
              <button type="button" className="ghost-btn" onClick={cancelEdit}>
                Отмена
              </button>
            )}
          </div>
          {error && <p className="form-msg error">{error}</p>}
          {targetError && <p className="form-msg error">{targetError}</p>}
          {macroError && <p className="form-msg error">{macroError}</p>}
        </div>
      )}
    </section>
  )
}
