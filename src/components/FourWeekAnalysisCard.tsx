import { useState } from 'react'
import { formatKg } from '../lib/nutrition'
import type { AnalysisAction, FourWeekAnalysis } from '../lib/fourWeekAnalysis'

const KIND_LABEL: Record<AnalysisAction['kind'], string> = {
  do: 'Сделать',
  keep: 'Держать',
  watch: 'Учесть',
}

type Props = {
  analysis: FourWeekAnalysis
  onOpenProfile?: () => void
}

function signedKg(delta: number): string {
  if (Math.abs(delta) < 0.05) return '0'
  return `${delta > 0 ? '+' : '−'}${formatKg(Math.abs(delta))}`
}

export function FourWeekAnalysisCard({ analysis, onOpenProfile }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <article className={`analysis-card${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="analysis-card-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="analysis-card-toggle-copy">
          <span className="analysis-card-title">Итоги за месяц</span>
          {!open && (
            <span className="analysis-card-teaser">{analysis.headline}</span>
          )}
        </span>
        <span className="analysis-card-chevron" aria-hidden>
          {open ? '▴' : '▾'}
        </span>
      </button>
      {open && (
        <div className="analysis-card-body">
          <p className="muted small">
            {analysis.loggedDays} дн. с едой · {analysis.weighIns} взвеш.
          </p>
          <p className="analysis-card-headline">{analysis.headline}</p>
          <p className="muted small">{analysis.caveat}</p>

          <dl className="analysis-stats">
            <div>
              <dt>Вес</dt>
              <dd>
                {formatKg(analysis.kgStart)} → {formatKg(analysis.kgEnd)}
              </dd>
            </div>
            <div>
              <dt>Средние ккал</dt>
              <dd>{analysis.avgKcal}</dd>
            </div>
            {analysis.recentWeeklyRateKg != null && (
              <div>
                <dt>Темп 2 нед.</dt>
                <dd>{signedKg(analysis.recentWeeklyRateKg)} кг/нед</dd>
              </div>
            )}
          </dl>

          <table className="analysis-weeks">
            <thead>
              <tr>
                <th>Неделя</th>
                <th>ккал</th>
                <th>вес</th>
              </tr>
            </thead>
            <tbody>
              {analysis.weeks.map((week) => (
                <tr key={week.start}>
                  <td>{week.label}</td>
                  <td>{week.avgKcal ?? '—'}</td>
                  <td>{week.deltaKg == null ? '—' : signedKg(week.deltaKg)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <ul className="analysis-actions">
            {analysis.actions.map((action) => (
              <ActionRow key={action.id} action={action} onOpenProfile={onOpenProfile} />
            ))}
          </ul>
        </div>
      )}
    </article>
  )
}

function ActionRow({
  action,
  onOpenProfile,
}: {
  action: AnalysisAction
  onOpenProfile?: () => void
}) {
  const canGo = action.go === 'profile' && onOpenProfile
  return (
    <li className={`analysis-action analysis-action--${action.kind}`}>
      <span className="analysis-action-kind">{KIND_LABEL[action.kind]}</span>
      <div>
        <strong>{action.title}</strong>
        <p>{action.detail}</p>
        {canGo && (
          <button type="button" className="link-btn" onClick={onOpenProfile}>
            Открыть профиль
          </button>
        )}
      </div>
    </li>
  )
}
