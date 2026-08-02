const MIN_TEXT_LEN = 8

/**
 * Local OCR (Tesseract) for label/menu photos.
 * Uses rus+eng; traineddata downloaded from CDN on first use (not in APK bundle).
 */
export async function recognizeImageText(imageDataUrl: string): Promise<string> {
  if (!imageDataUrl.startsWith('data:image/')) {
    throw new Error('Нужен data URL изображения')
  }

  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker(['rus', 'eng'])

  try {
    const {
      data: { text },
    } = await worker.recognize(imageDataUrl)
    const cleaned = text.replace(/\s+/g, ' ').trim()
    if (cleaned.length < MIN_TEXT_LEN) {
      throw new Error('На фото мало текста — снимите этикетку или меню ближе и ярче')
    }
    return cleaned
  } finally {
    await worker.terminate()
  }
}
