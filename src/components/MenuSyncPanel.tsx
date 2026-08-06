import { useMemo, useRef, useState } from 'react'
import type { AppData } from '../types'
import { downloadJson } from '../lib/downloadJson'
import { findMenuDishDuplicates } from '../lib/menuDishDedupe'
import {
  exportMenuMacros,
  exportProductCatalog,
  findOrphanMenuDishes,
  MENU_DISHES_URL,
  type MenuImportResult,
} from '../lib/menuSync'

type Props = {
  data: AppData
  onImportRecipes: (
    raw: unknown,
    onProgress?: (msg: string) => void,
  ) => Promise<MenuImportResult>
  onDedupeDishes?: () => Promise<{ removed: number; groups: ReturnType<typeof findMenuDishDuplicates> }>
  onDeleteFood: (id: string) => Promise<void>
}

export function MenuSyncPanel({
  data,
  onImportRecipes,
  onDedupeDishes,
  onDeleteFood,
}: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastImport, setLastImport] = useState<MenuImportResult | null>(null)
  const [keepMenuIds, setKeepMenuIds] = useState<string[] | null>(null)

  const ingredientCount = data.foods.filter((f) => f.kind !== 'dish').length
  const linkedDishes = data.foods.filter((f) => f.kind === 'dish' && f.menuId).length
  const dupeGroups = useMemo(() => findMenuDishDuplicates(data.foods), [data.foods])
  const dupeCount = dupeGroups.reduce((n, g) => n + g.removeIds.length, 0)
  const orphans = useMemo(
    () => (keepMenuIds ? findOrphanMenuDishes(data.foods, keepMenuIds) : []),
    [data.foods, keepMenuIds],
  )

  const exportCatalog = () => {
    const catalog = exportProductCatalog(data.foods)
    downloadJson('products-catalog.json', { version: 1, products: catalog })
    setMsg(`Экспортировано продуктов: ${catalog.length}`)
    setError(null)
  }

  const exportMacros = () => {
    const macros = exportMenuMacros(data.foods)
    const count = Object.keys(macros.dishes).length
    if (count === 0) {
      setError('Нет блюд с menuId — сначала импортируйте рецепты из menu')
      setMsg(null)
      return
    }
    downloadJson('dishes-macros.json', macros)
    setMsg(`Экспортировано КБЖУ: ${count} блюд`)
    setError(null)
  }

  const deleteOrphans = async (list: ReturnType<typeof findOrphanMenuDishes>) => {
    for (const orphan of list) {
      await onDeleteFood(orphan.id)
    }
  }

  const runImport = async (raw: unknown) => {
    setBusy(true)
    setError(null)
    setMsg(null)
    setLastImport(null)
    try {
      const result = await onImportRecipes(raw, (progress) => setMsg(progress))
      setLastImport(result)
      setKeepMenuIds(result.menuIds)
      const toRemove = result.orphans
      let summary =
        `Готово: ${result.created} новых, ${result.updated} обновлено` +
        (result.errors ? `, ${result.errors} ошибок` : '') +
        (result.removedDupes ? `, удалено дубликатов: ${result.removedDupes}` : '')

      if (toRemove.length > 0) {
        const ok = window.confirm(
          `В planer есть ${toRemove.length} рецептов, которых нет в menu.\n` +
            `Удалить их из planer? (menu не меняется)\n\n` +
            toRemove
              .slice(0, 12)
              .map((o) => `• ${o.name}`)
              .join('\n') +
            (toRemove.length > 12 ? `\n… и ещё ${toRemove.length - 12}` : ''),
        )
        if (ok) {
          await deleteOrphans(toRemove)
          summary += `. Удалено из planer: ${toRemove.length}`
        } else {
          summary += `. Лишних в planer: ${toRemove.length} — можно удалить кнопкой ниже`
        }
      }
      setMsg(summary)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось импортировать')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const fetchFromMenu = async () => {
    setBusy(true)
    setError(null)
    setMsg('Загружаю dishes.json…')
    try {
      const res = await fetch(`${MENU_DISHES_URL}?t=${Date.now()}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const raw = (await res.json()) as unknown
      await runImport(raw)
    } catch (err) {
      setError(
        err instanceof Error
          ? `${err.message}. Пока menu не публикует dishes.json — загрузите файл вручную.`
          : 'Не удалось загрузить',
      )
      setMsg(null)
      setBusy(false)
    }
  }

  const runDedupe = async () => {
    if (!onDedupeDishes) return
    setBusy(true)
    setError(null)
    setMsg(null)
    try {
      const { removed } = await onDedupeDishes()
      setMsg(removed > 0 ? `Удалено дубликатов: ${removed}` : 'Дубликатов блюд не найдено')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить дубликаты')
    } finally {
      setBusy(false)
    }
  }

  const runPruneOrphans = async () => {
    if (orphans.length === 0) return
    const ok = window.confirm(
      `Удалить из planer ${orphans.length} рецептов, которых нет в menu?\n` +
        `(menu не меняется)\n\n` +
        orphans
          .slice(0, 12)
          .map((o) => `• ${o.name}`)
          .join('\n') +
        (orphans.length > 12 ? `\n… и ещё ${orphans.length - 12}` : ''),
    )
    if (!ok) return
    setBusy(true)
    setError(null)
    setMsg(null)
    try {
      await deleteOrphans(orphans)
      setMsg(`Удалено из planer: ${orphans.length}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить блюда')
    } finally {
      setBusy(false)
    }
  }

  const onPickFile = async (file: File | null) => {
    if (!file) return
    setMsg('Читаю файл…')
    try {
      const raw = JSON.parse(await file.text()) as unknown
      await runImport(raw)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось прочитать JSON')
      setMsg(null)
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="panel menu-sync-panel">
      <h2 className="subhead" style={{ marginTop: 0 }}>
        Синхронизация с menu
      </h2>
      <p className="muted small">
        Продукты ведутся здесь ({ingredientCount} шт.). Рецепты — в{' '}
        <a href="https://github.com/SashaSosnova/menu" target="_blank" rel="noreferrer">
          menu
        </a>
        ; КБЖУ считаются в planer. Связано блюд: {linkedDishes}.
      </p>

      <div className="menu-sync-block">
        <h3 className="menu-sync-title">1. Каталог продуктов → menu</h3>
        <p className="muted small">
          Скачайте список названий — по нему пишите ингредиенты в рецептах menu.
        </p>
        <button type="button" className="ghost-btn" disabled={busy} onClick={exportCatalog}>
          Экспорт products-catalog.json
        </button>
      </div>

      <div className="menu-sync-block">
        <h3 className="menu-sync-title">2. Рецепты ← menu</h3>
        <p className="muted small">
          Импорт списка ингредиентов: разбор по продуктам и расчёт КБЖУ. Новые добавятся,
          существующие с menuId обновятся.
        </p>
        <div className="btn-row">
          <button type="button" className="primary-btn" disabled={busy} onClick={() => void fetchFromMenu()}>
            {busy ? 'Импорт…' : 'Загрузить с сайта menu'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => void onPickFile(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            className="ghost-btn"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            Выбрать dishes.json
          </button>
        </div>
      </div>

      {orphans.length > 0 && (
        <div className="menu-sync-block">
          <h3 className="menu-sync-title">Лишние в planer</h3>
          <p className="muted small">
            Этих {orphans.length} рецептов нет в последнем импорте menu. Удаление только из
            справочника planer.
          </p>
          <ul className="menu-sync-report muted small">
            {orphans.slice(0, 20).map((o) => (
              <li key={o.id}>
                <strong>{o.name}</strong>
                {o.menuId ? ` · ${o.menuId}` : ' · без menuId'}
              </li>
            ))}
            {orphans.length > 20 && <li>… и ещё {orphans.length - 20}</li>}
          </ul>
          <button
            type="button"
            className="ghost-btn"
            disabled={busy}
            onClick={() => void runPruneOrphans()}
          >
            Удалить из planer ({orphans.length})
          </button>
        </div>
      )}

      {dupeCount > 0 && onDedupeDishes && (
        <div className="menu-sync-block">
          <h3 className="menu-sync-title">Дубликаты блюд</h3>
          <p className="muted small">
            Найдено лишних копий: {dupeCount} (групп: {dupeGroups.length}). Останется версия с
            menuId и полным рецептом.
          </p>
          <ul className="menu-sync-report muted small">
            {dupeGroups.map((g) => (
              <li key={g.key}>
                <strong>{g.keepName}</strong> — лишних: {g.removeIds.length}
              </li>
            ))}
          </ul>
          <button type="button" className="ghost-btn" disabled={busy} onClick={() => void runDedupe()}>
            Удалить дубликаты блюд
          </button>
        </div>
      )}

      <div className="menu-sync-block">
        <h3 className="menu-sync-title">3. КБЖУ → menu</h3>
        <p className="muted small">
          После импорта и правок — экспорт калорийности для menu (dishes-macros.json).
        </p>
        <button type="button" className="ghost-btn" disabled={busy} onClick={exportMacros}>
          Экспорт dishes-macros.json
        </button>
      </div>

      {msg && <p className="form-msg">{msg}</p>}
      {error && <p className="form-msg error">{error}</p>}

      {lastImport && lastImport.results.some((r) => r.unmatched.length > 0 || r.error) && (
        <ul className="menu-sync-report muted small">
          {lastImport.results.map((r) => (
            <li key={r.menuId}>
              <strong>{r.name}</strong>
              {r.error ? (
                <> — ошибка: {r.error}</>
              ) : (
                <>
                  {' '}
                  — {r.matched}/{r.total} из библиотеки
                  {r.unmatched.length > 0 && (
                    <>; не найдено: {r.unmatched.join(', ')}</>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
