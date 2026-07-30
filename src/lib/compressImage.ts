const DEFAULT_MAX_SIDE = 1280
const DEFAULT_QUALITY = 0.7

function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Не удалось прочитать фото'))
    }
    img.src = url
  })
}

/**
 * Resize image to max long side and encode as JPEG data URL for vision API.
 */
export async function compressImageFile(
  file: Blob,
  maxSide = DEFAULT_MAX_SIDE,
  quality = DEFAULT_QUALITY,
): Promise<string> {
  const img = await loadImageFromBlob(file)
  const w = img.naturalWidth || img.width
  const h = img.naturalHeight || img.height
  if (!(w > 0 && h > 0)) {
    throw new Error('Некорректный размер фото')
  }

  const scale = Math.min(1, maxSide / Math.max(w, h))
  const tw = Math.max(1, Math.round(w * scale))
  const th = Math.max(1, Math.round(h * scale))

  const canvas = document.createElement('canvas')
  canvas.width = tw
  canvas.height = th
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas недоступен')
  ctx.drawImage(img, 0, 0, tw, th)

  const dataUrl = canvas.toDataURL('image/jpeg', quality)
  if (!dataUrl.startsWith('data:image/jpeg')) {
    throw new Error('Не удалось сжать фото')
  }
  return dataUrl
}
