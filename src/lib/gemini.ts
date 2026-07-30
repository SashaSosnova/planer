import { extractJsonObject } from './parseMealPrompt'

/** Free-tier friendly Flash — vision + text. */
export const GEMINI_FLASH_MODEL = 'gemini-2.0-flash'

const GEMINI_URL = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`

export function isGeminiConfigured(): boolean {
  return Boolean(import.meta.env.VITE_GEMINI_API_KEY)
}

export function splitImageDataUrl(dataUrl: string): { mimeType: string; base64: string } {
  const m = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/)
  if (!m?.[1] || !m[2]) {
    throw new Error('Нужен data URL изображения')
  }
  return { mimeType: m[1], base64: m[2].replace(/\s/g, '') }
}

export async function geminiJsonVision<T>(
  imageDataUrl: string,
  prompt: string,
  options?: { temperature?: number },
): Promise<T> {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined
  if (!apiKey) {
    throw new Error('VITE_GEMINI_API_KEY не задан')
  }

  const { mimeType, base64 } = splitImageDataUrl(imageDataUrl)
  const temperature = options?.temperature ?? 0.2

  const res = await fetch(`${GEMINI_URL(GEMINI_FLASH_MODEL)}?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            { inline_data: { mime_type: mimeType, data: base64 } },
          ],
        },
      ],
      generationConfig: { temperature },
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Gemini HTTP ${res.status}: ${body.slice(0, 240)}`)
  }

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    error?: { message?: string }
  }
  if (data.error?.message) {
    throw new Error(data.error.message)
  }
  const text =
    data.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? '')
      .join('')
      .trim() ?? ''
  if (!text) throw new Error('Пустой ответ Gemini')
  return extractJsonObject(text) as T
}
