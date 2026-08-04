import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { addDaysIso, formatRuDayMonth, todayIso } from '../lib/date'
import {
  DAY_JOURNAL_LINE_MAX,
  DAY_JOURNAL_LIST_MAX,
  draftFromNote,
  journalPreview,
  listToText,
  MOOD_OPTIONS,
  textToList,
  type DayJournalDraft,
} from '../lib/dayJournal'
import type { AppData, DayMood, DayNote } from '../types'

type Props = {
  data: AppData
  onBack: () => void
  onSaveDayNote: (input: {
    date: string
    draft?: DayJournalDraft
    text?: string
    question?: string
  }) => Promise<DayNote | null>
}

type SavePart = 'morning' | 'evening'

function morningSnapshot(d: DayJournalDraft) {
  return JSON.stringify({
    mood: d.mood ?? null,
    grateful: d.grateful.map((s) => s.trim()).filter(Boolean),
    greatDay: d.greatDay.trim(),
    affirmation: d.affirmation.trim(),
  })
}

function eveningSnapshot(d: DayJournalDraft) {
  return JSON.stringify({
    highlights: d.highlights.map((s) => s.trim()).filter(Boolean),
    kindness: d.kindness.trim(),
    betterTomorrow: d.betterTomorrow.trim(),
  })
}

function JournalList({
  label,
  values,
  onChange,
}: {
  label: string
  values: string[]
  onChange: (next: string[]) => void
}) {
  return (
    <div className="journal-field">
      <p className="journal-q">{label}</p>
      <textarea
        className="journal-input journal-list"
        value={listToText(values)}
        rows={Math.min(4, Math.max(3, values.length || 3))}
        aria-label={label}
        onChange={(e) => onChange(textToList(e.target.value))}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return
          const lines = textToList((e.target as HTMLTextAreaElement).value)
          if (lines.length >= DAY_JOURNAL_LIST_MAX) e.preventDefault()
        }}
      />
    </div>
  )
}

export function DiaryScreen({ data, onBack, onSaveDayNote }: Props) {
  const [date, setDate] = useState(() => todayIso())
  const note = useMemo(
    () => (data.dayNotes ?? []).find((n) => n.date === date) ?? null,
    [data.dayNotes, date],
  )
  const saved = useMemo(() => draftFromNote(note), [note])
  const [draft, setDraft] = useState<DayJournalDraft>(() => draftFromNote(note))
  const draftRef = useRef(draft)
  draftRef.current = draft
  const dateRef = useRef(date)
  dateRef.current = date

  const [saving, setSaving] = useState<SavePart | null>(null)
  const [savedFlash, setSavedFlash] = useState<SavePart | null>(null)
  const flashTimer = useRef(0)

  useEffect(() => {
    setDraft(draftFromNote(note))
    setSavedFlash(null)
  }, [note, date])

  useEffect(
    () => () => {
      if (flashTimer.current) window.clearTimeout(flashTimer.current)
    },
    [],
  )

  const morningDirty = morningSnapshot(draft) !== morningSnapshot(saved)
  const eveningDirty = eveningSnapshot(draft) !== eveningSnapshot(saved)
  const anyDirty = morningDirty || eveningDirty

  const history = useMemo(
    () =>
      [...(data.dayNotes ?? [])]
        .filter((n) => n.date !== date && (n.text.trim() || n.mood))
        .sort((a, b) => b.date.localeCompare(a.date)),
    [data.dayNotes, date],
  )

  const persist = useCallback(
    async (part: SavePart, override?: DayJournalDraft) => {
      setSaving(part)
      try {
        await onSaveDayNote({
          date: dateRef.current,
          draft: override ?? draftRef.current,
        })
        setSavedFlash(part)
        if (flashTimer.current) window.clearTimeout(flashTimer.current)
        flashTimer.current = window.setTimeout(() => setSavedFlash(null), 1800)
      } finally {
        setSaving(null)
      }
    },
    [onSaveDayNote],
  )

  const persistQuiet = useCallback(async () => {
    if (!anyDirty) return
    await onSaveDayNote({
      date: dateRef.current,
      draft: draftRef.current,
    })
  }, [anyDirty, onSaveDayNote])

  const patch = (partial: Partial<DayJournalDraft>) => {
    setDraft((prev) => {
      const next = { ...prev, ...partial }
      draftRef.current = next
      return next
    })
  }

  const setMood = (mood: DayMood) => {
    setDraft((prev) => {
      const next = {
        ...prev,
        mood: prev.mood === mood ? undefined : mood,
      }
      draftRef.current = next
      return next
    })
  }

  const shiftDay = async (delta: number) => {
    await persistQuiet()
    setDate((d) => addDaysIso(d, delta))
  }

  const handleBack = async () => {
    await persistQuiet()
    onBack()
  }

  return (
    <section className="screen diary-screen">
      <header className="screen-header">
        <button type="button" className="link-btn" onClick={() => void handleBack()}>
          ← Назад
        </button>
        <h1>Дневник</h1>
      </header>

      <div className="journal-date-nav">
        <button
          type="button"
          className="link-btn"
          onClick={() => void shiftDay(-1)}
          aria-label="Вчера"
        >
          ←
        </button>
        <strong>{formatRuDayMonth(date)}</strong>
        <button
          type="button"
          className="link-btn"
          onClick={() => void shiftDay(1)}
          aria-label="Завтра"
          disabled={date >= todayIso()}
        >
          →
        </button>
      </div>

      <div className="journal-card">
        <div className="journal-mood" role="group" aria-label="Как день">
          {MOOD_OPTIONS.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`journal-mood-btn${draft.mood === m.id ? ' active' : ''}`}
              onClick={() => setMood(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>

        <section className="journal-section">
          <h2 className="journal-section-title">Утро</h2>
          <JournalList
            label="Я благодарю за то, что…"
            values={draft.grateful}
            onChange={(grateful) => patch({ grateful })}
          />
          <div className="journal-field">
            <p className="journal-q">Что сделает сегодняшний день замечательным?</p>
            <input
              type="text"
              className="journal-input"
              value={draft.greatDay}
              maxLength={DAY_JOURNAL_LINE_MAX}
              onChange={(e) =>
                patch({ greatDay: e.target.value.slice(0, DAY_JOURNAL_LINE_MAX) })
              }
            />
          </div>
          <div className="journal-field">
            <p className="journal-q">Положительная установка</p>
            <input
              type="text"
              className="journal-input"
              value={draft.affirmation}
              maxLength={DAY_JOURNAL_LINE_MAX}
              onChange={(e) =>
                patch({ affirmation: e.target.value.slice(0, DAY_JOURNAL_LINE_MAX) })
              }
            />
          </div>
          <div className="journal-save-row">
            <button
              type="button"
              className="primary-btn"
              disabled={!morningDirty || saving != null}
              onClick={() => void persist('morning')}
            >
              {saving === 'morning' ? 'Сохраняю…' : 'Сохранить утро'}
            </button>
            {savedFlash === 'morning' && !morningDirty && (
              <span className="journal-saved muted small">Сохранено</span>
            )}
          </div>
        </section>

        <section className="journal-section">
          <h2 className="journal-section-title">Вечер</h2>
          <JournalList
            label="Прекрасные события, которые произошли со мной сегодня"
            values={draft.highlights}
            onChange={(highlights) => patch({ highlights })}
          />
          <div className="journal-field">
            <p className="journal-q">Что сегодня было сделано хорошего для других?</p>
            <input
              type="text"
              className="journal-input"
              value={draft.kindness}
              maxLength={DAY_JOURNAL_LINE_MAX}
              onChange={(e) =>
                patch({ kindness: e.target.value.slice(0, DAY_JOURNAL_LINE_MAX) })
              }
            />
          </div>
          <div className="journal-field">
            <p className="journal-q">Что я смогу сделать завтра лучше?</p>
            <input
              type="text"
              className="journal-input"
              value={draft.betterTomorrow}
              maxLength={DAY_JOURNAL_LINE_MAX}
              onChange={(e) =>
                patch({
                  betterTomorrow: e.target.value.slice(0, DAY_JOURNAL_LINE_MAX),
                })
              }
            />
          </div>
          <div className="journal-save-row">
            <button
              type="button"
              className="primary-btn"
              disabled={!eveningDirty || saving != null}
              onClick={() => void persist('evening')}
            >
              {saving === 'evening' ? 'Сохраняю…' : 'Сохранить вечер'}
            </button>
            {savedFlash === 'evening' && !eveningDirty && (
              <span className="journal-saved muted small">Сохранено</span>
            )}
          </div>
        </section>
      </div>

      {history.length > 0 && (
        <div className="journal-history">
          <h2 className="journal-section-title">Раньше</h2>
          <ul className="journal-history-list">
            {history.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  className="journal-history-item"
                  onClick={() => {
                    void (async () => {
                      await persistQuiet()
                      setDate(n.date)
                    })()
                  }}
                >
                  <span className="journal-history-date">{formatRuDayMonth(n.date)}</span>
                  <span className="journal-history-preview muted">
                    {journalPreview(n)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
