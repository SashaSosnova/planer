import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { User } from 'firebase/auth'
import { isFirebaseConfigured } from '../firebase'
import { isAnonymousSuppressed, watchAuth } from '../lib/accountAuth'
import { newId } from '../lib/date'
import { generateAliases } from '../lib/foodAliases'
import { sumMacros } from '../lib/nutrition'
import {
  draftToNoteFields,
  emptyJournalDraft,
  isJournalDraftEmpty,
  migrateLegacyNote,
  type DayJournalDraft,
} from '../lib/dayJournal'
import {
  assertNonNegMacros,
  dedupeMeasurements,
  dedupePeriodStarts,
  sanitizeDayNote,
  sanitizeMacros,
  sanitizeMealItems,
} from '../lib/sanitize'
import { isCareDayEmpty } from '../lib/careSchedule'
import { isMedDayEmpty, MED_DOSE_AT_FIELD, type MedDoseKey } from '../lib/medRoutine'
import {
  buildSeedCareProducts,
  hasSeededCareProducts,
  markSeededCareProducts,
  RETIRED_CARE_PRODUCT_IDS,
  SEED_CARE_PRODUCTS_KEY,
} from '../lib/seedCareProducts'
import { parseTelegramImportBundle } from '../lib/tgImport'
import { applyKnownWeightFixes } from '../lib/weightCleanup'
import { ensureAuth, removeDoc, subscribeUserData, upsertDoc } from '../storage/cloudSync'
import { emptyAppData, loadLocalData, saveLocalData } from '../storage/localStore'
import type {
  AppData,
  CareDayEntry,
  CareProduct,
  CareSkinTags,
  CareSlot,
  CareWeekday,
  FoodItem,
  MacroSet,
  Meal,
  MealItem,
  MealType,
  MeasurementEntry,
  MedDayEntry,
  PeriodStart,
  StepsEntry,
  WeightEntry,
} from '../types'

function yieldUi(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

/** Upload in small batches so the browser tab stays responsive. */
async function uploadInBatches<T>(
  items: T[],
  batchSize: number,
  fn: (item: T) => Promise<void>,
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const total = items.length
  let done = 0
  for (let i = 0; i < items.length; i += batchSize) {
    const chunk = items.slice(i, i + batchSize)
    await Promise.all(chunk.map((item) => fn(item)))
    done = Math.min(total, i + chunk.length)
    onProgress?.(done, total)
    await yieldUi()
  }
}

const CLOUD_KEYS: (keyof AppData)[] = [
  'foods',
  'meals',
  'weights',
  'measurements',
  'steps',
  'dayNotes',
  'periodStarts',
  'medDays',
  'careProducts',
  'careDays',
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
  /** Dates deleted this session — ignore / re-delete if a sync race resurrects them. */
  const suppressedMeasureDates = useRef(new Set<string>())
  /** Food/recipe ids deleted this session — same protection against snapshot races. */
  const suppressedFoodIds = useRef(new Set<string>())
  const careProductsSeedStarted = useRef(false)

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
        careProductsSeedStarted.current = false
        suppressedFoodIds.current = new Set()
        suppressedMeasureDates.current = new Set()
        try {
          localStorage.removeItem(SEED_CARE_PRODUCTS_KEY)
        } catch {
          /* ignore */
        }
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
                const toUpload =
                  key === 'measurements'
                    ? (localItems as MeasurementEntry[]).filter(
                        (item) => !suppressedMeasureDates.current.has(item.date),
                      )
                    : key === 'foods'
                      ? localItems.filter((item) => !suppressedFoodIds.current.has(item.id))
                      : localItems
                void Promise.all(
                  toUpload.map((item) =>
                    upsertDoc(authUser.uid, key, item.id, {
                      ...item,
                    } as Record<string, unknown>),
                  ),
                )
                continue
              }
              cloudHydrated.current.add(key)
              if (key === 'periodStarts') {
                const { kept, droppedIds } = dedupePeriodStarts(
                  cloudItems as PeriodStart[],
                )
                Object.assign(next, { periodStarts: kept })
                if (droppedIds.length) {
                  void Promise.all(
                    droppedIds.map((id) => removeDoc(authUser.uid, 'periodStarts', id)),
                  )
                }
              } else if (key === 'measurements') {
                const cloudRaw = cloudItems as MeasurementEntry[]
                for (const m of cloudRaw) {
                  if (suppressedMeasureDates.current.has(m.date)) {
                    void removeDoc(authUser.uid, 'measurements', m.id)
                  }
                }
                const filtered = cloudRaw.filter(
                  (m) => !suppressedMeasureDates.current.has(m.date),
                )
                const { kept, droppedIds } = dedupeMeasurements(filtered)
                Object.assign(next, { measurements: kept })
                if (droppedIds.length) {
                  void Promise.all(
                    droppedIds.map((id) => removeDoc(authUser.uid, 'measurements', id)),
                  )
                }
              } else if (key === 'foods') {
                const cloudRaw = cloudItems as FoodItem[]
                for (const f of cloudRaw) {
                  if (suppressedFoodIds.current.has(f.id)) {
                    void removeDoc(authUser.uid, 'foods', f.id)
                  }
                }
                Object.assign(next, {
                  foods: cloudRaw.filter((f) => !suppressedFoodIds.current.has(f.id)),
                })
              } else {
                Object.assign(next, { [key]: cloudItems })
              }
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
            // During email login, auth briefly becomes null — do NOT create a guest
            // or it can win the race and kick the logged-in user back out.
            if (isAnonymousSuppressed()) return
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
      const brand = input.brand?.trim()
      const portionRaw = input.portionGrams
      const portionGrams =
        portionRaw != null && Number.isFinite(portionRaw) && portionRaw > 0 && portionRaw <= 5000
          ? Math.round(portionRaw * 10) / 10
          : undefined
      const id = input.id ?? newId()
      suppressedFoodIds.current.delete(id)
      const item: FoodItem = {
        id,
        name,
        aliases: generateAliases(name),
        per100g,
        kind: input.kind ?? (input.recipe ? 'dish' : 'ingredient'),
        updatedAt: Date.now(),
        ...(input.recipe ? { recipe: input.recipe } : {}),
        ...(brand ? { brand } : {}),
        ...(portionGrams != null ? { portionGrams } : {}),
      }
      if (useCloud && uid) {
        // merge:true keeps stale fields unless we explicitly clear them
        const recipe = item.recipe
        await upsertDoc(uid, 'foods', item.id, {
          ...item,
          place: null, // legacy field retired → brand
          brand: brand || null,
          portionGrams: portionGrams ?? null,
          recipe: recipe
            ? {
                ...recipe,
                notes: recipe.notes ?? null,
                sourceText: recipe.sourceText ?? null,
              }
            : null,
        })
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
      suppressedFoodIds.current.add(id)
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

  const deleteWeight = useCallback(
    async (id: string) => {
      if (useCloud && uid) await removeDoc(uid, 'weights', id)
      persistLocal((prev) => ({
        ...prev,
        weights: prev.weights.filter((w) => w.id !== id),
      }))
    },
    [persistLocal, uid, useCloud],
  )

  const deleteMeasurement = useCallback(
    async (id: string) => {
      const match = data.measurements.find((m) => m.id === id)
      const date = match?.date
      if (date) suppressedMeasureDates.current.add(date)
      const ids = date
        ? data.measurements.filter((m) => m.date === date).map((m) => m.id)
        : [id]
      if (useCloud && uid) {
        await Promise.all(ids.map((docId) => removeDoc(uid, 'measurements', docId)))
      }
      persistLocal((prev) => ({
        ...prev,
        measurements: date
          ? prev.measurements.filter((m) => m.date !== date)
          : prev.measurements.filter((m) => m.id !== id),
      }))
    },
    [data.measurements, persistLocal, uid, useCloud],
  )

  // Fix known Telegram typo weights (59.8→65.8, 55.7→65.7) in local + cloud.
  useEffect(() => {
    if (!ready) return
    const { changed } = applyKnownWeightFixes(data.weights)
    if (!changed.length) return
    let cancelled = false
    void (async () => {
      if (useCloud && uid) {
        for (const entry of changed) {
          if (cancelled) return
          await upsertDoc(uid, 'weights', entry.id, { ...entry })
        }
      }
      if (cancelled) return
      persistLocal((prev) => {
        const again = applyKnownWeightFixes(prev.weights)
        return again.changed.length ? { ...prev, weights: again.weights } : prev
      })
    })()
    return () => {
      cancelled = true
    }
  }, [ready, data.weights, persistLocal, uid, useCloud])

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
      const sameDate = data.measurements.filter((m) => m.date === input.date)
      const existing = sameDate[0]
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
      suppressedMeasureDates.current.delete(entry.date)
      const staleIds = sameDate.map((m) => m.id).filter((id) => id !== entry.id)
      if (useCloud && uid) {
        await upsertDoc(uid, 'measurements', entry.id, { ...entry })
        if (staleIds.length) {
          await Promise.all(staleIds.map((id) => removeDoc(uid, 'measurements', id)))
        }
      }
      persistLocal((prev) => ({
        ...prev,
        measurements: [...prev.measurements.filter((m) => m.date !== entry.date), entry],
      }))
      return entry
    },
    [data.measurements, persistLocal, uid, useCloud],
  )

  const saveDayNote = useCallback(
    async (input: {
      date: string
      /** Full journal draft — preferred path. */
      draft?: DayJournalDraft
      /** Legacy one-shot text when `draft` is omitted. */
      text?: string
      question?: string
    }) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error('Некорректная дата')
      const existing = (data.dayNotes ?? []).find((n) => n.date === input.date)

      let draft: DayJournalDraft
      if (input.draft) {
        draft = input.draft
      } else if (input.text != null) {
        draft = existing ? migrateLegacyNote(existing) : emptyJournalDraft()
        const line = input.text.trim()
        if (line) draft = { ...draft, highlights: [line] }
        else draft = emptyJournalDraft()
      } else {
        draft = existing ? migrateLegacyNote(existing) : emptyJournalDraft()
      }

      if (isJournalDraftEmpty(draft)) {
        if (existing && useCloud && uid) await removeDoc(uid, 'dayNotes', existing.id)
        persistLocal((prev) => ({
          ...prev,
          dayNotes: (prev.dayNotes ?? []).filter((n) => n.date !== input.date),
        }))
        return null
      }

      const fields = draftToNoteFields(draft)
      const now = Date.now()
      const entry = sanitizeDayNote({
        id: existing?.id ?? newId(),
        date: input.date,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        ...fields,
        ...(input.question || existing?.question
          ? { question: (input.question ?? existing?.question ?? '').trim().slice(0, 200) }
          : {}),
      })
      if (!entry) return null

      if (useCloud && uid) await upsertDoc(uid, 'dayNotes', entry.id, { ...entry })
      persistLocal((prev) => ({
        ...prev,
        dayNotes: [...(prev.dayNotes ?? []).filter((n) => n.date !== entry.date), entry],
      }))
      return entry
    },
    [data.dayNotes, persistLocal, uid, useCloud],
  )

  const saveMedCheck = useCallback(
    async (input: { date: string; dose: MedDoseKey; taken: boolean }) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error('Некорректная дата')
      const existing = (data.medDays ?? []).find((m) => m.date === input.date)
      const field = MED_DOSE_AT_FIELD[input.dose]
      const now = Date.now()
      const at = new Date().toISOString()

      const doses = {
        ironAt: existing?.ironAt,
        mgBreakfastAt: existing?.mgBreakfastAt,
        mgLunchAt: existing?.mgLunchAt,
        mgDinnerAt: existing?.mgDinnerAt,
      }
      if (input.taken) doses[field] = at
      else delete doses[field]

      const cleaned: MedDayEntry = {
        id: existing?.id ?? newId(),
        date: input.date,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        ...(doses.ironAt ? { ironAt: doses.ironAt } : {}),
        ...(doses.mgBreakfastAt ? { mgBreakfastAt: doses.mgBreakfastAt } : {}),
        ...(doses.mgLunchAt ? { mgLunchAt: doses.mgLunchAt } : {}),
        ...(doses.mgDinnerAt ? { mgDinnerAt: doses.mgDinnerAt } : {}),
      }

      if (isMedDayEmpty(cleaned)) {
        if (existing && useCloud && uid) await removeDoc(uid, 'medDays', existing.id)
        persistLocal((prev) => ({
          ...prev,
          medDays: (prev.medDays ?? []).filter((m) => m.date !== input.date),
        }))
        return null
      }

      if (useCloud && uid) await upsertDoc(uid, 'medDays', cleaned.id, { ...cleaned })
      persistLocal((prev) => ({
        ...prev,
        medDays: [...(prev.medDays ?? []).filter((m) => m.date !== cleaned.date), cleaned],
      }))
      return cleaned
    },
    [data.medDays, persistLocal, uid, useCloud],
  )

  const savePeriodStart = useCallback(
    async (date: string) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Некорректная дата')

      // Local-first + dedupe by date — cloud snapshot must not append a second copy.
      const existing = data.periodStarts.find((p) => p.date === date)
      if (existing) return existing

      const entry: PeriodStart = { id: newId(), date, createdAt: Date.now() }
      const wrote = { ok: false }
      persistLocal((prev) => {
        if (prev.periodStarts.some((p) => p.date === date)) return prev
        wrote.ok = true
        return { ...prev, periodStarts: [...prev.periodStarts, entry] }
      })
      if (wrote.ok && useCloud && uid) {
        await upsertDoc(uid, 'periodStarts', entry.id, { ...entry })
      }
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

  // Collapse accidental duplicate period starts left by an older sync race.
  useEffect(() => {
    if (!ready) return
    const { kept, droppedIds } = dedupePeriodStarts(data.periodStarts)
    if (kept.length === data.periodStarts.length && droppedIds.length === 0) return
    void (async () => {
      if (useCloud && uid) {
        for (const id of droppedIds) {
          await removeDoc(uid, 'periodStarts', id)
        }
      }
      persistLocal((prev) => {
        const again = dedupePeriodStarts(prev.periodStarts)
        if (again.kept.length === prev.periodStarts.length) return prev
        return { ...prev, periodStarts: again.kept }
      })
    })()
  }, [ready, data.periodStarts, persistLocal, uid, useCloud])

  // Same for measurements: one entry per date; remove cloud orphans.
  useEffect(() => {
    if (!ready) return
    const { kept, droppedIds } = dedupeMeasurements(data.measurements)
    if (kept.length === data.measurements.length && droppedIds.length === 0) return
    void (async () => {
      if (useCloud && uid) {
        for (const id of droppedIds) {
          await removeDoc(uid, 'measurements', id)
        }
      }
      persistLocal((prev) => {
        const again = dedupeMeasurements(prev.measurements)
        if (again.kept.length === prev.measurements.length) return prev
        return { ...prev, measurements: again.kept }
      })
    })()
  }, [ready, data.measurements, persistLocal, uid, useCloud])

  // Seed / refresh canonical care products (v3: Anthelios SPF, evening thermal→toner, BHA pause).
  useEffect(() => {
    if (!ready) return
    if (careProductsSeedStarted.current) return
    if (hasSeededCareProducts() && (data.careProducts ?? []).length > 0) return
    careProductsSeedStarted.current = true
    const seeded = buildSeedCareProducts()
    const seedIds = new Set(seeded.map((p) => p.id))
    const retired = new Set<string>(RETIRED_CARE_PRODUCT_IDS)
    markSeededCareProducts()
    void (async () => {
      const customKeep = (data.careProducts ?? []).filter(
        (p) => !seedIds.has(p.id) && !retired.has(p.id),
      )
      const next = [...seeded, ...customKeep]
      if (useCloud && uid) {
        await Promise.all([
          ...seeded.map((p) => upsertDoc(uid, 'careProducts', p.id, { ...p })),
          ...[...retired].map((id) => removeDoc(uid, 'careProducts', id)),
        ])
      }
      persistLocal((prev) => ({ ...prev, careProducts: next }))
    })()
  }, [ready, data.careProducts, persistLocal, uid, useCloud])

  const saveCareProduct = useCallback(
    async (
      input: Omit<CareProduct, 'id' | 'createdAt' | 'updatedAt'> & {
        id?: string
        createdAt?: number
      },
    ) => {
      const name = input.name.trim()
      if (!name) throw new Error('Укажите название средства')
      const slots = [...new Set(input.slots)].filter(
        (s): s is CareSlot => s === 'morning' || s === 'evening',
      )
      if (!slots.length) throw new Error('Выберите утро и/или вечер')
      let days: CareWeekday[] | 'every' = 'every'
      if (input.days !== 'every') {
        const list = [...new Set(input.days)].filter(
          (d): d is CareWeekday =>
            d === 'mon' ||
            d === 'tue' ||
            d === 'wed' ||
            d === 'thu' ||
            d === 'fri' ||
            d === 'sat' ||
            d === 'sun',
        )
        days = list.length ? list : 'every'
      }
      const how = input.how?.trim()
      const now = Date.now()
      const existing = input.id
        ? (data.careProducts ?? []).find((p) => p.id === input.id)
        : undefined
      const item: CareProduct = {
        id: input.id ?? newId(),
        name,
        slots,
        days,
        sortOrder: Number.isFinite(input.sortOrder) ? input.sortOrder : now,
        createdAt: existing?.createdAt ?? input.createdAt ?? now,
        updatedAt: now,
        ...(how ? { how } : {}),
        ...(input.archived ? { archived: true } : {}),
      }
      if (useCloud && uid) {
        await upsertDoc(uid, 'careProducts', item.id, {
          ...item,
          how: how || null,
          archived: item.archived === true ? true : null,
        })
      }
      persistLocal((prev) => ({
        ...prev,
        careProducts: [
          ...(prev.careProducts ?? []).filter((p) => p.id !== item.id),
          item,
        ],
      }))
      return item
    },
    [data.careProducts, persistLocal, uid, useCloud],
  )

  const archiveCareProduct = useCallback(
    async (id: string, archived = true) => {
      const existing = (data.careProducts ?? []).find((p) => p.id === id)
      if (!existing) throw new Error('Средство не найдено')
      return saveCareProduct({
        ...existing,
        archived: archived || undefined,
      })
    },
    [data.careProducts, saveCareProduct],
  )

  const persistCareDay = useCallback(
    async (draft: CareDayEntry) => {
      const cleaned: CareDayEntry = {
        id: draft.id,
        date: draft.date,
        morning: [...new Set(draft.morning)],
        evening: [...new Set(draft.evening)],
        createdAt: draft.createdAt,
        updatedAt: Date.now(),
        ...(draft.skin && Object.keys(draft.skin).length ? { skin: draft.skin } : {}),
        ...(draft.note?.trim() ? { note: draft.note.trim() } : {}),
      }

      if (isCareDayEmpty(cleaned)) {
        if (useCloud && uid) await removeDoc(uid, 'careDays', cleaned.id)
        persistLocal((prev) => ({
          ...prev,
          careDays: (prev.careDays ?? []).filter((d) => d.date !== cleaned.date),
        }))
        return null
      }

      if (useCloud && uid) await upsertDoc(uid, 'careDays', cleaned.id, { ...cleaned })
      persistLocal((prev) => ({
        ...prev,
        careDays: [
          ...(prev.careDays ?? []).filter((d) => d.date !== cleaned.date),
          cleaned,
        ],
      }))
      return cleaned
    },
    [persistLocal, uid, useCloud],
  )

  const toggleCareProductCheck = useCallback(
    async (input: { date: string; slot: CareSlot; productId: string }) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error('Некорректная дата')
      const existing = (data.careDays ?? []).find((d) => d.date === input.date)
      const now = Date.now()
      const morning = [...(existing?.morning ?? [])]
      const evening = [...(existing?.evening ?? [])]
      const list = input.slot === 'morning' ? morning : evening
      const idx = list.indexOf(input.productId)
      if (idx >= 0) list.splice(idx, 1)
      else list.push(input.productId)

      return persistCareDay({
        id: existing?.id ?? newId(),
        date: input.date,
        morning,
        evening,
        skin: existing?.skin,
        note: existing?.note,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      })
    },
    [data.careDays, persistCareDay],
  )

  const setCareSlotChecks = useCallback(
    async (input: { date: string; slot: CareSlot; productIds: string[] }) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error('Некорректная дата')
      const existing = (data.careDays ?? []).find((d) => d.date === input.date)
      const now = Date.now()
      const ids = [...new Set(input.productIds)]
      return persistCareDay({
        id: existing?.id ?? newId(),
        date: input.date,
        morning: input.slot === 'morning' ? ids : [...(existing?.morning ?? [])],
        evening: input.slot === 'evening' ? ids : [...(existing?.evening ?? [])],
        skin: existing?.skin,
        note: existing?.note,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      })
    },
    [data.careDays, persistCareDay],
  )

  const saveCareDaySkin = useCallback(
    async (input: { date: string; skin?: CareSkinTags; note?: string | null }) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error('Некорректная дата')
      const existing = (data.careDays ?? []).find((d) => d.date === input.date)
      const now = Date.now()
      const note =
        input.note === undefined ? existing?.note : input.note?.trim() || undefined
      const skin =
        input.skin === undefined
          ? existing?.skin
          : input.skin && Object.keys(input.skin).length
            ? input.skin
            : undefined
      return persistCareDay({
        id: existing?.id ?? newId(),
        date: input.date,
        morning: [...(existing?.morning ?? [])],
        evening: [...(existing?.evening ?? [])],
        ...(skin ? { skin } : {}),
        ...(note ? { note } : {}),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      })
    },
    [data.careDays, persistCareDay],
  )

  const resetLocal = useCallback(() => {
    const empty = emptyAppData()
    careProductsSeedStarted.current = false
    try {
      localStorage.removeItem(SEED_CARE_PRODUCTS_KEY)
    } catch {
      /* ignore */
    }
    saveLocalData(empty)
    setData(empty)
  }, [])

  /** Merge Telegram export JSON (meals + weights) into local + cloud. */
  const importDiaryBundle = useCallback(
    async (
      raw: unknown,
      onProgress?: (msg: string) => void,
    ) => {
      const { meals, weights, replaceByDate } = parseTelegramImportBundle(raw)
      const mealIds = new Set(meals.map((m) => m.id))
      const weightDates = new Set(weights.map((w) => w.date))
      const replaceDates = replaceByDate
        ? new Set(meals.map((m) => m.date))
        : null
      const mealsToRemove = replaceDates
        ? data.meals.filter((m) => replaceDates.has(m.date) && !mealIds.has(m.id))
        : []

      // Prefer stable import ids; keep local id only when same id already exists.
      const mealsToSave = meals.map((m) => {
        const existing = data.meals.find((x) => x.id === m.id)
        return existing ? { ...m, createdAt: existing.createdAt } : m
      })
      const weightsToSave = weights.map((w) => {
        const existing = data.weights.find((x) => x.date === w.date)
        return existing ? { ...w, id: existing.id, createdAt: existing.createdAt } : w
      })

      // Local first — if the tab dies mid-upload, data is still on the device.
      onProgress?.('Сохраняю на устройстве…')
      persistLocal((prev) => ({
        ...prev,
        meals: [
          ...prev.meals.filter((m) =>
            replaceDates ? !replaceDates.has(m.date) : !mealIds.has(m.id),
          ),
          ...mealsToSave,
        ],
        weights: [
          ...prev.weights.filter((w) => !weightDates.has(w.date)),
          ...weightsToSave,
        ],
      }))
      await yieldUi()

      if (useCloud && uid) {
        if (mealsToRemove.length) {
          onProgress?.(`Чищу старые записи 0/${mealsToRemove.length}…`)
          await uploadInBatches(
            mealsToRemove,
            3,
            async (meal) => {
              await removeDoc(uid, 'meals', meal.id)
            },
            (done) => onProgress?.(`Чищу старые записи ${done}/${mealsToRemove.length}…`),
          )
        }
        const cloudTotal = mealsToSave.length + weightsToSave.length
        onProgress?.(`В облако 0/${cloudTotal}…`)
        await uploadInBatches(
          mealsToSave,
          3,
          async (meal) => {
            await upsertDoc(uid, 'meals', meal.id, { ...meal })
          },
          (done) => onProgress?.(`В облако ${done}/${cloudTotal}…`),
        )
        await uploadInBatches(
          weightsToSave,
          3,
          async (entry) => {
            await upsertDoc(uid, 'weights', entry.id, { ...entry })
          },
          (done) =>
            onProgress?.(
              `В облако ${mealsToSave.length + done}/${cloudTotal}…`,
            ),
        )
      }

      return { meals: mealsToSave.length, weights: weightsToSave.length }
    },
    [data.meals, data.weights, persistLocal, uid, useCloud],
  )

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
    resetLocal,
    importDiaryBundle,
  }
}
