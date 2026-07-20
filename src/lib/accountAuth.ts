import {
  EmailAuthProvider,
  createUserWithEmailAndPassword,
  linkWithCredential,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
  type Unsubscribe,
} from 'firebase/auth'
import { getFirebaseAuth, isFirebaseConfigured } from '../firebase'
import { ensureAuth } from '../storage/cloudSync'

export function watchAuth(onUser: (user: User | null) => void): Unsubscribe {
  if (!isFirebaseConfigured()) {
    onUser(null)
    return () => {}
  }
  return onAuthStateChanged(getFirebaseAuth(), onUser)
}

export function authAccountLabel(user: User | null): string {
  if (!user) return 'Локально'
  if (user.isAnonymous) return 'Гость (устройство)'
  return user.email?.trim() || 'Аккаунт'
}

export function isLinkedAccount(user: User | null): boolean {
  return Boolean(user && !user.isAnonymous)
}

/** Create account and keep current anonymous uid (data stays). */
export async function registerWithEmail(email: string, password: string): Promise<User> {
  if (!isFirebaseConfigured()) throw new Error('Firebase не настроен')
  const auth = getFirebaseAuth()
  const mail = email.trim()
  if (!mail || !mail.includes('@')) throw new Error('Укажите email')
  if (password.length < 6) throw new Error('Пароль от 6 символов')

  const current = auth.currentUser ?? (await ensureAuth())
  if (current?.isAnonymous) {
    const cred = EmailAuthProvider.credential(mail, password)
    const linked = await linkWithCredential(current, cred)
    return linked.user
  }
  if (current && !current.isAnonymous) {
    throw new Error('Уже вошли в аккаунт')
  }
  const created = await createUserWithEmailAndPassword(auth, mail, password)
  return created.user
}

/** Sign in to an existing account (switches uid — cloud data for that account). */
export async function loginWithEmail(email: string, password: string): Promise<User> {
  if (!isFirebaseConfigured()) throw new Error('Firebase не настроен')
  const auth = getFirebaseAuth()
  const mail = email.trim()
  if (!mail || !mail.includes('@')) throw new Error('Укажите email')
  if (!password) throw new Error('Укажите пароль')

  if (auth.currentUser) {
    await signOut(auth)
  }
  const res = await signInWithEmailAndPassword(auth, mail, password)
  return res.user
}

/** Sign out linked account and return to anonymous guest on this device. */
export async function logoutToGuest(): Promise<User | null> {
  if (!isFirebaseConfigured()) return null
  const auth = getFirebaseAuth()
  await signOut(auth)
  return ensureAuth()
}

export function mapAuthError(err: unknown): string {
  const code =
    err && typeof err === 'object' && 'code' in err
      ? String((err as { code?: string }).code)
      : ''
  if (code.includes('email-already-in-use')) {
    return 'Этот email уже занят — войдите в аккаунт'
  }
  if (code.includes('credential-already-in-use')) {
    return 'Этот email уже привязан к другому аккаунту'
  }
  if (code.includes('weak-password')) return 'Пароль слишком короткий'
  if (code.includes('invalid-email')) return 'Некорректный email'
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) {
    return 'Неверный email или пароль'
  }
  if (code.includes('requires-recent-login')) return 'Войдите ещё раз и повторите'
  if (code.includes('network-request-failed')) return 'Нет сети'
  return err instanceof Error ? err.message : 'Ошибка входа'
}
