import { httpsCallable } from 'firebase/functions'
import { getFirebaseFunctions, isFirebaseConfigured } from '../firebase'
import type { FoodRef, MealType, ParsedMealDraft } from '../types'
import { geminiJsonVision, isGeminiConfigured } from './gemini'
import { mapLlmResultToDraft, type LlmResult } from './parseMealLlm'

export const PHOTO_MEAL_NOTES = 'Оценка по фото — проверьте граммы.'

export function isPhotoParseConfigured(): boolean {
  return isGeminiConfigured() || isFirebaseConfigured()
}

export function buildParseMealPhotoPrompt(input: {
  mealType?: MealType
  eatingOut: boolean
  foods: FoodRef[]
}): string {
  const { mealType, eatingOut, foods } = input
  const catalog = eatingOut
    ? []
    : foods.slice(0, 80).map((f) => ({
        id: f.id,
        name: f.name,
        aliases: f.aliases.slice(0, 3),
        per100g: f.per100g,
        kind: f.kind ?? 'ingredient',
      }))

  return `Ты помощник трекера калорий. По фото еды оцени порцию на русском.

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
      "carbs": число,
      "source": "estimate"
    }
  ],
  "notes": "кратко"
}

Правила:
- Граммы и КБЖУ — ориентировочные (по виду порции). Точность не нужна.
- КБЖУ — на всю порцию (не на 100 г).
- ЗАПРЕЩЕНО 0/0/0/0 для еды; нули только у воды/чая без добавок.
- Одно составное блюдо на тарелке — обычно ОДНА позиция; гарнир+основное можно разделить, если явно видно.
- Короткое name по-русски.
- Если узнаёшь продукт из каталога — можно указать foodId, иначе foodId=null, needsEstimate=true, source="estimate".

eatingOut=${eatingOut}
mealType hint: ${mealType ?? 'угадай по типу еды (завтрак/обед/ужин/перекус)'}

Каталог (подсказка, можно игнорировать):
${JSON.stringify(catalog)}`
}

type CloudPhotoResponse = {
  mealType?: MealType
  eatingOut?: boolean
  items?: LlmResult['items']
  notes?: string
}

function draftFromParsed(
  parsed: LlmResult,
  foods: FoodRef[],
  mealType: MealType | undefined,
  eatingOut: boolean,
): ParsedMealDraft {
  const draft = mapLlmResultToDraft(parsed, foods, mealType, eatingOut, {
    forceApproximate: true,
    notesPrefix: PHOTO_MEAL_NOTES,
  })
  return { ...draft, parseSource: 'cloud' }
}

export async function parseMealFromPhoto(
  imageDataUrl: string,
  foods: FoodRef[],
  mealType: MealType | undefined,
  eatingOut: boolean,
): Promise<ParsedMealDraft> {
  if (!imageDataUrl.startsWith('data:image/')) {
    throw new Error('Нужен data URL изображения')
  }

  const foodPayload = foods.map((f) => ({
    id: f.id,
    name: f.name,
    aliases: f.aliases,
    per100g: f.per100g,
    kind: f.kind,
  }))

  // 1) Cloud Function — GEMINI_API_KEY остаётся на сервере
  if (isFirebaseConfigured()) {
    try {
      const callable = httpsCallable<
        {
          imageDataUrl: string
          mealType?: MealType
          eatingOut: boolean
          foods: FoodRef[]
        },
        CloudPhotoResponse
      >(getFirebaseFunctions(), 'parseMealPhoto')
      const result = await callable({
        imageDataUrl,
        mealType,
        eatingOut,
        foods: foodPayload,
      })
      return draftFromParsed(
        {
          mealType: result.data.mealType,
          eatingOut: result.data.eatingOut,
          items: result.data.items,
          notes: result.data.notes,
        },
        foods,
        mealType,
        eatingOut,
      )
    } catch {
      // fall through to client key
    }
  }

  // 2) Client free-tier key (AI Studio)
  if (!isGeminiConfigured()) {
    throw new Error(
      'Gemini не настроен — добавьте VITE_GEMINI_API_KEY или войдите в аккаунт с Cloud Functions',
    )
  }

  const prompt = buildParseMealPhotoPrompt({ mealType, eatingOut, foods })
  const parsed = await geminiJsonVision<LlmResult>(imageDataUrl, prompt)
  return draftFromParsed(parsed, foods, mealType, eatingOut)
}
