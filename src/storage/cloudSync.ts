import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  deleteDoc,
  type Unsubscribe,
} from 'firebase/firestore'
import { onAuthStateChanged, signInAnonymously, type User } from 'firebase/auth'
import { getFirebaseAuth, getFirebaseDb, isFirebaseConfigured } from '../firebase'
import type {
  AppData,
  FoodItem,
  Meal,
  MeasurementEntry,
  StepsEntry,
  WeightEntry,
} from '../types'

export async function ensureAuth(): Promise<User | null> {
  if (!isFirebaseConfigured()) return null
  const auth = getFirebaseAuth()
  if (auth.currentUser) return auth.currentUser
  return new Promise((resolve, reject) => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      unsub()
      if (user) {
        resolve(user)
        return
      }
      try {
        const cred = await signInAnonymously(auth)
        resolve(cred.user)
      } catch (err) {
        reject(err)
      }
    })
  })
}

/** Top-level collection in kid-sheduler (alongside families / tomSawyerFamilies). */
export const PLANER_COLLECTION = 'planer'

function planerCol(uid: string, name: string) {
  return collection(getFirebaseDb(), PLANER_COLLECTION, uid, name)
}

export type CloudHandlers = {
  onData: (partial: Partial<AppData>) => void
  onError?: (err: unknown) => void
}

export function subscribeUserData(uid: string, handlers: CloudHandlers): Unsubscribe {
  const unsubs: Unsubscribe[] = []

  const watch = <T extends { id: string }>(
    colName: string,
    key: keyof AppData,
    map: (id: string, data: Record<string, unknown>) => T,
  ) => {
    unsubs.push(
      onSnapshot(
        planerCol(uid, colName),
        (snap) => {
          const items = snap.docs.map((d) => map(d.id, d.data() as Record<string, unknown>))
          handlers.onData({ [key]: items } as Partial<AppData>)
        },
        (err) => handlers.onError?.(err),
      ),
    )
  }

  watch<FoodItem>('foods', 'foods', (id, data) => ({
    id,
    name: String(data.name ?? ''),
    aliases: Array.isArray(data.aliases) ? (data.aliases as string[]) : [],
    per100g: {
      kcal: Number(data.per100g && (data.per100g as { kcal: number }).kcal) || 0,
      protein: Number(data.per100g && (data.per100g as { protein: number }).protein) || 0,
      fat: Number(data.per100g && (data.per100g as { fat: number }).fat) || 0,
      carbs: Number(data.per100g && (data.per100g as { carbs: number }).carbs) || 0,
    },
    kind: data.kind === 'dish' ? 'dish' : 'ingredient',
    recipe: data.recipe as FoodItem['recipe'],
    updatedAt: Number(data.updatedAt) || Date.now(),
  }))

  watch<Meal>('meals', 'meals', (id, data) => ({
    id,
    date: String(data.date ?? ''),
    mealType: (data.mealType as Meal['mealType']) ?? 'snack',
    rawText: String(data.rawText ?? ''),
    items: Array.isArray(data.items) ? (data.items as Meal['items']) : [],
    totals: (data.totals as Meal['totals']) ?? { kcal: 0, protein: 0, fat: 0, carbs: 0 },
    isApproximate: Boolean(data.isApproximate),
    eatingOut: Boolean(data.eatingOut),
    createdAt: Number(data.createdAt) || Date.now(),
  }))

  watch<WeightEntry>('weights', 'weights', (id, data) => ({
    id,
    date: String(data.date ?? ''),
    kg: Number(data.kg) || 0,
    createdAt: Number(data.createdAt) || Date.now(),
  }))

  watch<MeasurementEntry>('measurements', 'measurements', (id, data) => ({
    id,
    date: String(data.date ?? ''),
    chest: data.chest != null ? Number(data.chest) : undefined,
    waist: data.waist != null ? Number(data.waist) : undefined,
    belly: data.belly != null ? Number(data.belly) : undefined,
    hips: data.hips != null ? Number(data.hips) : undefined,
    thigh: data.thigh != null ? Number(data.thigh) : undefined,
    bicep:
      data.bicep != null
        ? Number(data.bicep)
        : data.arm != null
          ? Number(data.arm)
          : undefined,
    createdAt: Number(data.createdAt) || Date.now(),
  }))

  watch<StepsEntry>('steps', 'steps', (id, data) => ({
    id,
    date: String(data.date ?? ''),
    count: Number(data.count) || 0,
    createdAt: Number(data.createdAt) || Date.now(),
  }))

  return () => {
    for (const u of unsubs) u()
  }
}

export async function upsertDoc(
  uid: string,
  colName: string,
  id: string,
  data: Record<string, unknown>,
): Promise<void> {
  await setDoc(doc(planerCol(uid, colName), id), data, { merge: true })
}

export async function removeDoc(uid: string, colName: string, id: string): Promise<void> {
  await deleteDoc(doc(planerCol(uid, colName), id))
}
