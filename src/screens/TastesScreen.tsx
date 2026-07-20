import { useState } from 'react'
import type { TastePrefs } from '../lib/settings'

type Props = {
  tastePrefs: TastePrefs
  onBack: () => void
  onClearTasteVote: (title: string, list: 'likes' | 'dislikes' | 'canCook') => void
  onAddCanCook: (title: string) => void
}

export function TastesScreen({
  tastePrefs,
  onBack,
  onClearTasteVote,
  onAddCanCook,
}: Props) {
  const [cookDraft, setCookDraft] = useState('')

  const addCook = () => {
    const t = cookDraft.trim()
    if (!t) return
    onAddCanCook(t)
    setCookDraft('')
  }

  return (
    <section className="screen">
      <header className="screen-header">
        <button type="button" className="link-btn" onClick={onBack}>
          ← Назад
        </button>
        <h1>Вкусы</h1>
        <p className="muted">Лайки, запреты и что готовишь</p>
      </header>

      <div className="panel">
        <p className="muted small">Нравится</p>
        {tastePrefs.likes.length > 0 && (
          <div className="taste-chip-row">
            {tastePrefs.likes.map((title) => (
              <span key={`like-${title}`} className="taste-chip">
                {title}
                <button
                  type="button"
                  aria-label={`Убрать ${title}`}
                  onClick={() => onClearTasteVote(title, 'likes')}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="panel">
        <p className="muted small">Не предлагать</p>
        {tastePrefs.dislikes.length > 0 && (
          <div className="taste-chip-row">
            {tastePrefs.dislikes.map((title) => (
              <span key={`dis-${title}`} className="taste-chip">
                {title}
                <button
                  type="button"
                  aria-label={`Вернуть ${title}`}
                  onClick={() => onClearTasteVote(title, 'dislikes')}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="panel">
        <p className="muted small">Умею / люблю готовить</p>
        <div className="taste-chip-row">
          {tastePrefs.canCook.map((title) => (
            <span key={`cook-${title}`} className="taste-chip">
              {title}
              <button
                type="button"
                aria-label={`Убрать ${title}`}
                onClick={() => onClearTasteVote(title, 'canCook')}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="day-log-edit" style={{ marginTop: 8 }}>
          <input
            className="day-log-input"
            value={cookDraft}
            onChange={(e) => setCookDraft(e.target.value)}
            placeholder="например омлет"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addCook()
              }
            }}
          />
          <button type="button" className="primary-btn day-log-ok" onClick={addCook}>
            +
          </button>
        </div>
      </div>
    </section>
  )
}
