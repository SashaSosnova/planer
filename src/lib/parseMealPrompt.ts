import type { FoodRef, MealType } from '../types'

export function buildParseMealPrompt(input: {
  text: string
  mealType?: MealType
  eatingOut: boolean
  foods: FoodRef[]
}): string {
  const { text, mealType, eatingOut, foods } = input
  const catalog = eatingOut
    ? []
    : foods.map((f) => ({
        id: f.id,
        name: f.name,
        aliases: f.aliases,
        per100g: f.per100g,
        kind: f.kind ?? 'ingredient',
      }))

  const homeRules = `
ДОМА:
- Если фраза совпадает с блюдом/продуктом из каталога (kind=dish или полное название) + граммы — ОДНА позиция с этим foodId. НЕ дроби «паста с кабачком и курицей» на части.
- Короткие списки через запятую («хлеб 20 г, форель 10 г») — отдельные позиции.
- «кофе с молоком 2,5%» → кофе + молоко 2,5% (~60 г) — только для простых добавок.
- Есть в каталоге — foodId, needsEstimate=false.
`

  const outRules = `
ВНЕ ДОМА / сложное описание блюда:
- Одно составное блюдо (салат из …, заправка …, украшен …) + вес в конце («300 гр») = ОДНА позиция на весь вес.
- НЕ делай отдельную строку на каждый ингредиент (капуста, морковь, лук…).
- foodId=null, needsEstimate=true, оцени КБЖУ на всю порцию.
- Короткое name: суть блюда, напр. «Салат с курицей и овощами».
`

  const complexHint = `
ВАЖНО про сложные тексты:
Если это развёрнутое описание одного блюда с перечислением ингредиентов через запятую и граммы указаны один раз в конце — это ОДНА позиция, не список покупок.
`

  return `Ты помощник трекера калорий. Разбери текст на русском.

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

КБЖУ — ОБЯЗАТЕЛЬНО на всю порцию (не на 100 г):
- kcal, protein, fat, carbs — реалистичные числа для съеденного веса.
- ЗАПРЕЩЕНО ставить 0/0/0/0 для еды (стрипсы, курица, салат, паста и т.п.).
- Если точных данных нет — оцени типичные значения (например куриные стрипсы ~220–280 ккал / 100 г).
- Нули допустимы только у воды/чая без добавок (kcal≈0–2).

eatingOut=${eatingOut}
mealType hint: ${mealType ?? 'угадай по тексту (завтрак/обед/ужин/перекус) или времени'}
Если в тексте есть «обед:», «на ужин», «завтрак» — используй этот mealType.
${eatingOut ? outRules : homeRules}
${complexHint}

Каталог (только для дома):
${JSON.stringify(catalog)}

Текст:
${text}`
}

export function extractJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const raw = (fenced?.[1] ?? text).trim()
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('JSON not found')
  return JSON.parse(raw.slice(start, end + 1))
}
