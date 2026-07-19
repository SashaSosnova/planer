import { useCallback, useEffect, useMemo, useState } from 'react'
import { isFirebaseConfigured } from '../firebase'
import { newId } from '../lib/date'
import { generateAliases } from '../lib/foodAliases'
import { sumMacros } from '../lib/nutrition'
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

export function useAppData() {
  const [data, setData] = useState<AppData>(() => loadLocalData())
  const [uid, setUid] = useState<string | null>(null)
  const [ready, setReady] = useState(!isFirebaseConfigured())
  const [cloudError, setCloudError] = useState<string | null>(null)
  const useCloud = Boolean(uid)

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setReady(true)
      return
    }
    let unsub: (() => void) | undefined
    let cancelled = false
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
              const next = { ...prev, ...partial }
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
      const item: FoodItem = {
        id: input.id ?? newId(),
        name,
        aliases: generateAliases(name),
        per100g: input.per100g,
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
      const totals: MacroSet = sumMacros(input.items)
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
        items: input.items,
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
      const existing = data.weights.find((w) => w.date === date)
      const entry: WeightEntry = {
        id: existing?.id ?? newId(),
        date,
        kg,
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
      const existing = data.steps.find((s) => s.date === date)
      const entry: StepsEntry = {
        id: existing?.id ?? newId(),
        date,
        count,
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
      const existing = data.measurements.find((m) => m.date === input.date)
      const entry: MeasurementEntry = {
        id: input.id ?? existing?.id ?? newId(),
        date: input.date,
        chest: input.chest,
        waist: input.waist,
        belly: input.belly,
        hips: input.hips,
        thigh: input.thigh,
        bicep: input.bicep,
        createdAt: existing?.createdAt ?? Date.now(),
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
