import { useState } from 'react'
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
}

export function AccountPanel({ user }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'register' | 'login'>('register')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

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
            <span>Пароль для Planer</span>
            <input
              type="password"
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="придумайте, от 6 символов"
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
      {error && <p className="form-msg error">{error}</p>}
      {ok && <p className="form-msg">{ok}</p>}
    </div>
  )
}
