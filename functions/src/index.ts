import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'

initializeApp()

const geminiApiKey = defineSecret('GEMINI_API_KEY')

type MacroSet = {
  kcal: number
  protein: number
  fat: number
  carbs: number
}

type FoodRef = {
  id: string
  name: string
  aliases: string[]
  per100g: MacroSet
}

type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'

type LlmItem = {
  name: string
  grams: number
  foodId?: string | null
  needsEstimate?: boolean
  kcal?: number
  protein?: number
  fat?: number
  carbs?: number
}

type LlmResult = {
  mealType: MealType
  items: LlmItem[]
  notes?: string
}

function scalePer100g(per100g: MacroSet, grams: number): MacroSet {
  const k = grams / 100
  return {
    kcal: Math.round(per100g.kcal * k * 10) / 10,
    protein: Math.round(per100g.protein * k * 10) / 10,
    fat: Math.round(per100g.fat * k * 10) / 10,
    carbs: Math.round(per100g.carbs * k * 10) / 10,
  }
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const raw = (fenced?.[1] ?? text).trim()
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('JSON not found')
  return JSON.parse(raw.slice(start, end + 1))
}

export const parseMeal = onCall(
  { secrets: [geminiApiKey], region: 'europe-west1' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Нужна авторизация')
    }

    const text = String(request.data?.text ?? '').trim()
    if (!text) {
      throw new HttpsError('invalid-argument', 'Пустой текст')
    }

    const mealTypeHint = request.data?.mealType as MealType | undefined
    const eatingOut = Boolean(request.data?.eatingOut)
    const foods = (Array.isArray(request.data?.foods) ? request.data.foods : []) as FoodRef[]

    const catalog = foods.map((f) => ({
      id: f.id,
      name: f.name,
      aliases: f.aliases ?? [],
      per100g: f.per100g,
    }))

    const homeRules = `
- РАЗБИВАЙ составные позиции на отдельные ингредиенты, а не считай одним блюдом.
  Примеры:
  • «кофе с молоком» / «кофе с молоком 2,5%» → кофе + молоко 2,5% (~60 г). Жирность — часть названия молока, НЕ отдельная позиция и НЕ граммы.
  • Запятая в 2,5% — десятичная, не разделитель списка.
  • «чай с сахаром» → чай + сахар (~5–10 г)
- Если продукт есть в каталоге пользователя — foodId и needsEstimate=false.
- Если граммы не указаны — типичная домашняя порция (молоко в кофе ~60 г, хлеб ~20–40 г).
`

    const outRules = `
РЕЖИМ «ВНЕ ДОМА» / ресторан / кафе / сложное описание:
- НЕ используй каталог пользователя (foodId всегда null, needsEstimate всегда true).
- НЕ дроби блюда на ингредиенты: «паста карбонара» — одна позиция.
- КРИТИЧНО: длинное описание салата («Салат из курицы, капусты, моркови… заправка… украшен…» + «300 гр» в конце) = ОДНА позиция на 300 г, короткое name вроде «Салат с курицей», НЕ отдельная строка на каждый овощ.
- Оценивай типичную ресторанную порцию, если вес не указан.
- Фразы «в кафе», «вне дома» — не еда.
`

    const prompt = `Ты помощник для трекера калорий. Разбери текст на русском о том, что человек съел.

Верни ТОЛЬКО JSON без markdown:
{
  "mealType": "breakfast"|"lunch"|"dinner"|"snack",
  "eatingOut": true|false,
  "items": [
    {
      "name": "строка",
      "grams": число,
      "foodId": "id из каталога или null",
      "needsEstimate": true|false,
      "kcal": число (только если needsEstimate),
      "protein": число,
      "fat": число,
      "carbs": число
    }
  ],
  "notes": "краткая заметка или пусто"
}

Режим eatingOut от клиента: ${eatingOut}
${eatingOut ? outRules : homeRules}
- mealType: ${mealTypeHint ?? 'угадай по времени/контексту текста'}.
- eatingOut в ответе: ${eatingOut}.

Каталог пользователя:
${JSON.stringify(eatingOut ? [] : catalog)}

Текст:
${text}`

    const genAI = new GoogleGenerativeAI(geminiApiKey.value())
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      generationConfig: { temperature: 0.2 },
    })

    let parsed: LlmResult
    try {
      const result = await model.generateContent(prompt)
      const responseText = result.response.text()
      parsed = extractJson(responseText) as LlmResult
    } catch (err) {
      throw new HttpsError(
        'internal',
        err instanceof Error ? err.message : 'Ошибка Gemini',
      )
    }

    const foodMap = new Map(catalog.map((f) => [f.id, f]))
    const items = (parsed.items ?? []).map((item) => {
      const grams = Number(item.grams) > 0 ? Number(item.grams) : 100
      const food = item.foodId ? foodMap.get(item.foodId) : undefined
      if (food && !item.needsEstimate) {
        const macros = scalePer100g(food.per100g, grams)
        return {
          name: food.name,
          grams,
          foodId: food.id,
          source: 'library' as const,
          ...macros,
        }
      }
      return {
        name: String(item.name || 'Блюдо'),
        grams,
        foodId: item.foodId ?? null,
        source: 'estimate' as const,
        kcal: Number(item.kcal) || 0,
        protein: Number(item.protein) || 0,
        fat: Number(item.fat) || 0,
        carbs: Number(item.carbs) || 0,
      }
    })

    // Optional: touch user doc so rules/debug show activity
    try {
      await getFirestore().doc(`planer/${request.auth.uid}`).set(
        { lastParseAt: Date.now() },
        { merge: true },
      )
    } catch {
      // ignore
    }

    return {
      mealType: parsed.mealType ?? mealTypeHint ?? 'snack',
      eatingOut,
      items: eatingOut
        ? items.map((item) => ({ ...item, foodId: null, source: 'estimate' as const }))
        : items,
      notes: parsed.notes,
    }
  },
)

function splitImageDataUrl(dataUrl: string): { mimeType: string; base64: string } {
  const m = String(dataUrl).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/)
  if (!m?.[1] || !m[2]) {
    throw new HttpsError('invalid-argument', 'Нужен data URL изображения')
  }
  return { mimeType: m[1], base64: m[2].replace(/\s/g, '') }
}

/** Photo → meal draft via Gemini Flash (vision). */
export const parseMealPhoto = onCall(
  {
    secrets: [geminiApiKey],
    region: 'europe-west1',
    // Compressed plate photos can be a few hundred KB.
    timeoutSeconds: 60,
    memory: '512MiB',
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Нужна авторизация')
    }

    const imageDataUrl = String(request.data?.imageDataUrl ?? '')
    if (!imageDataUrl.startsWith('data:image/')) {
      throw new HttpsError('invalid-argument', 'Нужно фото (data URL)')
    }

    const mealTypeHint = request.data?.mealType as MealType | undefined
    const eatingOut = Boolean(request.data?.eatingOut)
    const foods = (Array.isArray(request.data?.foods) ? request.data.foods : []) as FoodRef[]
    const { mimeType, base64 } = splitImageDataUrl(imageDataUrl)

    const catalog = eatingOut
      ? []
      : foods.slice(0, 80).map((f) => ({
          id: f.id,
          name: f.name,
          aliases: f.aliases ?? [],
          per100g: f.per100g,
        }))

    const prompt = `Ты помощник трекера калорий. По фото еды оцени порцию на русском.

Верни ТОЛЬКО JSON без markdown:
{
  "mealType": "breakfast"|"lunch"|"dinner"|"snack",
  "eatingOut": ${eatingOut},
  "items": [
    {
      "name": "строка",
      "grams": число,
      "foodId": null,
      "needsEstimate": true,
      "kcal": число,
      "protein": число,
      "fat": число,
      "carbs": число
    }
  ],
  "notes": "кратко"
}

Правила:
- Граммы и КБЖУ — ориентировочные. КБЖУ на всю порцию (не на 100 г).
- ЗАПРЕЩЕНО 0/0/0/0 для еды.
- Одно составное блюдо — обычно одна позиция.
- Короткое name по-русски.

eatingOut=${eatingOut}
mealType hint: ${mealTypeHint ?? 'угадай'}

Каталог:
${JSON.stringify(catalog)}`

    const genAI = new GoogleGenerativeAI(geminiApiKey.value())
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      generationConfig: { temperature: 0.2 },
    })

    let parsed: LlmResult
    try {
      const result = await model.generateContent([
        { text: prompt },
        { inlineData: { mimeType, data: base64 } },
      ])
      parsed = extractJson(result.response.text()) as LlmResult
    } catch (err) {
      throw new HttpsError(
        'internal',
        err instanceof Error ? err.message : 'Ошибка Gemini',
      )
    }

    const foodMap = new Map(catalog.map((f) => [f.id, f]))
    const items = (parsed.items ?? []).map((item) => {
      const grams = Number(item.grams) > 0 ? Number(item.grams) : 300
      const food = item.foodId ? foodMap.get(item.foodId) : undefined
      if (food && !item.needsEstimate && !eatingOut) {
        const macros = scalePer100g(food.per100g, grams)
        return {
          name: food.name,
          grams,
          foodId: food.id,
          source: 'library' as const,
          ...macros,
        }
      }
      return {
        name: String(item.name || 'Блюдо'),
        grams,
        foodId: null,
        source: 'estimate' as const,
        kcal: Number(item.kcal) || 0,
        protein: Number(item.protein) || 0,
        fat: Number(item.fat) || 0,
        carbs: Number(item.carbs) || 0,
      }
    })

    if (items.length === 0) {
      throw new HttpsError('internal', 'Gemini не вернул позиции')
    }

    return {
      mealType: parsed.mealType ?? mealTypeHint ?? 'snack',
      eatingOut,
      items,
      notes: parsed.notes,
    }
  },
)
