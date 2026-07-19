import { extractJsonObject } from './parseMealPrompt'

const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions'
/** Fast V4 tier — user asked for flash */
export const DEEPSEEK_MODEL = 'deepseek-v4-flash'

export function isDeepseekConfigured(): boolean {
  return Boolean(import.meta.env.VITE_DEEPSEEK_API_KEY)
}

export async function deepseekChat(prompt: string): Promise<string> {
  const apiKey = import.meta.env.VITE_DEEPSEEK_API_KEY as string | undefined
  if (!apiKey) {
    throw new Error('VITE_DEEPSEEK_API_KEY не задан')
  }

  const res = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content:
            'Ты помощник трекера калорий. Отвечай только валидным JSON без markdown и без пояснений вне JSON.',
        },
        { role: 'user', content: prompt },
      ],
      // Non-thinking mode for speed (flash)
      thinking: { type: 'disabled' },
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`DeepSeek HTTP ${res.status}: ${body.slice(0, 240)}`)
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const text = data.choices?.[0]?.message?.content?.trim() ?? ''
  if (!text) throw new Error('Пустой ответ DeepSeek')
  return text
}

export async function deepseekJson<T>(prompt: string): Promise<T> {
  const text = await deepseekChat(prompt)
  return extractJsonObject(text) as T
}
