import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { isFirebaseConfigured } from '../firebase'
import { newId } from '../lib/date'
import { generateAliases } from '../lib/foodAliases'
import { sumMacros } from '../lib/nutrition'
import {
  assertNonNegMacros,
  sanitizeMacros,
  sanitizeMealItems,
} from '../lib/sanitize'
import { ensureAuth, removeDoc, subscribeUserData, upsertDoc } from '../storage/cloudSync'
import { emptyAppData, loadLocalData, saveLocalData } from '../storage/localStore'
import type {
  AppData,
  FoodItem,
  MacroSet,
  Meal,
  MealItem,
  MealType,
  MeasurementEntry,
  StepsEntry,
  WeightEntry,
} from '../types'

const CLOUD_KEYS: (keyof AppData)[] = ['foods', 'meals', 'weights', 'measurements', 'steps']

export function useAppData() {
  const [data, setData] = useState<AppData>(() => loadLocalData())
  const [uid, setUid] = useState<string | null>(null)
  const [ready, setReady] = useState(!isFirebaseConfigured())
  const [cloudError, setCloudError] = useState<string | null>(null)
  const useCloud = Boolean(uid)
  /** Collections already accepted from cloud (prevents empty first snapshot wiping local). */
  const cloudHydrated = useRef(new Set<keyof AppData>())

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setReady(true)
      return
    }
    let unsub: (() => void) | undefined
    let cancelled = false
    cloudHydrated.current = new Set()
    ;(async () => {
      try {
        const user = await ensureAuth()
        if (cancelled || !user) {
          setReady(true)
          return
        }
        setUid(user.uid)
        unsub = subscribeUserData(user.uid, {
          onData: (partial) => {
            setData((prev) => {
              const next: AppData = { ...prev }
              for (const key of CLOUD_KEYS) {
                if (!(key in partial)) continue
                const cloudItems = partial[key]
                if (!Array.isArray(cloudItems)) continue
                const localItems = prev[key] as Array<{ id: string }>
                // Empty cloud on first snapshot: seed cloud from local, keep local data.
                if (
                  cloudItems.length === 0 &&
                  localItems.length > 0 &&
                  !cloudHydrated.current.has(key)
                ) {
                  cloudHydrated.current.add(key)
                  void Promise.all(
                    localItems.map((item) =>
                      upsertDoc(user.uid, key, item.id, { ...item } as Record<string, unknown>),
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
      } catch (err) {
        setCloudError(err instanceof Error ? err.message : 'Не удалось войти')
        setReady(true)
      }
    })()
    return () => {
      cancelled = true
      unsub?.()
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
    saveFood,
    deleteFood,
    saveMeal,
    deleteMeal,
    saveWeight,
    saveSteps,
    saveMeasurement,
    resetLocal,
  }
}
