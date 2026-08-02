import { useMemo, useRef, useState } from 'react'
import { PencilIcon } from '../components/PencilIcon'
import { PlusIcon } from '../components/PlusIcon'
import { TrashIcon } from '../components/TrashIcon'
import { generateAliases } from '../lib/foodAliases'
import {
  parsePortionGrams,
  per100FromPortionMacros,
  portionMacrosFromPer100,
} from '../lib/foodPortion'

type KbjuBasis = 'per100' | 'portion'
import {
  isFoodPhotoParseConfigured,
  parseFoodsFromPhoto,
  type FoodLabelCandidate,
} from '../lib/parseFoodLabel'
import { scalePer100g } from '../lib/nutrition'
import type { AppData, FoodItem, MacroSet } from '../types'

function formatKbjuLine(m: MacroSet): string {
  return `${m.kcal} ${m.protein} ${m.fat} ${m.carbs}`
}

function parseKbjuLine(line: string): MacroSet | null {
  const parts = line
    .trim()
    .split(/[\s;|/]+/)
    .map((p) => p.replace(',', '.'))
    .filter(Boolean)
  if (parts.length !== 4) return null
  const nums = parts.map(Number)
  if (nums.some((n) => !Number.isFinite(n) || n < 0)) return null
  return { kcal: nums[0], protein: nums[1], fat: nums[2], carbs: nums[3] }
}

type ReviewRow = FoodLabelCandidate & {
  key: string
  selected: boolean
  kbju: string
  /** Editable portion grams as text */
  portion: string
  brand: string
}

type Props = {
  data: AppData
  onSave: (input: Omit<FoodItem, 'id' | 'updatedAt'> & { id?: string }) => Promise<FoodItem>
  onDelete: (id: string) => Promise<void>
}

type FormFieldsProps = {
  title: string
  name: string
  kbju: string
  place: string
  brand: string
  portion: string
  kbjuBasis: KbjuBasis
  busy: boolean
  photoBusy: boolean
  showPhoto: boolean
  submitLabel: string
  error: string | null
  info: string | null
  photoStage: string | null
  onName: (v: string) => void
  onKbju: (v: string) => void
  onPlace: (v: string) => void
  onBrand: (v: string) => void
  onPortion: (v: string) => void
  onKbjuBasis: (v: KbjuBasis) => void
  onSubmit: () => void
  onCancel: () => void
  onGallery?: () => void
  onCamera?: () => void
}

function formatPreview(m: MacroSet): string {
  return `${m.kcal} ккал · Б ${m.protein} · Ж ${m.fat} · У ${m.carbs}`
}

function ProductFormCard({
  title,
  name,
  kbju,
  place,
  brand,
  portion,
  kbjuBasis,
  busy,
  photoBusy,
  showPhoto,
  submitLabel,
  error,
  info,
  photoStage,
  onName,
  onKbju,
  onPlace,
  onBrand,
  onPortion,
  onKbjuBasis,
  onSubmit,
  onCancel,
  onGallery,
  onCamera,
}: FormFieldsProps) {
  const portionGrams = parsePortionGrams(portion)
  const entered = parseKbjuLine(kbju)
  const preview =
    portionGrams != null && entered
      ? kbjuBasis === 'per100'
        ? {
            label: `Порция ${portionGrams} г`,
            macros: portionMacrosFromPer100(entered, portionGrams),
          }
        : {
            label: 'На 100 г',
            macros: per100FromPortionMacros(entered, portionGrams),
          }
      : null

  return (
    <div className="panel product-form-card">
      <h2 className="subhead" style={{ marginTop: 0 }}>
        {title}
      </h2>
      <label className="field">
        <input
          value={name}
          onChange={(e) => onName(e.target.value)}
          placeholder="Название"
          aria-label="Название"
        />
      </label>
      <label className="field">
        <input
          value={brand}
          onChange={(e) => onBrand(e.target.value)}
          placeholder="Марка (необязательно)"
          aria-label="Марка"
          autoComplete="off"
        />
      </label>
      <div className="meal-type-chips-inline" role="group" aria-label="КБЖУ относительно">
        <button
          type="button"
          className={`meal-type-chip${kbjuBasis === 'per100' ? ' active' : ''}`}
          onClick={() => onKbjuBasis('per100')}
        >
          на 100 г
        </button>
        <button
          type="button"
          className={`meal-type-chip${kbjuBasis === 'portion' ? ' active' : ''}`}
          onClick={() => onKbjuBasis('portion')}
        >
          на порцию
        </button>
      </div>
      {kbjuBasis === 'portion' && (
        <label className="field">
          <input
            inputMode="decimal"
            enterKeyHint="next"
            value={portion}
            onChange={(e) => onPortion(e.target.value)}
            placeholder="Порция, г"
            aria-label="Порция в граммах"
            autoComplete="off"
          />
        </label>
      )}
      <label className="field">
        <input
          inputMode="text"
          enterKeyHint="next"
          value={kbju}
          onChange={(e) => onKbju(e.target.value)}
          placeholder={kbjuBasis === 'portion' ? 'Ккал Б Ж У на порцию' : 'Ккал Б Ж У на 100 г'}
          aria-label={kbjuBasis === 'portion' ? 'Ккал Б Ж У на порцию' : 'Ккал Б Ж У на 100 г'}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
        />
      </label>
      {kbjuBasis === 'per100' && (
        <label className="field">
          <input
            inputMode="decimal"
            enterKeyHint="next"
            value={portion}
            onChange={(e) => onPortion(e.target.value)}
            placeholder="Порция, г (необязательно)"
            aria-label="Порция в граммах"
            autoComplete="off"
          />
        </label>
      )}
      {preview && (
        <p className="muted small" style={{ margin: '0 0 8px' }}>
          {preview.label} → {formatPreview(preview.macros)}
          {portionGrams != null && (
            <>
              <br />В приёме пищи подставится порция {portionGrams} г.
            </>
          )}
        </p>
      )}
      <label className="field">
        <input
          value={place}
          onChange={(e) => onPlace(e.target.value)}
          placeholder="Место (кафе / магазин)"
          aria-label="Место"
          autoComplete="off"
        />
      </label>
      <div className="btn-row">
        <button
          type="button"
          className="primary-btn"
          disabled={busy || photoBusy}
          onClick={onSubmit}
        >
          {busy ? 'Сохраняю…' : submitLabel}
        </button>
        <button type="button" className="ghost-btn" disabled={busy || photoBusy} onClick={onCancel}>
          Отмена
        </button>
        {showPhoto && onGallery && (
          <button
            type="button"
            className="ghost-btn"
            disabled={busy || photoBusy}
            onClick={onGallery}
          >
            {photoBusy ? 'Читаю…' : 'Галерея'}
          </button>
        )}
        {showPhoto && onCamera && (
          <button
            type="button"
            className="ghost-btn"
            disabled={busy || photoBusy}
            onClick={onCamera}
          >
            Камера
          </button>
        )}
      </div>
      {photoStage && <p className="form-msg muted">{photoStage}</p>}
      {error && <p className="form-msg error">{error}</p>}
      {info && <p className="form-msg">{info}</p>}
    </div>
  )
}

export function ProductsPanel({ data, onSave, onDelete }: Props) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [kbju, setKbju] = useState('')
  const [place, setPlace] = useState('')
  const [brand, setBrand] = useState('')
  const [portion, setPortion] = useState('')
  const [kbjuBasis, setKbjuBasis] = useState<KbjuBasis>('per100')
  const [editId, setEditId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [placeFilter, setPlaceFilter] = useState<string | null>(null)

  const [photoBusy, setPhotoBusy] = useState(false)
  const [photoStage, setPhotoStage] = useState<string | null>(null)
  const [reviewPlace, setReviewPlace] = useState('')
  const [reviewRows, setReviewRows] = useState<ReviewRow[] | null>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)

  const products = useMemo(
    () =>
      data.foods
        .filter((f) => f.kind !== 'dish')
        .sort((a, b) => a.name.localeCompare(b.name, 'ru')),
    [data.foods],
  )

  const places = useMemo(() => {
    const set = new Set<string>()
    for (const f of products) {
      const p = f.place?.trim()
      if (p) set.add(p)
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'ru'))
  }, [products])

  const visibleProducts = useMemo(() => {
    if (!placeFilter) return products
    return products.filter((f) => f.place === placeFilter)
  }, [products, placeFilter])

  const clearForm = () => {
    setName('')
    setKbju('')
    setPlace('')
    setBrand('')
    setPortion('')
    setKbjuBasis('per100')
    setError(null)
    setInfo(null)
  }

  const switchKbjuBasis = (next: KbjuBasis) => {
    if (next === kbjuBasis) return
    const grams = parsePortionGrams(portion)
    const macros = parseKbjuLine(kbju)
    if (grams != null && macros) {
      const converted =
        next === 'portion'
          ? portionMacrosFromPer100(macros, grams)
          : per100FromPortionMacros(macros, grams)
      setKbju(formatKbjuLine(converted))
    }
    setKbjuBasis(next)
  }

  const closeAdd = () => {
    setAdding(false)
    setReviewRows(null)
    setReviewPlace('')
    setPhotoStage(null)
    clearForm()
  }

  const closeEdit = () => {
    setEditId(null)
    clearForm()
  }

  const openAdd = () => {
    setEditId(null)
    clearForm()
    setReviewRows(null)
    setReviewPlace('')
    setAdding(true)
  }

  const startEdit = (food: FoodItem) => {
    if (editId === food.id) {
      closeEdit()
      return
    }
    setAdding(false)
    setReviewRows(null)
    setReviewPlace('')
    setEditId(food.id)
    setName(food.name)
    setKbjuBasis('per100')
    setKbju(formatKbjuLine(food.per100g))
    setPortion(food.portionGrams != null && food.portionGrams > 0 ? String(food.portionGrams) : '')
    setPlace(food.place ?? '')
    setBrand(food.brand ?? '')
    setError(null)
    setInfo(null)
  }

  const togglePlaceFilter = (p: string) => {
    setPlaceFilter((prev) => (prev === p ? null : p))
  }

  const submit = async () => {
    setBusy(true)
    setError(null)
    setInfo(null)
    try {
      if (!name.trim()) throw new Error('Укажите название')
      const entered = parseKbjuLine(kbju)
      if (!entered) {
        throw new Error('КБЖУ: четыре числа через пробел, например 140 20 6 0')
      }
      const portionGrams = parsePortionGrams(portion)
      if (kbjuBasis === 'portion') {
        if (portionGrams == null) throw new Error('Укажите вес порции в граммах')
      } else if (portion.trim() && portionGrams == null) {
        throw new Error('Порция: число граммов, например 280')
      }
      const per100g =
        kbjuBasis === 'portion' && portionGrams != null
          ? per100FromPortionMacros(entered, portionGrams)
          : entered
      const wasEdit = Boolean(editId)
      await onSave({
        id: editId ?? undefined,
        name,
        aliases: generateAliases(name),
        per100g,
        kind: 'ingredient',
        place: place.trim() || undefined,
        brand: brand.trim() || undefined,
        portionGrams: portionGrams ?? undefined,
      })
      if (wasEdit) {
        closeEdit()
        setInfo('Продукт обновлён')
      } else {
        closeAdd()
        setInfo('Продукт добавлен')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка')
    } finally {
      setBusy(false)
    }
  }

  const stageLabel = (stage: 'compress' | 'ocr' | 'parse') => {
    if (stage === 'compress') return 'Сжимаю фото…'
    if (stage === 'ocr') return 'Читаю текст с фото…'
    return 'Разбираю продукты…'
  }

  const onPickPhoto = async (file: File | null) => {
    if (!file) return
    if (!isFoodPhotoParseConfigured()) {
      setError('DeepSeek не настроен — добавьте VITE_DEEPSEEK_API_KEY')
      return
    }
    setPhotoBusy(true)
    setError(null)
    setInfo(null)
    setReviewRows(null)
    setPhotoStage('Сжимаю фото…')
    try {
      const result = await parseFoodsFromPhoto(file, {
        placeHint: place.trim() || undefined,
        onProgress: (stage) => setPhotoStage(stageLabel(stage)),
      })
      setReviewPlace(result.place ?? place.trim())
      setReviewRows(
        result.items.map((item, i) => ({
          ...item,
          key: `${i}-${item.name}`,
          selected: true,
          kbju: formatKbjuLine(item.per100g),
          portion:
            item.portionGrams != null && item.portionGrams > 0
              ? String(item.portionGrams)
              : '',
          brand: item.brand ?? '',
        })),
      )
      setPhotoStage(null)
      setInfo(`Найдено: ${result.items.length}. Проверьте и добавьте.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось разобрать фото')
      setPhotoStage(null)
    } finally {
      setPhotoBusy(false)
      if (galleryRef.current) galleryRef.current.value = ''
      if (cameraRef.current) cameraRef.current.value = ''
    }
  }

  const saveReview = async () => {
    if (!reviewRows) return
    const selected = reviewRows.filter((r) => r.selected)
    if (selected.length === 0) {
      setError('Выберите хотя бы один продукт')
      return
    }
    setBusy(true)
    setError(null)
    setInfo(null)
    try {
      let saved = 0
      for (const row of selected) {
        const per100g = parseKbjuLine(row.kbju)
        if (!per100g || !row.name.trim()) continue
        const portionGrams = parsePortionGrams(row.portion)
        if (row.portion.trim() && portionGrams == null) {
          throw new Error(`«${row.name}»: порция — число граммов`)
        }
        await onSave({
          name: row.name,
          aliases: generateAliases(row.name),
          per100g,
          kind: 'ingredient',
          place: reviewPlace.trim() || undefined,
          brand: row.brand.trim() || undefined,
          portionGrams: portionGrams ?? undefined,
        })
        saved += 1
      }
      if (saved === 0) throw new Error('Нет корректных строк для сохранения')
      const placeSaved = reviewPlace.trim()
      closeAdd()
      setInfo(`Добавлено продуктов: ${saved}`)
      if (placeSaved) setPlaceFilter(placeSaved)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка сохранения')
    } finally {
      setBusy(false)
    }
  }

  const formProps = {
    name,
    kbju,
    place,
    brand,
    portion,
    kbjuBasis,
    busy,
    photoBusy,
    error,
    info: adding || editId ? info : null,
    photoStage: adding ? photoStage : null,
    onName: setName,
    onKbju: setKbju,
    onPlace: setPlace,
    onBrand: setBrand,
    onPortion: setPortion,
    onKbjuBasis: switchKbjuBasis,
    onSubmit: () => void submit(),
  }

  return (
    <div className="panel-stack">
      <div className="section-head">
        <h2>Продукты</h2>
        <button
          type="button"
          className="primary-btn icon-cta"
          onClick={openAdd}
          aria-label="Новый продукт"
          title="Новый продукт"
          disabled={photoBusy}
        >
          <PlusIcon size={20} />
        </button>
      </div>

      {/* No capture → gallery / system picker; capture → camera */}
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        className="visually-hidden"
        aria-hidden
        tabIndex={-1}
        onChange={(e) => void onPickPhoto(e.target.files?.[0] ?? null)}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="visually-hidden"
        aria-hidden
        tabIndex={-1}
        onChange={(e) => void onPickPhoto(e.target.files?.[0] ?? null)}
      />

      {adding && !reviewRows && (
        <ProductFormCard
          {...formProps}
          title="Новый продукт"
          showPhoto
          submitLabel="Добавить"
          onCancel={closeAdd}
          onGallery={() => galleryRef.current?.click()}
          onCamera={() => cameraRef.current?.click()}
        />
      )}

      {adding && reviewRows && (
        <div className="panel product-form-card">
          <h2 className="subhead" style={{ marginTop: 0 }}>
            С фото — проверка
          </h2>
          <label className="field">
            <input
              value={reviewPlace}
              onChange={(e) => setReviewPlace(e.target.value)}
              placeholder="Место для всех (кафе / магазин)"
              aria-label="Место для импорта"
            />
          </label>
          <ul className="photo-import-list">
            {reviewRows.map((row) => (
              <li key={row.key} className="photo-import-row">
                <label className="photo-import-check">
                  <input
                    type="checkbox"
                    checked={row.selected}
                    onChange={(e) => {
                      const selected = e.target.checked
                      setReviewRows(
                        (prev) =>
                          prev?.map((r) => (r.key === row.key ? { ...r, selected } : r)) ?? null,
                      )
                    }}
                  />
                </label>
                <div className="photo-import-fields">
                  <input
                    value={row.name}
                    onChange={(e) => {
                      const next = e.target.value
                      setReviewRows(
                        (prev) =>
                          prev?.map((r) => (r.key === row.key ? { ...r, name: next } : r)) ?? null,
                      )
                    }}
                    aria-label="Название"
                    placeholder="Название"
                  />
                  <input
                    value={row.brand}
                    onChange={(e) => {
                      const next = e.target.value
                      setReviewRows(
                        (prev) =>
                          prev?.map((r) => (r.key === row.key ? { ...r, brand: next } : r)) ?? null,
                      )
                    }}
                    aria-label="Марка"
                    placeholder="Марка"
                    autoComplete="off"
                  />
                  <input
                    value={row.kbju}
                    onChange={(e) => {
                      const next = e.target.value
                      setReviewRows(
                        (prev) =>
                          prev?.map((r) => (r.key === row.key ? { ...r, kbju: next } : r)) ?? null,
                      )
                    }}
                    aria-label="КБЖУ на 100 г"
                    placeholder="Ккал Б Ж У на 100 г"
                    autoComplete="off"
                  />
                  <input
                    inputMode="decimal"
                    value={row.portion}
                    onChange={(e) => {
                      const next = e.target.value
                      setReviewRows(
                        (prev) =>
                          prev?.map((r) =>
                            r.key === row.key ? { ...r, portion: next } : r,
                          ) ?? null,
                      )
                    }}
                    aria-label="Порция в граммах"
                    placeholder="Порция, г"
                    autoComplete="off"
                  />
                  {(() => {
                    const pg = parsePortionGrams(row.portion)
                    const per100 = parseKbjuLine(row.kbju)
                    if (pg == null || !per100) return null
                    const p = portionMacrosFromPer100(per100, pg)
                    return (
                      <p className="muted small">
                        порция {pg} г → {p.kcal} ккал · Б {p.protein} · Ж {p.fat} · У {p.carbs}
                      </p>
                    )
                  })()}
                  {row.note && <p className="muted small">{row.note}</p>}
                </div>
              </li>
            ))}
          </ul>
          <div className="btn-row">
            <button
              type="button"
              className="primary-btn"
              disabled={busy || photoBusy}
              onClick={() => void saveReview()}
            >
              {busy ? 'Сохраняю…' : 'Добавить выбранные'}
            </button>
            <button
              type="button"
              className="ghost-btn"
              disabled={busy}
              onClick={() => {
                setReviewRows(null)
                setReviewPlace('')
                setInfo(null)
                setError(null)
              }}
            >
              Назад
            </button>
            <button type="button" className="ghost-btn" disabled={busy} onClick={closeAdd}>
              Отмена
            </button>
          </div>
          {error && <p className="form-msg error">{error}</p>}
          {info && <p className="form-msg">{info}</p>}
        </div>
      )}

      {!adding && !editId && info && <p className="form-msg">{info}</p>}

      {places.length > 0 && (
        <div className="place-chip-row" role="toolbar" aria-label="Фильтр по месту">
          <button
            type="button"
            className={`place-chip${placeFilter == null ? ' active' : ''}`}
            onClick={() => setPlaceFilter(null)}
          >
            Все
          </button>
          {places.map((p) => (
            <button
              key={p}
              type="button"
              className={`place-chip${placeFilter === p ? ' active' : ''}`}
              onClick={() => togglePlaceFilter(p)}
            >
              {p}
            </button>
          ))}
        </div>
      )}

      <ul className="food-list">
        {visibleProducts.length === 0 && (
          <li className="muted">
            {placeFilter
              ? `Нет продуктов из «${placeFilter}».`
              : 'Пока пусто — нажмите +.'}
          </li>
        )}
        {visibleProducts.map((food) => (
          <li key={food.id} className="food-list-item">
            <div className={`food-row food-row-icons${editId === food.id ? ' is-editing' : ''}`}>
              <div className="food-row-body">
                <div className="food-row-title">
                  <strong>{food.name}</strong>
                  {food.brand && <span className="brand-chip">{food.brand}</span>}
                </div>
                <p className="muted small">
                  {food.per100g.kcal} ккал · Б {food.per100g.protein} · Ж {food.per100g.fat} · У{' '}
                  {food.per100g.carbs} / 100 г
                  {food.portionGrams != null && food.portionGrams > 0 && (
                    <>
                      <br />
                      {(() => {
                        const p = scalePer100g(food.per100g, food.portionGrams)
                        return `порция ${food.portionGrams} г → ${p.kcal} ккал · Б ${p.protein} · Ж ${p.fat} · У ${p.carbs}`
                      })()}
                    </>
                  )}
                </p>
                <div className="place-chip-row" style={{ marginTop: 6, marginBottom: 0 }}>
                  {food.portionGrams != null && food.portionGrams > 0 && (
                    <span className="place-chip sm">порция {food.portionGrams} г</span>
                  )}
                  {food.place && (
                    <button
                      type="button"
                      className={`place-chip sm${placeFilter === food.place ? ' active' : ''}`}
                      onClick={() => togglePlaceFilter(food.place!)}
                    >
                      {food.place}
                    </button>
                  )}
                </div>
              </div>
              <div className="btn-row tight nowrap food-row-actions">
                <button
                  type="button"
                  className={`icon-btn sm${editId === food.id ? ' active' : ''}`}
                  onClick={() => startEdit(food)}
                  aria-label={`Изменить ${food.name}`}
                  title="Изменить"
                >
                  <PencilIcon size={18} />
                </button>
                <button
                  type="button"
                  className="icon-btn sm danger"
                  onClick={() => {
                    if (editId === food.id) closeEdit()
                    void onDelete(food.id)
                  }}
                  aria-label={`Удалить ${food.name}`}
                  title="Удалить"
                >
                  <TrashIcon size={18} />
                </button>
              </div>
            </div>
            {editId === food.id && (
              <ProductFormCard
                {...formProps}
                title="Изменить продукт"
                showPhoto={false}
                submitLabel="Сохранить"
                onCancel={closeEdit}
              />
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
