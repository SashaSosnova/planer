import { useEffect, useMemo, useRef, useState } from 'react'
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
  registerBackHandler?: (fn: () => boolean) => () => void
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
          alt=""
          className="sticker-img"
          draggable={false}
        />
      </span>
    )
  }
  return (
    <span className={`sticker-frame placeholder${unlocked ? ' unlocked' : ' locked'}`}>
      <span className="sticker-placeholder-letter">
        {unlocked ? character.slice(0, 1) : '?'}
      </span>
    </span>
  )
}

function GroupGrid({
  title,
  items,
  onInfo,
}: {
  title: string
  items: AchievementStatus[]
  onInfo: (item: AchievementStatus) => void
}) {
  if (items.length === 0) return null
  return (
    <div className="achievements-group">
      <h2 className="subhead">{title}</h2>
      <ul className="sticker-grid">
        {items.map((a) => (
          <li key={a.id} className={`sticker-cell${a.unlocked ? ' unlocked' : ''}`}>
            <div className="sticker-cell-inner">
              <StickerVisual
                artKey={a.sticker.artKey}
                character={a.sticker.character}
                unlocked={a.unlocked}
              />
              <button
                type="button"
                className="sticker-info-btn"
                aria-label={`Как получить: ${a.title}`}
                onClick={() => onInfo(a)}
              >
                i
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function AchievementsScreen({
  data,
  targetWeightKg,
  onBack,
  registerBackHandler,
}: Props) {
  const statuses = useMemo(
    () => evaluateAchievements(data, { targetWeightKg }),
    [data, targetWeightKg],
  )
  const { unlocked, total } = unlockedCount(statuses)
  const [info, setInfo] = useState<AchievementStatus | null>(null)
  const infoRef = useRef(info)
  infoRef.current = info

  useEffect(() => {
    if (!registerBackHandler) return
    return registerBackHandler(() => {
      if (!infoRef.current) return false
      setInfo(null)
      return true
    })
  }, [registerBackHandler])

  return (
    <section className="screen">
      <header className="screen-header">
        <button type="button" className="link-btn" onClick={onBack}>
          ← Назад
        </button>
        <h1>Достижения</h1>
        <p className="muted">
          {unlocked} из {total} · коллекция стикеров
        </p>
      </header>

      {GROUP_ORDER.map((group) => (
        <GroupGrid
          key={group}
          title={ACHIEVEMENT_GROUP_LABELS[group]}
          items={statuses.filter((s) => s.group === group)}
          onInfo={setInfo}
        />
      ))}

      {info && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setInfo(null)}
        >
          <div
            className="modal-card sticker-info-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sticker-info-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticker-info-visual">
              <StickerVisual
                artKey={info.sticker.artKey}
                character={info.sticker.character}
                unlocked={info.unlocked}
              />
            </div>
            <h2 id="sticker-info-title" className="subhead" style={{ marginTop: 0 }}>
              {info.title}
            </h2>
            <p className="muted small">
              {info.unlocked ? 'Уже есть' : 'Как получить'}
              {info.unlocked ? ` · ${info.sticker.character}` : ''}
            </p>
            <p>{info.description}</p>
            <div className="btn-row">
              <button type="button" className="primary-btn" onClick={() => setInfo(null)}>
                Понятно
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
