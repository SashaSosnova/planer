import { useEffect, useMemo, useRef, useState } from 'react'
import { formatRuDayMonth } from '../lib/date'
import { dayPromptForDate } from '../lib/dayPrompts'
import { DAY_NOTE_MAX } from '../lib/sanitize'
import type { AppData, DayNote } from '../types'

type Props = {
  data: AppData
  onBack: () => void
  onSaveDayNote: (input: {
    date: string
    text: string
    question?: string
  }) => Promise<DayNote | null>
}

export function DiaryScreen({ data, onBack, onSaveDayNote }: Props) {
  const notes = useMemo(
    () =>
      [...(data.dayNotes ?? [])]
        .filter((n) => n.text.trim())
        .sort((a, b) => b.date.localeCompare(a.date)),
    [data.dayNotes],
  )

  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  const editing = notes.find((n) => n.id === editingId) ?? null

  useEffect(() => {
    if (!editingId) return
    const t = window.setTimeout(() => inputRef.current?.focus(), 40)
    return () => window.clearTimeout(t)
  }, [editingId])

  const startEdit = (note: DayNote) => {
    if (saving) return
    setEditingId(note.id)
    setDraft(note.text)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setDraft('')
  }

  const commitEdit = async () => {
    if (!editing || saving) return
    const text = draft.trim()
    if (text === editing.text.trim()) {
      cancelEdit()
      return
    }
    setSaving(true)
    try {
      await onSaveDayNote({
        date: editing.date,
        text,
        question: editing.question,
      })
      cancelEdit()
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="screen">
      <header className="screen-header">
        <button type="button" className="link-btn" onClick={onBack}>
          ← Назад
        </button>
        <h1>Дневник</h1>
      </header>

      {notes.length === 0 ? (
        <p className="muted">Пока пусто</p>
      ) : (
        <ul className="chat-diary">
          {notes.map((note) => {
            const isEditing = note.id === editingId
            return (
              <li key={note.id} className="chat-day">
                <p className="chat-day-label">{formatRuDayMonth(note.date)}</p>
                <div className="chat-row friend">
                  <p className="chat-bubble friend">
                    {note.question?.trim() || dayPromptForDate(note.date).question}
                  </p>
                </div>
                <div className="chat-row me">
                  {isEditing ? (
                    <textarea
                      ref={inputRef}
                      className="chat-bubble me chat-bubble-edit"
                      value={draft}
                      maxLength={DAY_NOTE_MAX}
                      rows={3}
                      disabled={saving}
                      aria-label="Редактировать ответ"
                      onChange={(e) => setDraft(e.target.value.slice(0, DAY_NOTE_MAX))}
                      onBlur={() => void commitEdit()}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          e.preventDefault()
                          cancelEdit()
                        }
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          ;(e.target as HTMLTextAreaElement).blur()
                        }
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className="chat-bubble me chat-bubble-btn"
                      onClick={() => startEdit(note)}
                    >
                      {note.text}
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
