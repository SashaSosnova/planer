import { useRef, useState } from 'react'
import type { User } from 'firebase/auth'
import {
  authAccountLabel,
  isLinkedAccount,
  loginWithEmail,
  logoutToGuest,
  mapAuthError,
  registerWithEmail,
} from '../lib/accountAuth'
import { isFirebaseConfigured } from '../firebase'

type Props = {
  user: User | null
  onImportDiary?: (
    raw: unknown,
    onProgress?: (msg: string) => void,
  ) => Promise<{ meals: number; weights: number }>
}

export function AccountPanel({ user, onImportDiary }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'register' | 'login'>('register')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  if (!isFirebaseConfigured()) {
    return (
      <div className="panel">
        <h2 className="subhead" style={{ marginTop: 0 }}>
          Аккаунт
        </h2>
        <p className="muted small">Firebase не настроен — данные только на устройстве.</p>
      </div>
    )
  }

  const linked = isLinkedAccount(user)

  const submit = async () => {
    setBusy(true)
    setError(null)
    setOk(null)
    try {
      if (mode === 'register') {
        await registerWithEmail(email, password)
        setOk('Аккаунт создан — данные в облаке под этим email')
      } else {
        await loginWithEmail(email, password)
        setOk('Вход выполнен')
      }
      setPassword('')
    } catch (err) {
      setError(mapAuthError(err))
    } finally {
      setBusy(false)
    }
  }

  const logout = async () => {
    setBusy(true)
    setError(null)
    setOk(null)
    try {
      await logoutToGuest()
      setOk('Вышли. На устройстве снова гостевой режим')
    } catch (err) {
      setError(mapAuthError(err))
    } finally {
      setBusy(false)
    }
  }

  const onPickImport = async (file: File | null) => {
    if (!file || !onImportDiary) return
    setBusy(true)
    setError(null)
    setOk('Читаю файл…')
    try {
      const text = await file.text()
      const raw = JSON.parse(text) as unknown
      const result = await onImportDiary(raw, (msg) => setOk(msg))
      setOk(`Готово: ${result.meals} приёмов, ${result.weights} замеров веса`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось импортировать')
      setOk(null)
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="panel">
      <h2 className="subhead" style={{ marginTop: 0 }}>
        Аккаунт
      </h2>
      <p className="muted small">
        Сейчас: <strong>{authAccountLabel(user)}</strong>
        {linked
          ? ' · данные в облаке, можно открыть на другом телефоне'
          : ' · пока только на этом устройстве. Ниже — аккаунт (email и пароль), чтобы не потерять данные'}
      </p>

      {linked ? (
        <button type="button" className="ghost-btn" disabled={busy} onClick={() => void logout()}>
          Выйти
        </button>
      ) : (
        <>
          <div className="meal-type-chips" role="group" aria-label="Режим аккаунта">
            <button
              type="button"
              className={`meal-type-chip${mode === 'register' ? ' active' : ''}`}
              onClick={() => setMode('register')}
            >
              Новый аккаунт
            </button>
            <button
              type="button"
              className={`meal-type-chip${mode === 'login' ? ' active' : ''}`}
              onClick={() => setMode('login')}
            >
              Уже есть
            </button>
          </div>
          <label className="field">
            <span>Ваш email</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="например name@gmail.com"
            />
          </label>
          <label className="field">
            <span>{mode === 'register' ? 'Придумайте пароль' : 'Пароль'}</span>
            <input
              type="password"
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'register' ? 'от 6 символов' : 'ваш пароль'}
            />
          </label>
          <button
            type="button"
            className="primary-btn"
            disabled={busy}
            onClick={() => void submit()}
          >
            {busy ? '…' : mode === 'register' ? 'Сохранить аккаунт' : 'Войти'}
          </button>
        </>
      )}
      {linked && onImportDiary && (
        <div style={{ marginTop: 14 }}>
          <p className="muted small" style={{ marginBottom: 8 }}>
            Импорт дневника из Telegram (JSON)
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => void onPickImport(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            className="ghost-btn"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            {busy ? 'Импорт…' : 'Выбрать файл'}
          </button>
        </div>
      )}
      {error && <p className="form-msg error">{error}</p>}
      {ok && <p className="form-msg">{ok}</p>}
    </div>
  )
}
