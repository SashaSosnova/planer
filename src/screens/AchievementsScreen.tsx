import { useMemo } from 'react'
import {
  ACHIEVEMENT_GROUP_LABELS,
  evaluateAchievements,
  unlockedCount,
  type AchievementDef,
  type AchievementStatus,
} from '../lib/achievements'
import { hasStickerArt, stickerSrc } from '../lib/stickers'
import type { AppData } from '../types'

type Props = {
  data: AppData
  targetWeightKg: number | null
  onBack: () => void
}

const GROUP_ORDER: AchievementDef['group'][] = ['habits', 'body', 'wellness']

function StickerVisual({
  artKey,
  character,
  unlocked,
}: {
  artKey: string
  character: string
  unlocked: boolean
}) {
  const hasArt = hasStickerArt(artKey)
  if (hasArt) {
    return (
      <span className={`sticker-frame${unlocked ? ' unlocked' : ' locked'}`}>
        <img
          src={stickerSrc(artKey)}
          alt={unlocked ? character : ''}
          className="sticker-img"
          draggable={false}
        />
      </span>
    )
  }
  return (
    <span className={`achievement-mark sticker-slot${unlocked ? '' : ' locked'}`} aria-hidden>
      {unlocked ? character.slice(0, 1) : '?'}
    </span>
  )
}

function GroupList({
  title,
  items,
}: {
  title: string
  items: AchievementStatus[]
}) {
  if (items.length === 0) return null
  return (
    <div className="achievements-group">
      <h2 className="subhead">{title}</h2>
      <ul className="achievements-list">
        {items.map((a) => (
          <li key={a.id} className={`achievement-card${a.unlocked ? ' unlocked' : ''}`}>
            <StickerVisual
              artKey={a.sticker.artKey}
              character={a.sticker.character}
              unlocked={a.unlocked}
            />
            <div>
              <strong>{a.title}</strong>
              <p className="muted small">{a.description}</p>
              <p className="muted small sticker-character">
                {a.unlocked ? a.sticker.character : '???'}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function AchievementsScreen({ data, targetWeightKg, onBack }: Props) {
  const statuses = useMemo(
    () => evaluateAchievements(data, { targetWeightKg }),
    [data, targetWeightKg],
  )
  const { unlocked, total } = unlockedCount(statuses)

  return (
    <section className="screen">
      <header className="screen-header">
        <button type="button" className="link-btn" onClick={onBack}>
          ← Назад
        </button>
        <h1>Достижения</h1>
        <p className="muted">
          {unlocked} из {total} · коллекция стикеров за привычки
        </p>
      </header>

      {GROUP_ORDER.map((group) => (
        <GroupList
          key={group}
          title={ACHIEVEMENT_GROUP_LABELS[group]}
          items={statuses.filter((s) => s.group === group)}
        />
      ))}
    </section>
  )
}
