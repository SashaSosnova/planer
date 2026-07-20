import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { User } from 'firebase/auth'
import { isFirebaseConfigured } from '../firebase'
import { watchAuth } from '../lib/accountAuth'
import { newId } from '../lib/date'
import { generateAliases } from '../lib/foodAliases'
import { sumMacros } from '../lib/nutrition'
import {
  assertNonNegMacros,
  DAY_NOTE_MAX,
  sanitizeMacros,
  sanitizeMealItems,
} from '../lib/sanitize'
import { ensureAuth, removeDoc, subscribeUserData, upsertDoc } from '../storage/cloudSync'
import { emptyAppData, loadLocalData, saveLocalData } from '../storage/localStore'
import type {
  AppData,
  DayNote,
  FoodItem,
  MacroSet,
  Meal,
  MealItem,
  MealType,
  MeasurementEntry,
  PeriodStart,
  StepsEntry,
  WeightEntry,
} from '../types'

const CLOUD_KEYS: (keyof AppData)[] = [
  'foods',
  'meals',
  'weights',
  'measurements',
  'steps',
  'dayNotes',
  'periodStarts',
]

export function useAppData() {
  const [data, setData] = useState<AppData>(() => loadLocalData())
  const [uid, setUid] = useState<string | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(!isFirebaseConfigured())
  const [cloudError, setCloudError] = useState<string | null>(null)
  const useCloud = Boolean(uid)
  /** Collections already accepted from cloud (prevents empty first snapshot wiping local). */
  const cloudHydrated = useRef(new Set<keyof AppData>())
  const prevUidRef = useRef<string | null>(null)

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setReady(true)
      return
    }
    let unsubData: (() => void) | undefined
    let cancelled = false

    const attachUser = (authUser: User) => {
      const switched =
        prevUidRef.current != null && prevUidRef.current !== authUser.uid
      prevUidRef.current = authUser.uid
      setUser(authUser)
      setUid(authUser.uid)
      setCloudError(null)
      if (switched) {
        // Different account: do not seed previous device data into the new uid
        const empty = emptyAppData()
        saveLocalData(empty)
        setData(empty)
        cloudHydrated.current = new Set(CLOUD_KEYS)
      } else {
        cloudHydrated.current = new Set()
      }
      unsubData?.()
      unsubData = subscribeUserData(authUser.uid, {
        onData: (partial) => {
          setData((prev) => {
            const next: AppData = { ...prev }
            for (const key of CLOUD_KEYS) {
              if (!(key in partial)) continue
              const cloudItems = partial[key]
              if (!Array.isArray(cloudItems)) continue
              const localItems = prev[key] as Array<{ id: string }>
              if (
                cloudItems.length === 0 &&
                localItems.length > 0 &&
                !cloudHydrated.current.has(key)
              ) {
                cloudHydrated.current.add(key)
                void Promise.all(
                  localItems.map((item) =>
                    upsertDoc(authUser.uid, key, item.id, {
                      ...item,
                    } as Record<string, unknown>),
                  ),
                )
                continue
              }
              cloudHydrated.current.add(key)
              Object.assign(next, { [key]: cloudItems })
            }
            saveLocalData(next)
            return next
          })
        },
        onError: (err) => {
          setCloudError(err instanceof Error ? err.message : 'Ошибка синхронизации')
        },
      })
      setReady(true)
    }

    const unsubAuth = watchAuth((authUser) => {
      void (async () => {
        try {
          let u = authUser
          if (!u) {
            u = await ensureAuth()
          }
          if (cancelled || !u) {
            setReady(true)
            return
          }
          attachUser(u)
        } catch (err) {
          if (!cancelled) {
            setCloudError(err instanceof Error ? err.message : 'Не удалось войти')
            setReady(true)
          }
        }
      })()
    })

    return () => {
      cancelled = true
      unsubAuth()
      unsubData?.()
    }
  }, [])

  const persistLocal = useCallback((updater: (prev: AppData) => AppData) => {
    setData((prev) => {
      const next = updater(prev)
      saveLocalData(next)
      return next
    })
  }, [])

  const saveFood = useCallback(
    async (input: Omit<FoodItem, 'id' | 'updatedAt'> & { id?: string }) => {
      const name = input.name.trim()
      if (!name) throw new Error('Укажите название продукта')
      const per100g = sanitizeMacros(input.per100g)
      assertNonNegMacros(per100g)
      const item: FoodItem = {
        id: input.id ?? newId(),
        name,
        aliases: generateAliases(name),
        per100g,
        kind: input.kind ?? (input.recipe ? 'dish' : 'ingredient'),
        updatedAt: Date.now(),
        ...(input.recipe ? { recipe: input.recipe } : {}),
      }
      if (useCloud && uid) {
        await upsertDoc(uid, 'foods', item.id, { ...item })
      }
      persistLocal((prev) => ({
        ...prev,
        foods: [...prev.foods.filter((f) => f.id !== item.id), item],
      }))
      return item
    },
    [persistLocal, uid, useCloud],
  )

  const deleteFood = useCallback(
    async (id: string) => {
      if (useCloud && uid) await removeDoc(uid, 'foods', id)
      persistLocal((prev) => ({ ...prev, foods: prev.foods.filter((f) => f.id !== id) }))
    },
    [persistLocal, uid, useCloud],
  )

  const saveMeal = useCallback(
    async (input: {
      id?: string
      date: string
      mealType: MealType
      rawText: string
      items: MealItem[]
      isApproximate: boolean
      eatingOut?: boolean
    }) => {
      const items = sanitizeMealItems(input.items)
      if (items.length === 0) throw new Error('Добавьте хотя бы один продукт с граммами > 0')
      const totals: MacroSet = sumMacros(items)
      let createdAt = Date.now()
      if (input.id) {
        const existing = data.meals.find((m) => m.id === input.id)
        if (existing) createdAt = existing.createdAt
      }
      const meal: Meal = {
        id: input.id ?? newId(),
        date: input.date,
        mealType: input.mealType,
        rawText: input.rawText,
        items,
        totals,
        isApproximate: input.isApproximate,
        eatingOut: Boolean(input.eatingOut),
        createdAt,
      }
      if (useCloud && uid) await upsertDoc(uid, 'meals', meal.id, { ...meal })
      persistLocal((prev) => ({
        ...prev,
        meals: [...prev.meals.filter((m) => m.id !== meal.id), meal],
      }))
      return meal
    },
    [data.meals, persistLocal, uid, useCloud],
  )

  const deleteMeal = useCallback(
    async (id: string) => {
      if (useCloud && uid) await removeDoc(uid, 'meals', id)
      persistLocal((prev) => ({ ...prev, meals: prev.meals.filter((m) => m.id !== id) }))
    },
    [persistLocal, uid, useCloud],
  )

  const saveWeight = useCallback(
    async (date: string, kg: number) => {
      if (!Number.isFinite(kg) || kg < 30 || kg > 400) {
        throw new Error('Укажите вес от 30 до 400 кг')
      }
      const existing = data.weights.find((w) => w.date === date)
      const entry: WeightEntry = {
        id: existing?.id ?? newId(),
        date,
        kg: Math.round(kg * 10) / 10,
        createdAt: existing?.createdAt ?? Date.now(),
      }
      if (useCloud && uid) await upsertDoc(uid, 'weights', entry.id, { ...entry })
      persistLocal((prev) => ({
        ...prev,
        weights: [...prev.weights.filter((w) => w.date !== date), entry],
      }))
      return entry
    },
    [data.weights, persistLocal, uid, useCloud],
  )

  const saveSteps = useCallback(
    async (date: string, count: number) => {
      if (!Number.isFinite(count) || count < 0) {
        throw new Error('Шаги не могут быть отрицательными')
      }
      const existing = data.steps.find((s) => s.date === date)
      const entry: StepsEntry = {
        id: existing?.id ?? newId(),
        date,
        count: Math.round(count),
        createdAt: existing?.createdAt ?? Date.now(),
      }
      if (useCloud && uid) await upsertDoc(uid, 'steps', entry.id, { ...entry })
      persistLocal((prev) => ({
        ...prev,
        steps: [...prev.steps.filter((s) => s.date !== date), entry],
      }))
      return entry
    },
    [data.steps, persistLocal, uid, useCloud],
  )

  const saveMeasurement = useCallback(
    async (input: Omit<MeasurementEntry, 'id' | 'createdAt'> & { id?: string }) => {
      const clamp = (v: number | undefined) =>
        v != null && Number.isFinite(v) && v >= 0 ? Math.round(v * 10) / 10 : undefined
      const existing = data.measurements.find((m) => m.date === input.date)
      const entry: MeasurementEntry = {
        id: input.id ?? existing?.id ?? newId(),
        date: input.date,
        chest: clamp(input.chest),
        waist: clamp(input.waist),
        belly: clamp(input.belly),
        hips: clamp(input.hips),
        thigh: clamp(input.thigh),
        bicep: clamp(input.bicep),
        createdAt: existing?.createdAt ?? Date.now(),
      }
      if (
        entry.chest == null &&
        entry.waist == null &&
        entry.belly == null &&
        entry.hips == null &&
        entry.thigh == null &&
        entry.bicep == null
      ) {
        throw new Error('Заполните хотя бы один обмер')
      }
      if (useCloud && uid) await upsertDoc(uid, 'measurements', entry.id, { ...entry })
      persistLocal((prev) => ({
        ...prev,
        measurements: [...prev.measurements.filter((m) => m.date !== entry.date), entry],
      }))
      return entry
    },
    [data.measurements, persistLocal, uid, useCloud],
  )

  const saveDayNote = useCallback(
    async (input: { date: string; text: string; question?: string }) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error('Некорректная дата')
      const text = input.text.trim().slice(0, DAY_NOTE_MAX)
      const existing = (data.dayNotes ?? []).find((n) => n.date === input.date)

      if (!text) {
        if (existing && useCloud && uid) await removeDoc(uid, 'dayNotes', existing.id)
        persistLocal((prev) => ({
          ...prev,
          dayNotes: (prev.dayNotes ?? []).filter((n) => n.date !== input.date),
        }))
        return null
      }

      const question = (input.question ?? existing?.question ?? '').trim().slice(0, 200)
      const now = Date.now()
      const entry: DayNote = {
        id: existing?.id ?? newId(),
        date: input.date,
        text,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        ...(question ? { question } : {}),
      }
      if (useCloud && uid) await upsertDoc(uid, 'dayNotes', entry.id, { ...entry })
      persistLocal((prev) => ({
        ...prev,
        dayNotes: [...(prev.dayNotes ?? []).filter((n) => n.date !== entry.date), entry],
      }))
      return entry
    },
    [data.dayNotes, persistLocal, uid, useCloud],
  )

  const savePeriodStart = useCallback(
    async (date: string) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Некорректная дата')
      const existing = data.periodStarts.find((p) => p.date === date)
      if (existing) return existing
      const entry: PeriodStart = {
        id: newId(),
        date,
        createdAt: Date.now(),
      }
      if (useCloud && uid) await upsertDoc(uid, 'periodStarts', entry.id, { ...entry })
      persistLocal((prev) => ({
        ...prev,
        periodStarts: [...prev.periodStarts, entry],
      }))
      return entry
    },
    [data.periodStarts, persistLocal, uid, useCloud],
  )

  const removePeriodStart = useCallback(
    async (id: string) => {
      if (useCloud && uid) await removeDoc(uid, 'periodStarts', id)
      persistLocal((prev) => ({
        ...prev,
        periodStarts: prev.periodStarts.filter((p) => p.id !== id),
      }))
    },
    [persistLocal, uid, useCloud],
  )

  const resetLocal = useCallback(() => {
    const empty = emptyAppData()
    saveLocalData(empty)
    setData(empty)
  }, [])

  const mode = useMemo(
    () => (useCloud ? 'cloud' : isFirebaseConfigured() ? 'connecting' : 'local'),
    [useCloud],
  )

  return {
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
    saveSteps,
    saveMeasurement,
    saveDayNote,
    savePeriodStart,
    removePeriodStart,
    resetLocal,
  }
}
