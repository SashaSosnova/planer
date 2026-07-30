import { useMemo, useState } from 'react'
import { loadCareChecks, toggleCareCheck, type CareSlot } from '../lib/careChecks'
import {
  CARE_DAY_FLAGS,
  CARE_MORNING_STEPS,
  CARE_PRODUCT_GROUPS,
  CARE_RULES,
  CARE_WEEKDAY_ORDER,
  CARE_WEEKDAY_SHORT,
  careWeekdayFromDate,
  eveningForWeekday,
  type CareCheckStep,
  type CareWeekday,
} from '../lib/careRoutine'
import { todayIso } from '../lib/date'

type Tab = 'today' | 'products' | 'rules'

type Props = {
  onBack: () => void
}

function FlagMark({ on }: { on: boolean }) {
  return <span className={on ? 'care-flag on' : 'care-flag'}>{on ? 'да' : '—'}</span>
}

function Checklist({
  title,
  subtitle,
  slot,
  steps,
  doneIds,
  onToggle,
}: {
  title: string
  subtitle?: string
  slot: CareSlot
  steps: CareCheckStep[]
  doneIds: string[]
  onToggle: (slot: CareSlot, stepId: string) => void
}) {
  const done = steps.filter((s) => doneIds.includes(s.id)).length
  return (
    <div className="care-note">
      <div className="care-note-head">
        <h2>{title}</h2>
        <span className="muted small">
          {done}/{steps.length}
        </span>
      </div>
      {subtitle && <p className="care-note-sub">{subtitle}</p>}
      <ul className="care-check-list">
        {steps.map((step, i) => {
          const checked = doneIds.includes(step.id)
          return (
            <li key={`${slot}-${step.id}`}>
              <label className={`care-check${checked ? ' done' : ''}`}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(slot, step.id)}
                />
                <span className="care-check-num">{i + 1}</span>
                <span className="care-check-text">{step.text}</span>
              </label>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function CareScreen({ onBack }: Props) {
  const [tab, setTab] = useState<Tab>('today')
  const today = todayIso()
  const todayWeekday = careWeekdayFromDate(new Date())
  const [viewDay, setViewDay] = useState<CareWeekday>(todayWeekday)
  const [checks, setChecks] = useState(() => loadCareChecks(today))

  const evening = useMemo(() => eveningForWeekday(viewDay), [viewDay])
  const flags = CARE_DAY_FLAGS[viewDay]
  const viewingToday = viewDay === todayWeekday

  const onToggle = (slot: CareSlot, stepId: string) => {
    if (!viewingToday) return
    setChecks(toggleCareCheck(slot, stepId, today))
  }

  return (
    <section className="screen care-screen">
      <header className="screen-header">
        <button type="button" className="link-btn" onClick={onBack}>
          ← Назад
        </button>
        <h1>Уход</h1>
      </header>

      <div className="mode-tabs" role="tablist" aria-label="Разделы ухода">
        <button
          type="button"
          role="tab"
          className={`mode-tab${tab === 'today' ? ' active' : ''}`}
          aria-selected={tab === 'today'}
          onClick={() => setTab('today')}
        >
          Сегодня
        </button>
        <button
          type="button"
          role="tab"
          className={`mode-tab${tab === 'products' ? ' active' : ''}`}
          aria-selected={tab === 'products'}
          onClick={() => setTab('products')}
        >
          Средства
        </button>
        <button
          type="button"
          role="tab"
          className={`mode-tab${tab === 'rules' ? ' active' : ''}`}
          aria-selected={tab === 'rules'}
          onClick={() => setTab('rules')}
        >
          Правила
        </button>
      </div>

      {tab === 'today' && (
        <div className="panel-stack care-stack">
          <div className="care-day-chips" role="group" aria-label="День недели">
            {CARE_WEEKDAY_ORDER.map((day) => (
              <button
                key={day}
                type="button"
                className={`care-day-chip${viewDay === day ? ' active' : ''}${
                  day === todayWeekday ? ' is-today' : ''
                }`}
                onClick={() => setViewDay(day)}
              >
                {CARE_WEEKDAY_SHORT[day]}
              </button>
            ))}
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

          {!viewingToday && (
            <p className="muted small">Просмотр другого дня — отметки только для сегодня.</p>
          )}

          <Checklist
            title="Утро"
            subtitle="Каждый день одинаково · ~5 мин"
            slot="morning"
            steps={CARE_MORNING_STEPS}
            doneIds={viewingToday ? checks.morning : []}
            onToggle={onToggle}
          />

          <Checklist
            title={`Вечер · ${evening.label}`}
            subtitle={evening.title}
            slot="evening"
            steps={evening.steps}
            doneIds={viewingToday ? checks.evening : []}
            onToggle={onToggle}
          />
        </div>
      )}

      {tab === 'products' && (
        <div className="panel-stack care-stack">
          {CARE_PRODUCT_GROUPS.map((group) => (
            <div key={group.id} className="care-note">
              <div className="care-note-head">
                <h2>{group.title}</h2>
                {group.hint && <span className="muted small">{group.hint}</span>}
              </div>
              <ul className="care-product-list">
                {group.products.map((p) => (
                  <li key={p.id} className="care-product">
                    <p className="care-product-name">{p.name}</p>
                    <p className="care-product-when">{p.when}</p>
                    <p className="care-product-how">{p.how}</p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
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
