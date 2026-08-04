import { describe, expect, it } from 'vitest'
import type { DayNote } from '../types'
import {
  buildDayNoteText,
  draftToNoteFields,
  emptyJournalDraft,
  isJournalDraftEmpty,
  listToText,
  migrateLegacyNote,
  textToList,
} from './dayJournal'

describe('dayJournal', () => {
  it('treats empty draft as empty', () => {
    expect(isJournalDraftEmpty(emptyJournalDraft())).toBe(true)
  })

  it('builds a text snapshot from structured fields', () => {
    const draft = emptyJournalDraft()
    draft.mood = 'good'
    draft.grateful = ['кофе', 'тишина']
    draft.highlights = ['прогулка']
    const text = buildDayNoteText(draft)
    expect(text).toMatch(/День: хорошо/)
    expect(text).toMatch(/Благодарю: кофе; тишина/)
    expect(text).toMatch(/События: прогулка/)
  })

  it('migrates legacy twitter text into highlights', () => {
    const note: DayNote = {
      id: '1',
      date: '2026-08-01',
      text: 'Был спокойный вечер',
      question: 'Ну что, как прошёл день?',
      createdAt: 1,
      updatedAt: 1,
    }
    const draft = migrateLegacyNote(note)
    expect(draft.highlights[0]).toBe('Был спокойный вечер')
    expect(draft.grateful).toEqual([])
  })

  it('draftToNoteFields omits empty arrays', () => {
    const draft = emptyJournalDraft()
    draft.kindness = 'написала маме'
    const fields = draftToNoteFields(draft)
    expect(fields.kindness).toBe('написала маме')
    expect(fields.grateful).toBeUndefined()
    expect(fields.text).toMatch(/Для других/)
  })

  it('round-trips list text', () => {
    expect(textToList('a\nb\n')).toEqual(['a', 'b', ''])
    expect(listToText(['a', 'b'])).toBe('a\nb')
  })
})
