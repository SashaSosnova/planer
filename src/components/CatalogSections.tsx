import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { CatalogGroup } from '../lib/foodCategory'

type Props<T> = {
  groups: CatalogGroup<T>[]
  /** When true, sections that have items stay expanded (search / filter active). */
  expandAll?: boolean
  getKey: (item: T) => string
  renderItem: (item: T) => ReactNode
  empty: ReactNode
}

export function CatalogSections<T>({
  groups,
  expandAll = false,
  getKey,
  renderItem,
  empty,
}: Props<T>) {
  const groupIds = useMemo(() => groups.map((g) => g.id), [groups])
  const [open, setOpen] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (!expandAll) return
    setOpen((prev) => {
      const next = { ...prev }
      for (const id of groupIds) next[id] = true
      return next
    })
  }, [expandAll, groupIds])

  const isOpen = (id: string) => (expandAll ? true : Boolean(open[id]))

  const toggle = (id: string) => {
    if (expandAll) return
    setOpen((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  if (groups.length === 0) {
    return <ul className="food-list">{empty}</ul>
  }

  return (
    <div className="catalog-sections">
      {groups.map((group) => {
        const expanded = isOpen(group.id)
        return (
          <section key={group.id} className="catalog-section">
            <button
              type="button"
              className="catalog-section-head"
              onClick={() => toggle(group.id)}
              aria-expanded={expanded}
            >
              <span className="catalog-section-title">{group.label}</span>
              <span className="catalog-section-meta">
                <span className="muted small">{group.items.length}</span>
                <span className="catalog-section-chevron" aria-hidden>
                  {expanded ? '▾' : '▸'}
                </span>
              </span>
            </button>
            {expanded && (
              <ul className="food-list catalog-section-list">
                {group.items.map((item) => (
                  <li key={getKey(item)} className="food-list-item">
                    {renderItem(item)}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )
      })}
    </div>
  )
}
