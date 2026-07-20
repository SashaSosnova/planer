import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  deleteDoc,
  type Unsubscribe,
} from 'firebase/firestore'
import { onAuthStateChanged, signInAnonymously, type User } from 'firebase/auth'
import { getFirebaseAuth, getFirebaseDb, isFirebaseConfigured } from '../firebase'
import {
  sanitizeDayNote,
  sanitizeFood,
  sanitizeMeal,
  sanitizeMeasurement,
  sanitizePeriodStart,
  sanitizeSteps,
  sanitizeWeight,
} from '../lib/sanitize'
import type { AppSettings } from '../lib/settings'
import type {
  AppData,
  DayNote,
  FoodItem,
  Meal,
  MeasurementEntry,
  PeriodStart,
  StepsEntry,
  WeightEntry,
} from '../types'

const SETTINGS_DOC = 'settings'

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
    map: (id: string, data: Record<string, unknown>) => T | null,
  ) => {
    unsubs.push(
      onSnapshot(
        planerCol(uid, colName),
        (snap) => {
          const items = snap.docs
            .map((d) => map(d.id, d.data() as Record<string, unknown>))
            .filter((x): x is T => x != null)
          handlers.onData({ [key]: items } as Partial<AppData>)
        },
        (err) => handlers.onError?.(err),
      ),
    )
  }

  watch<FoodItem>('foods', 'foods', (id, data) => sanitizeFood({ ...data, id }))
  watch<Meal>('meals', 'meals', (id, data) => sanitizeMeal({ ...data, id }))
  watch<WeightEntry>('weights', 'weights', (id, data) => sanitizeWeight({ ...data, id }))
  watch<MeasurementEntry>('measurements', 'measurements', (id, data) =>
    sanitizeMeasurement({ ...data, id }),
  )
  watch<StepsEntry>('steps', 'steps', (id, data) => sanitizeSteps({ ...data, id }))
  watch<DayNote>('dayNotes', 'dayNotes', (id, data) => sanitizeDayNote({ ...data, id }))
  watch<PeriodStart>('periodStarts', 'periodStarts', (id, data) =>
    sanitizePeriodStart({ ...data, id }),
  )

  return () => {
    for (const u of unsubs) u()
  }
}

/** Firestore rejects `undefined` field values — drop them before write. */
function stripUndefined(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripUndefined)
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue
      out[k] = stripUndefined(v)
    }
    return out
  }
  return value
}

export async function upsertDoc(
  uid: string,
  colName: string,
  id: string,
  data: Record<string, unknown>,
): Promise<void> {
  const clean = stripUndefined(data) as Record<string, unknown>
  await setDoc(doc(planerCol(uid, colName), id), clean, { merge: true })
}

export async function removeDoc(uid: string, colName: string, id: string): Promise<void> {
  await deleteDoc(doc(planerCol(uid, colName), id))
}

function settingsDocRef(uid: string) {
  return doc(getFirebaseDb(), PLANER_COLLECTION, uid, 'meta', SETTINGS_DOC)
}

export async function upsertSettings(uid: string, settings: AppSettings): Promise<void> {
  const clean = stripUndefined({ ...settings, updatedAt: Date.now() }) as Record<string, unknown>
  await setDoc(settingsDocRef(uid), clean, { merge: true })
}

export async function fetchSettings(uid: string): Promise<AppSettings | null> {
  const snap = await getDoc(settingsDocRef(uid))
  if (!snap.exists()) return null
  return snap.data() as AppSettings
}

/** Live settings doc; seed cloud from local once if empty. */
export function subscribeSettings(
  uid: string,
  handlers: {
    onSettings: (raw: Record<string, unknown> | null, meta: { fromCloud: boolean }) => void
    onError?: (err: unknown) => void
  },
): Unsubscribe {
  return onSnapshot(
    settingsDocRef(uid),
    (snap) => {
      if (!snap.exists()) {
        handlers.onSettings(null, { fromCloud: true })
        return
      }
      handlers.onSettings(snap.data() as Record<string, unknown>, { fromCloud: true })
    },
    (err) => handlers.onError?.(err),
  )
}
