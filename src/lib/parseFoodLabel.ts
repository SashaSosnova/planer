import type { MacroSet } from '../types'
import { compressImageFile } from './compressImage'
import { deepseekJson, isDeepseekConfigured } from './deepseek'
import { recognizeImageText } from './ocrImage'
import { sanitizeMacros } from './sanitize'

export type FoodLabelCandidate = {
  name: string
  per100g: MacroSet
  note?: string
}

export type FoodLabelParseResult = {
  place?: string
  items: FoodLabelCandidate[]
  /** Raw OCR text (for debugging / rare retries). */
  ocrText: string
}

type LlmFoodLabelResult = {
  place?: string | null
  items?: Array<{
    name?: string
    per100g?: Partial<MacroSet> | null
    note?: string | null
  }>
}

export function isFoodPhotoParseConfigured(): boolean {
  return isDeepseekConfigured()
}

export function buildParseFoodLabelPrompt(ocrText: string, placeHint?: string): string {
  const hint = placeHint?.trim()
  return `Ты помощник трекера калорий. Ниже текст с фото этикетки продукта или меню кафе (OCR, возможны ошибки).

Верни ТОЛЬКО JSON без markdown:
{
  "place": "название кафе/магазина/сети или null",
  "items": [
    {
      "name": "короткое название по-русски",
      "per100g": { "kcal": число, "protein": число, "fat": число, "carbs": число },
      "note": "кратко или null"
    }
  ]
}

Правила:
- Этикетка: читай КБЖУ на 100 г. Если указано только на порцию и есть граммы порции — пересчитай на 100 г.
- Меню: вытащи позиции еды с ккал. Если нет БЖУ — оцени реалистично или поставь 0 с note. Если нет граммов — типичная порция блюда и нормализуй в per100g (не оставляй ккал «на блюдо» как будто на 100 г без пересчёта).
- place: логотип/шапка (Mechtai, Пятёрочка, ВкусВилл…). Не выдумывай сеть.
- Отбрасывай цены без еды, акции, адреса, Wi‑Fi, часы работы.
- 1–30 позиций; пустой items только если еды реально нет.
- kcal на 100 г обычно 5–900; protein/fat/carbs ≥ 0.

${hint ? `Подсказка места от пользователя (используй, если похоже на фото): ${hint}\n` : ''}
OCR-текст:
"""
${ocrText.slice(0, 6000)}
"""`
}

/** Normalize / validate LLM JSON into catalog candidates. */
export function normalizeFoodLabelResult(
  parsed: LlmFoodLabelResult,
  options?: { placeHint?: string },
): Omit<FoodLabelParseResult, 'ocrText'> {
  const placeHint = options?.placeHint?.trim()
  const placeRaw = String(parsed.place ?? '').trim() || placeHint || ''
  const place = placeRaw || undefined

  const items: FoodLabelCandidate[] = []
  for (const raw of parsed.items ?? []) {
    const name = String(raw?.name ?? '').trim()
    if (!name || name.length > 80) continue
    const per100g = sanitizeMacros(raw?.per100g)
    if (per100g.kcal < 5 || per100g.kcal > 950) continue
    if (per100g.protein > 100 || per100g.fat > 100 || per100g.carbs > 120) continue
    const note = String(raw?.note ?? '').trim() || undefined
    items.push({ name, per100g, ...(note ? { note } : {}) })
  }

  return { ...(place ? { place } : {}), items }
}

export type ParseFoodsFromPhotoOptions = {
  placeHint?: string
  /** Progress for UI: compress | ocr | parse */
  onProgress?: (stage: 'compress' | 'ocr' | 'parse') => void
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

  options?.onProgress?.('parse')
  const prompt = buildParseFoodLabelPrompt(ocrText, options?.placeHint)
  const parsed = await deepseekJson<LlmFoodLabelResult>(prompt)
  const normalized = normalizeFoodLabelResult(parsed, { placeHint: options?.placeHint })
  if (normalized.items.length === 0) {
    throw new Error('Не удалось найти продукты на фото — попробуйте другое фото')
  }
  return { ...normalized, ocrText }
}
