import type { MacroSet } from '../types'
import { compressImageFile } from './compressImage'
import { deepseekJson, isDeepseekConfigured } from './deepseek'
import { per100FromPortionMacros } from './foodPortion'
import { recognizeImageText } from './ocrImage'
import { sanitizeMacros } from './sanitize'

export type FoodLabelCandidate = {
  name: string
  per100g: MacroSet
  /** Typical serving size from label/menu, if known */
  portionGrams?: number
  /** Brand / марка on the package */
  brand?: string
  note?: string
}

export type FoodLabelParseResult = {
  items: FoodLabelCandidate[]
  /** Source text (OCR or pasted) for debugging / rare retries. */
  ocrText: string
}

type LlmFoodLabelResult = {
  /** Legacy top-level cafe/store — folded into item.brand */
  place?: string | null
  items?: Array<{
    name?: string
    /** Always preferred as stored basis after normalize */
    per100g?: Partial<MacroSet> | null
    /** Macros as printed (per 100 g or per portion) */
    macros?: Partial<MacroSet> | null
    macrosBasis?: 'per100' | 'portion' | null
    portionGrams?: number | null
    brand?: string | null
    note?: string | null
  }>
}

export function isFoodPhotoParseConfigured(): boolean {
  return isDeepseekConfigured()
}

export function buildParseFoodLabelPrompt(sourceText: string, brandHint?: string): string {
  const hint = brandHint?.trim()
  return `Ты помощник трекера калорий. Ниже текст этикетки, меню, экрана приложения доставки или списка продуктов (OCR с ошибками или вставка пользователя).

Верни ТОЛЬКО JSON без markdown:
{
  "items": [
    {
      "name": "короткое название по-русски (без марки)",
      "brand": "марка / кафе / магазин / сеть или null",
      "macros": { "kcal": число, "protein": число, "fat": число, "carbs": число },
      "macrosBasis": "per100" | "portion",
      "portionGrams": число или null,
      "note": "кратко или null"
    }
  ]
}

Правила:
- КБЖУ брать ТОЛЬКО рядом с подписями «Ккал» / «Белки» / «Жиры» / «Углеводы» (или kcal/protein/fat/carbs). Можно строки вида «Творог 5% — 70 16 0.5 1.5» или «Название ккал/б/ж/у».
- ЗАПРЕЩЕНО брать цену как ккал: числа с «₽», «руб», «рублей», вида 339,99 / 339.99 / «339 99», кнопки «В корзину». OCR часто читает 339,99 ₽ как 339.4 — это НЕ калории.
- Экран приложения: переключатель «Всего» | «На 100 г».
  • Если активно/выбрано «На 100 г» → macrosBasis="per100" ОБЯЗАТЕЛЬНО. Числа под Ккал/Белки/Жиры/Углеводы уже на 100 г — НЕ делить на вес.
  • Если активно «Всего» → macrosBasis="portion".
  • Поле «Вес 274 г» / «220 г» в кнопке — это только portionGrams. Само по себе НЕ делает macrosBasis="portion".
  Ошибка: взять 263/10/16/19 (на 100 г) и пересчитать через вес 274 → получится ~96/3.6/5.8/6.9 — так делать НЕЛЬЗЯ.
- Таблица «НА 100Г | БЛЮДО» (две колонки): бери ВСЕ четыре числа из ОДНОЙ колонки.
  • Предпочтительно колонка «НА 100Г» → macrosBasis="per100", portionGrams из веса блюда (220 г).
  • Либо вся колонка «БЛЮДО» → macrosBasis="portion", portionGrams=вес.
  ЗАПРЕЩЕНО миксовать: ккал из «НА 100Г» (165) + белки из «БЛЮДО» (25) + жиры/углеводы из «НА 100Г» → 165 25 4 20 — НЕПРАВИЛЬНО.
  Верно на 100 г: 165 / 11 / 4 / 20; на блюдо: 364 / 25 / 10 / 44.
- Этикетка: КБЖУ на 100 г → per100; только на порцию + граммы → portion.
- Список без явного базиса: по умолчанию macrosBasis="per100", если похоже на этикетку/справочник; иначе portion.
- Меню без веса: macrosBasis="portion", portionGrams типичный (суп ~300, салат ~250, бургер/паста ~300–350, напиток ~250, десерт ~120).
- Согласованность: kcal ≈ белки×4 + жиры×9 + углеводы×4 (допуск большой, но 339 ккал при БЖУ 3/6/7 — явная ошибка, ищи другие цифры).
- brand: одно поле — марка на упаковке (Lay's, Простоквашино) ИЛИ кафе/магазин/сеть (Пятёрочка, Бургер Кинг). Не выдумывай. В name не дублируй brand.
- Отбрасывай акции, адреса, Wi‑Fi, баллы лояльности, «+33», короны.
- 1–30 позиций; пустой items только если еды реально нет.

${hint ? `Подсказка марки/места от пользователя (используй для brand, если похоже): ${hint}\n` : ''}
Текст:
"""
${sourceText.slice(0, 6000)}
"""`
}

function clampPortionGrams(raw: unknown): number | undefined {
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n) || n <= 0 || n > 5000) return undefined
  return Math.round(n * 10) / 10
}

/**
 * Model often sets macrosBasis=portion just because «Вес» is present,
 * while the numbers are already per 100 g (BK toggle «На 100 г»).
 */
export function likelyMisTaggedPortionBasis(
  entered: MacroSet,
  portionGrams: number,
): boolean {
  if (!(portionGrams >= 200)) return false
  if (entered.kcal < 200 || entered.kcal > 420) return false
  const converted = per100FromPortionMacros(entered, portionGrams)
  if (converted.kcal >= entered.kcal * 0.55) return false
  const bj = entered.protein + entered.fat + entered.carbs
  // Real per-100g burger-like density, not a tiny seasoning line
  return bj >= 30 && macrosLookPlausible(entered)
}

/** Reject price-as-kcal, mixed columns, and nonsense BJU vs kcal (Atwater). */
export function macrosLookPlausible(m: MacroSet): boolean {
  // Salt / water / zero-calorie seasonings — exact zeros are intentional
  if (m.kcal === 0 && m.protein === 0 && m.fat === 0 && m.carbs === 0) return true
  if (m.kcal < 5 || m.kcal > 950) return false
  if (m.protein > 100 || m.fat > 100 || m.carbs > 120) return false
  const fromMacro = m.protein * 4 + m.fat * 9 + m.carbs * 4
  // Price OCR: huge kcal, tiny macros (339 / 3.6 / 5.8 / 6.9)
  if (fromMacro < 15 && m.kcal > 120) return false
  if (m.kcal > fromMacro * 2.2 + 80) return false
  if (fromMacro > 20 && m.kcal < fromMacro * 0.35) return false
  // Mixed «НА 100Г» kcal with «БЛЮДО» protein (165 / 25 / 4 / 20 → ~216 ккал из БЖУ)
  const gap = Math.abs(m.kcal - fromMacro)
  // Spices / bran / cocoa: labeled kcal often well below Atwater because carbs include fiber
  const fiberHeavy =
    fromMacro > m.kcal && m.carbs >= 35 && m.kcal >= fromMacro * 0.5
  if (!fiberHeavy && gap > Math.max(50, m.kcal * 0.2)) return false
  // Prices often end up as x.4 / x.9 from «,99»
  if (m.kcal > 150 && m.kcal % 1 > 0.05 && fromMacro < m.kcal * 0.45) return false
  return true
}

/** Normalize / validate LLM JSON into catalog candidates. */
export function normalizeFoodLabelResult(
  parsed: LlmFoodLabelResult,
  options?: { brandHint?: string },
): Omit<FoodLabelParseResult, 'ocrText'> {
  const brandFallback =
    String(parsed.place ?? '').trim() || options?.brandHint?.trim() || ''

  const items: FoodLabelCandidate[] = []
  for (const raw of parsed.items ?? []) {
    const name = String(raw?.name ?? '').trim()
    if (!name || name.length > 80) continue

    const portionGrams = clampPortionGrams(raw?.portionGrams)
    const basis =
      raw?.macrosBasis === 'portion' || raw?.macrosBasis === 'per100'
        ? raw.macrosBasis
        : null
    const macrosSource = raw?.macros ?? raw?.per100g
    const entered = sanitizeMacros(macrosSource)

    let effectiveBasis = basis
    if (
      effectiveBasis === 'portion' &&
      portionGrams != null &&
      likelyMisTaggedPortionBasis(entered, portionGrams)
    ) {
      // «На 100 г» + «Вес» — keep macros as per100g, keep portionGrams for default serving
      effectiveBasis = 'per100'
    }

    let per100g: MacroSet
    if (effectiveBasis === 'portion' && portionGrams != null) {
      per100g = per100FromPortionMacros(entered, portionGrams)
    } else if (raw?.per100g && effectiveBasis !== 'portion') {
      per100g = sanitizeMacros(raw.per100g)
    } else if (raw?.per100g && macrosLookPlausible(sanitizeMacros(raw.per100g))) {
      per100g = sanitizeMacros(raw.per100g)
    } else {
      per100g = entered
    }

    // Also reject when the *entered* macros are a price even if scaled per100 slips through.
    if (!macrosLookPlausible(entered) && !macrosLookPlausible(per100g)) continue
    if (!macrosLookPlausible(per100g)) continue
    const note = String(raw?.note ?? '').trim() || undefined
    const brand = String(raw?.brand ?? '').trim() || brandFallback || undefined
    items.push({
      name,
      per100g,
      ...(portionGrams != null ? { portionGrams } : {}),
      ...(brand && brand.length <= 60 ? { brand } : {}),
      ...(note ? { note } : {}),
    })
  }

  return { items }
}

export type ParseFoodsFromTextOptions = {
  brandHint?: string
  onProgress?: (stage: 'parse') => void
}

export type ParseFoodsFromPhotoOptions = {
  brandHint?: string
  /** Progress for UI: compress | ocr | parse */
  onProgress?: (stage: 'compress' | 'ocr' | 'parse') => void
}

/**
 * Pasted / OCR text → DeepSeek → candidates for the food catalog.
 */
export async function parseFoodsFromText(
  text: string,
  options?: ParseFoodsFromTextOptions,
): Promise<FoodLabelParseResult> {
  if (!isFoodPhotoParseConfigured()) {
    throw new Error('DeepSeek не настроен — добавьте VITE_DEEPSEEK_API_KEY')
  }

  const sourceText = text.trim()
  if (!sourceText) {
    throw new Error('Вставьте текст с продуктами')
  }

  options?.onProgress?.('parse')
  const prompt = buildParseFoodLabelPrompt(sourceText, options?.brandHint)
  const parsed = await deepseekJson<LlmFoodLabelResult>(prompt)
  const normalized = normalizeFoodLabelResult(parsed, { brandHint: options?.brandHint })
  if (normalized.items.length === 0) {
    throw new Error('Не удалось найти продукты в тексте — проверьте формат')
  }
  return { ...normalized, ocrText: sourceText }
}

/**
 * Photo → compress → local OCR → DeepSeek → candidates for the food catalog.
 */
export async function parseFoodsFromPhoto(
  image: Blob | string,
  options?: ParseFoodsFromPhotoOptions,
): Promise<FoodLabelParseResult> {
  if (!isFoodPhotoParseConfigured()) {
    throw new Error('DeepSeek не настроен — добавьте VITE_DEEPSEEK_API_KEY')
  }

  options?.onProgress?.('compress')
  const dataUrl =
    typeof image === 'string'
      ? image
      : await compressImageFile(image, 1600, 0.75)

  if (!dataUrl.startsWith('data:image/')) {
    throw new Error('Нужен data URL изображения')
  }

  options?.onProgress?.('ocr')
  const ocrText = await recognizeImageText(dataUrl)

  try {
    return await parseFoodsFromText(ocrText, {
      brandHint: options?.brandHint,
      onProgress: options?.onProgress ? () => options.onProgress?.('parse') : undefined,
    })
  } catch (err) {
    if (err instanceof Error && err.message.includes('в тексте')) {
      throw new Error('Не удалось найти продукты на фото — попробуйте другое фото')
    }
    throw err
  }
}
