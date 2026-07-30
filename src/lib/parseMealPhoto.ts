import type { FoodRef, MealType, ParsedMealDraft } from '../types'
import { deepseekJsonVision, isDeepseekConfigured } from './deepseek'
import { mapLlmResultToDraft, type LlmResult } from './parseMealLlm'

export const PHOTO_MEAL_NOTES = 'Оценка по фото — проверьте граммы.'

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

export async function parseMealFromPhoto(
  imageDataUrl: string,
  foods: FoodRef[],
  mealType: MealType | undefined,
  eatingOut: boolean,
): Promise<ParsedMealDraft> {
  if (!isDeepseekConfigured()) {
    throw new Error('VITE_DEEPSEEK_API_KEY не задан — фото-разбор недоступен')
  }
  if (!imageDataUrl.startsWith('data:image/')) {
    throw new Error('Нужен data URL изображения')
  }

  const prompt = buildParseMealPhotoPrompt({ mealType, eatingOut, foods })
  const parsed = await deepseekJsonVision<LlmResult>([
    { type: 'image_url', image_url: { url: imageDataUrl } },
    { type: 'text', text: prompt },
  ])

  return mapLlmResultToDraft(parsed, foods, mealType, eatingOut, {
    forceApproximate: true,
    notesPrefix: PHOTO_MEAL_NOTES,
  })
}
