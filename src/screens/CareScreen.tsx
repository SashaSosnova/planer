import { useMemo, useState } from 'react'
import {
  CARE_DAY_FLAGS,
  CARE_RULES,
  CARE_WEEKDAY_LONG,
  CARE_WEEKDAY_ORDER,
  CARE_WEEKDAY_SHORT,
} from '../lib/careRoutine'
import {
  activeCareProducts,
  careWeekdayFromIso,
  eveningTitleForWeekday,
  formatCareDaysLabel,
  formatCareSlotsLabel,
  productCheckedOnDay,
  productsForDaySlot,
  weekDatesContaining,
} from '../lib/careSchedule'
import {
  CARE_SKIN_DELTAS,
  CARE_SKIN_OPTIONS,
  CARE_SKIN_PROFILE,
  careSkinVerdict,
  formatCareSkinBrief,
  type CareSkinKey,
} from '../lib/careSkin'
import { addDaysIso, formatRuDate, todayIso } from '../lib/date'
import type {
  CareDayEntry,
  CareProduct,
  CareSkinDelta,
  CareSkinTags,
  CareSlot,
  CareWeekday,
} from '../types'

type Tab = 'today' | 'products' | 'summary' | 'rules'

type Props = {
  careProducts: CareProduct[]
  careDays: CareDayEntry[]
  onBack: () => void
  onToggleCheck: (input: {
    date: string
    slot: CareSlot
    productId: string
  }) => void | Promise<unknown>
  onSetSlotChecks: (input: {
    date: string
    slot: CareSlot
    productIds: string[]
  }) => void | Promise<unknown>
  onSaveSkin: (input: {
    date: string
    skin?: CareSkinTags
    note?: string | null
  }) => void | Promise<unknown>
  onSaveProduct: (
    input: Omit<CareProduct, 'id' | 'createdAt' | 'updatedAt'> & {
      id?: string
      createdAt?: number
    },
  ) => Promise<unknown>
  onArchiveProduct: (id: string, archived?: boolean) => Promise<unknown>
}

function FlagMark({ on }: { on: boolean }) {
  return <span className={on ? 'care-flag on' : 'care-flag'}>{on ? 'да' : '—'}</span>
}

function SlotChecklist({
  title,
  subtitle,
  slot,
  products,
  doneIds,
  onToggle,
  onMarkAll,
}: {
  title: string
  subtitle?: string
  slot: CareSlot
  products: CareProduct[]
  doneIds: string[]
  onToggle: (slot: CareSlot, productId: string) => void
  onMarkAll: (slot: CareSlot, productIds: string[]) => void
}) {
  const done = products.filter((p) => doneIds.includes(p.id)).length
  const allDone = products.length > 0 && done === products.length
  return (
    <div className="care-note">
      <div className="care-note-head">
        <h2>{title}</h2>
        <span className="muted small">
          {done}/{products.length}
        </span>
      </div>
      {subtitle && <p className="care-note-sub">{subtitle}</p>}
      {products.length > 0 && (
        <div className="care-slot-actions">
          <button
            type="button"
            className="link-btn"
            onClick={() =>
              onMarkAll(slot, allDone ? [] : products.map((p) => p.id))
            }
          >
            {allDone ? 'Снять все' : 'Отметить все'}
          </button>
        </div>
      )}
      <ul className="care-check-list">
        {products.map((p, i) => {
          const checked = doneIds.includes(p.id)
          return (
            <li key={`${slot}-${p.id}`}>
              <label className={`care-check${checked ? ' done' : ''}`}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(slot, p.id)}
                />
                <span className="care-check-num">{i + 1}</span>
                <span className="care-check-body">
                  <span className="care-check-text">{p.name}</span>
                  {p.how && <span className="care-check-how">{p.how}</span>}
                </span>
              </label>
            </li>
          )
        })}
      </ul>
      {products.length === 0 && (
        <p className="muted small" style={{ marginTop: 10 }}>
          Нет средств на этот слот.
        </p>
      )}
    </div>
  )
}

function SkinPanel({
  skin,
  note,
  onToggleLevel,
  onNoteBlur,
}: {
  skin: CareSkinTags | undefined
  note: string
  onToggleLevel: (key: CareSkinKey, value: CareSkinDelta) => void
  onNoteBlur: (text: string) => void
}) {
  const [draftNote, setDraftNote] = useState(note)
  const verdict = careSkinVerdict(skin)
  return (
    <div className="care-note">
      <div className="care-note-head">
        <h2>Чек кожи</h2>
      </div>
      <p className="care-note-sub">
        Вечером, лучше перед умыванием. «+» лучше вчера, «0» без изменений, «−» хуже. Повторный клик
        снимает отметку.
      </p>
      <p className="care-skin-profile muted small">{CARE_SKIN_PROFILE}</p>
      <div className="care-skin-groups">
        {CARE_SKIN_OPTIONS.map((group) => (
          <div key={group.key} className="care-skin-group">
            <p className="care-skin-label">{group.label}</p>
            <p className="care-skin-question muted small">{group.question}</p>
            <div className="care-skin-levels" role="group" aria-label={group.label}>
              {CARE_SKIN_DELTAS.map((level) => {
                const active = skin?.[group.key] === level.value
                return (
                  <button
                    key={level.value}
                    type="button"
                    className={`care-skin-chip care-skin-delta${
                      active ? ` active delta-${level.value === '+' ? 'up' : level.value === '-' ? 'down' : 'same'}` : ''
                    }`}
                    onClick={() => onToggleLevel(group.key, level.value)}
                  >
                    {level.label}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
      {verdict && <p className="care-skin-verdict">{verdict}</p>}
      <label className="care-note-field">
        <span className="muted small">Заметка дня</span>
        <textarea
          value={draftNote}
          rows={2}
          placeholder="Т-зона +, щёки 0, краснота −… и почему"
          onChange={(e) => setDraftNote(e.target.value)}
          onBlur={() => onNoteBlur(draftNote)}
        />
      </label>
    </div>
  )
}

type ProductDraft = {
  id?: string
  name: string
  slots: CareSlot[]
  days: CareWeekday[] | 'every'
  how: string
  sortOrder: number
}

function emptyProductDraft(sortOrder: number): ProductDraft {
  return {
    name: '',
    slots: ['evening'],
    days: 'every',
    how: '',
    sortOrder,
  }
}

function ProductEditor({
  draft,
  onChange,
  onSave,
  onCancel,
  busy,
}: {
  draft: ProductDraft
  onChange: (d: ProductDraft) => void
  onSave: () => void
  onCancel: () => void
  busy: boolean
}) {
  const toggleSlot = (slot: CareSlot) => {
    const has = draft.slots.includes(slot)
    const slots = has ? draft.slots.filter((s) => s !== slot) : [...draft.slots, slot]
    onChange({ ...draft, slots })
  }
  const toggleDay = (day: CareWeekday) => {
    if (draft.days === 'every') {
      onChange({ ...draft, days: [day] })
      return
    }
    const has = draft.days.includes(day)
    const days = has ? draft.days.filter((d) => d !== day) : [...draft.days, day]
    onChange({ ...draft, days: days.length ? days : 'every' })
  }
  return (
    <div className="care-note care-product-editor">
      <div className="care-note-head">
        <h2>{draft.id ? 'Редактировать' : 'Новое средство'}</h2>
      </div>
      <label className="care-note-field">
        <span className="muted small">Название</span>
        <input
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
          placeholder="Название"
        />
      </label>
      <div className="care-note-field">
        <span className="muted small">Слоты</span>
        <div className="care-skin-levels">
          <button
            type="button"
            className={`care-skin-chip${draft.slots.includes('morning') ? ' active' : ''}`}
            onClick={() => toggleSlot('morning')}
          >
            Утро
          </button>
          <button
            type="button"
            className={`care-skin-chip${draft.slots.includes('evening') ? ' active' : ''}`}
            onClick={() => toggleSlot('evening')}
          >
            Вечер
          </button>
        </div>
      </div>
      <div className="care-note-field">
        <span className="muted small">Дни</span>
        <div className="care-skin-levels">
          <button
            type="button"
            className={`care-skin-chip${draft.days === 'every' ? ' active' : ''}`}
            onClick={() => onChange({ ...draft, days: 'every' })}
          >
            Каждый день
          </button>
          {CARE_WEEKDAY_ORDER.map((day) => (
            <button
              key={day}
              type="button"
              className={`care-skin-chip${
                draft.days !== 'every' && draft.days.includes(day) ? ' active' : ''
              }`}
              onClick={() => toggleDay(day)}
            >
              {CARE_WEEKDAY_SHORT[day]}
            </button>
          ))}
        </div>
      </div>
      <label className="care-note-field">
        <span className="muted small">Как наносить</span>
        <textarea
          value={draft.how}
          rows={3}
          onChange={(e) => onChange({ ...draft, how: e.target.value })}
          placeholder="Опционально"
        />
      </label>
      <div className="care-editor-actions">
        <button type="button" className="primary-btn" disabled={busy || !draft.name.trim()} onClick={onSave}>
          Сохранить
        </button>
        <button type="button" className="link-btn" disabled={busy} onClick={onCancel}>
          Отмена
        </button>
      </div>
    </div>
  )
}

function cellMark(morning?: boolean, evening?: boolean): string {
  if (morning === undefined && evening === undefined) return ''
  if (morning !== undefined && evening !== undefined) {
    if (morning && evening) return '●'
    if (morning || evening) return '◐'
    return '·'
  }
  if (morning || evening) return '●'
  return '·'
}

export function CareScreen({
  careProducts,
  careDays,
  onBack,
  onToggleCheck,
  onSetSlotChecks,
  onSaveSkin,
  onSaveProduct,
  onArchiveProduct,
}: Props) {
  const [tab, setTab] = useState<Tab>('today')
  const today = todayIso()
  const [viewDate, setViewDate] = useState(today)
  const [editor, setEditor] = useState<ProductDraft | null>(null)
  const [busy, setBusy] = useState(false)
  const [showArchived, setShowArchived] = useState(false)

  const weekday = careWeekdayFromIso(viewDate)
  const weekDates = useMemo(() => weekDatesContaining(viewDate), [viewDate])
  const flags = CARE_DAY_FLAGS[weekday]
  const dayEntry = careDays.find((d) => d.date === viewDate)

  const morningProducts = useMemo(
    () => productsForDaySlot(careProducts, weekday, 'morning', viewDate),
    [careProducts, weekday, viewDate],
  )
  const eveningProducts = useMemo(
    () => productsForDaySlot(careProducts, weekday, 'evening', viewDate),
    [careProducts, weekday, viewDate],
  )

  const activeProducts = useMemo(() => activeCareProducts(careProducts), [careProducts])
  const archivedProducts = useMemo(
    () =>
      careProducts
        .filter((p) => p.archived)
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'ru')),
    [careProducts],
  )

  const summaryDates = useMemo(() => {
    const out: string[] = []
    for (let i = 27; i >= 0; i--) out.push(addDaysIso(today, -i))
    return out
  }, [today])

  const onToggle = (slot: CareSlot, productId: string) => {
    void onToggleCheck({ date: viewDate, slot, productId })
  }

  const onMarkAll = (slot: CareSlot, productIds: string[]) => {
    void onSetSlotChecks({ date: viewDate, slot, productIds })
  }

  const onToggleSkin = (key: CareSkinKey, value: CareSkinDelta) => {
    const prev = dayEntry?.skin ?? {}
    const next: CareSkinTags = { ...prev }
    if (next[key] === value) delete next[key]
    else next[key] = value
    void onSaveSkin({ date: viewDate, skin: next })
  }

  const onNoteBlur = (text: string) => {
    if ((dayEntry?.note ?? '') === text.trim()) return
    void onSaveSkin({
      date: viewDate,
      note: text.trim() ? text : null,
    })
  }

  const openNewProduct = () => {
    const maxOrder = careProducts.reduce((m, p) => Math.max(m, p.sortOrder), 0)
    setEditor(emptyProductDraft(maxOrder + 10))
  }

  const openEditProduct = (p: CareProduct) => {
    setEditor({
      id: p.id,
      name: p.name,
      slots: [...p.slots],
      days: p.days === 'every' ? 'every' : [...p.days],
      how: p.how ?? '',
      sortOrder: p.sortOrder,
    })
  }

  const saveEditor = async () => {
    if (!editor) return
    setBusy(true)
    try {
      await onSaveProduct({
        id: editor.id,
        name: editor.name,
        slots: editor.slots,
        days: editor.days,
        how: editor.how,
        sortOrder: editor.sortOrder,
      })
      setEditor(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="screen care-screen">
      <header className="screen-header">
        <button type="button" className="link-btn" onClick={onBack}>
          ← Назад
        </button>
        <h1>Уход</h1>
      </header>

      <div className="mode-tabs mode-tabs-4" role="tablist" aria-label="Разделы ухода">
        {(
          [
            ['today', 'Сегодня'],
            ['products', 'Средства'],
            ['summary', 'Сводка'],
            ['rules', 'Правила'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            className={`mode-tab${tab === id ? ' active' : ''}`}
            aria-selected={tab === id}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'today' && (
        <div className="panel-stack care-stack">
          <div className="care-day-nav">
            <button
              type="button"
              className="link-btn"
              onClick={() => setViewDate(addDaysIso(viewDate, -7))}
            >
              ← нед.
            </button>
            <span className="care-day-nav-label">{formatRuDate(viewDate)}</span>
            <button
              type="button"
              className="link-btn"
              onClick={() => setViewDate(addDaysIso(viewDate, 7))}
            >
              нед. →
            </button>
          </div>

          <div className="care-day-chips" role="group" aria-label="День недели">
            {CARE_WEEKDAY_ORDER.map((day, i) => {
              const iso = weekDates[i] ?? viewDate
              return (
                <button
                  key={day}
                  type="button"
                  className={`care-day-chip${viewDate === iso ? ' active' : ''}${
                    iso === today ? ' is-today' : ''
                  }`}
                  onClick={() => setViewDate(iso)}
                >
                  {CARE_WEEKDAY_SHORT[day]}
                </button>
              )
            })}
          </div>

          <div className="care-flags-row">
            <span>
              Caramel <FlagMark on={flags.caramel} />
            </span>
            <span>
              BHA <FlagMark on={flags.bha} />
            </span>
            <span>
              Маска <FlagMark on={flags.mask} />
            </span>
          </div>

          {viewDate !== today && (
            <p className="muted small">Просмотр {formatRuDate(viewDate)} — можно ставить отметки.</p>
          )}

          <SlotChecklist
            title="Утро"
            subtitle="По списку средств · ~5 мин"
            slot="morning"
            products={morningProducts}
            doneIds={dayEntry?.morning ?? []}
            onToggle={onToggle}
            onMarkAll={onMarkAll}
          />

          <SlotChecklist
            title={`Вечер · ${CARE_WEEKDAY_LONG[weekday]}`}
            subtitle={eveningTitleForWeekday(weekday)}
            slot="evening"
            products={eveningProducts}
            doneIds={dayEntry?.evening ?? []}
            onToggle={onToggle}
            onMarkAll={onMarkAll}
          />

          <SkinPanel
            key={viewDate}
            skin={dayEntry?.skin}
            note={dayEntry?.note ?? ''}
            onToggleLevel={onToggleSkin}
            onNoteBlur={onNoteBlur}
          />
        </div>
      )}

      {tab === 'products' && (
        <div className="panel-stack care-stack">
          {editor ? (
            <ProductEditor
              draft={editor}
              onChange={setEditor}
              onSave={() => void saveEditor()}
              onCancel={() => setEditor(null)}
              busy={busy}
            />
          ) : (
            <div className="care-products-toolbar">
              <button type="button" className="primary-btn" onClick={openNewProduct}>
                Добавить средство
              </button>
            </div>
          )}

          <div className="care-note">
            <div className="care-note-head">
              <h2>Активные</h2>
              <span className="muted small">{activeProducts.length}</span>
            </div>
            <ul className="care-product-list">
              {activeProducts.map((p) => (
                <li key={p.id} className="care-product">
                  <p className="care-product-name">{p.name}</p>
                  <p className="care-product-when">
                    {formatCareSlotsLabel(p.slots)} · {formatCareDaysLabel(p.days)}
                  </p>
                  {p.how && <p className="care-product-how">{p.how}</p>}
                  <div className="care-product-actions">
                    <button type="button" className="link-btn" onClick={() => openEditProduct(p)}>
                      Изменить
                    </button>
                    <button
                      type="button"
                      className="link-btn"
                      onClick={() => void onArchiveProduct(p.id, true)}
                    >
                      В архив
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            {activeProducts.length === 0 && (
              <p className="muted small" style={{ marginTop: 10 }}>
                Список пуст — добавьте средство или дождитесь сида.
              </p>
            )}
          </div>

          {archivedProducts.length > 0 && (
            <div className="care-note">
              <div className="care-note-head">
                <h2>Архив</h2>
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => setShowArchived((v) => !v)}
                >
                  {showArchived ? 'Скрыть' : 'Показать'}
                </button>
              </div>
              {showArchived && (
                <ul className="care-product-list">
                  {archivedProducts.map((p) => (
                    <li key={p.id} className="care-product">
                      <p className="care-product-name">{p.name}</p>
                      <div className="care-product-actions">
                        <button
                          type="button"
                          className="link-btn"
                          onClick={() => void onArchiveProduct(p.id, false)}
                        >
                          Вернуть
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'summary' && (
        <div className="panel-stack care-stack">
          <div className="care-note">
            <div className="care-note-head">
              <h2>День × средство</h2>
              <span className="muted small">28 дней</span>
            </div>
            <p className="care-note-sub">
              ● оба слота / полный · ◐ частично · · не отмечено
            </p>
            <div className="care-summary-scroll">
              <table className="care-table care-summary-table">
                <thead>
                  <tr>
                    <th>День</th>
                    {activeProducts.map((p) => (
                      <th key={p.id} title={p.name}>
                        {p.name.length > 10 ? `${p.name.slice(0, 9)}…` : p.name}
                      </th>
                    ))}
                    <th>Кожа</th>
                  </tr>
                </thead>
                <tbody>
                  {[...summaryDates].reverse().map((iso) => {
                    const wd = careWeekdayFromIso(iso)
                    const entry = careDays.find((d) => d.date === iso)
                    return (
                      <tr key={iso} className={iso === today ? 'active' : undefined}>
                        <td>
                          <button
                            type="button"
                            className="link-btn care-summary-date"
                            onClick={() => {
                              setViewDate(iso)
                              setTab('today')
                            }}
                          >
                            {iso.slice(5).replace('-', '.')}
                          </button>
                        </td>
                        {activeProducts.map((p) => {
                          const checked = productCheckedOnDay(p, entry, wd)
                          const scheduled =
                            checked.morning !== undefined || checked.evening !== undefined
                          return (
                            <td key={p.id} className="care-summary-cell">
                              {scheduled ? cellMark(checked.morning, checked.evening) : ''}
                            </td>
                          )
                        })}
                        <td className="care-summary-skin">{formatCareSkinBrief(entry?.skin)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'rules' && (
        <div className="panel-stack care-stack">
          <div className="care-note">
            <h2>Общие правила</h2>
            <ol className="care-rules-list">
              {CARE_RULES.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </section>
  )
}
