import type { MealType } from '../types'

/** One line after LLM split — grams null = weight not stated in text. */
export type MealSplitLine = {
  name: string
  /** null when the user did not write a weight → use catalog portion. */
  grams: number | null
}

export type MealSplitResult = {
  mealType?: MealType
  eatingOut?: boolean
  items: MealSplitLine[]
  notes?: string
}

export type MacroEstimateLine = {
  name: string
  grams: number
  kcal: number
  protein: number
  fat: number
  carbs: number
}

/** LLM step 1: only split text into product + optional weight. */
export function buildMealSplitPrompt(input: {
  text: string
  mealType?: MealType
  eatingOut: boolean
}): string {
  const { text, mealType, eatingOut } = input
  return `Ты помощник трекера калорий. Разбей текст на отдельные продукты.

Верни ТОЛЬКО JSON без markdown:
{
  "mealType": "breakfast"|"lunch"|"dinner"|"snack",
  "eatingOut": ${eatingOut},
  "items": [
    { "name": "строка", "grams": число_или_null }
  ],
  "notes": ""
}

Правила:
- Каждая строка / позиция через запятую / «и» между короткими названиями — отдельный item.
- name — продукт без веса (например «яйцо куриное», «сыр пармезан»).
- grams: ЧИСЛО только если вес ЯВНО написан (г, гр, мл, кг). Иначе grams = null.
- ЗАПРЕЩЕНО: штуки как граммы («яйцо» → null, не 1 и не 2).
- «2 яйца» без веса в граммах → одна позиция name «яйцо», grams null (приложение подставит порцию из справочника; лучше указать «2 яйца 110 г» если нужно).
- «кофе с молоком» → две позиции: кофе + молоко (grams null) ИЛИ одна «кофе с молоком» с grams null.
- НЕ считай КБЖУ. НЕ подставляй foodId.
- eatingOut=${eatingOut}: если true и это одно сложное блюдо кафе — одна позиция, короткое name.
- mealType hint: ${mealType ?? 'угадай по тексту (завтрак/обед/ужин/перекус)'}
- Если в тексте есть «завтрак:», «на обед» — используй этот mealType.

Текст:
${text}`
}

/** LLM step 2: КБЖУ only for products missing from the catalog. */
export function buildMealEstimatePrompt(items: Array<{ name: string; grams: number }>): string {
  return `Оцени КБЖУ для порций (не на 100 г — на указанный вес).

Верни ТОЛЬКО JSON без markdown:
{
  "items": [
    {
      "name": "как во входе",
      "grams": число,
      "kcal": число,
      "protein": число,
      "fat": число,
      "carbs": число
    }
  ]
}

Правила:
- Верни ровно ${items.length} позиций, тот же порядок и name/grams.
- Реалистичные значения на всю порцию.
- «кофе с молоком» / латте — десятки ккал, НЕ ~2–4 как чёрный кофе.
- Вода / чёрный чай / американо без молока — ок ~0–5 ккал.

Позиции:
${JSON.stringify(items)}`
}
