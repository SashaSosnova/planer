import { Capacitor } from '@capacitor/core'

export class MealSpeechCancelled extends Error {
  constructor() {
    super('cancelled')
    this.name = 'MealSpeechCancelled'
  }
}

/**
 * Listen for one Russian phrase and return it.
 * Android opens the system speech window: inline recognition on this phone
 * starts, then comes back with an empty transcript.
 * Chrome uses the Web Speech API and ends on the first pause.
 */
export async function recognizeMealSpeech(): Promise<string> {
  if (Capacitor.getPlatform() === 'android') return recognizeAndroid()
  return recognizeWeb()
}

async function recognizeAndroid(): Promise<string> {
  const { SpeechRecognition } = await import('@capgo/capacitor-speech-recognition')
  const perm = await SpeechRecognition.requestPermissions()
  if (perm.speechRecognition !== 'granted') {
    throw new Error('Нужен доступ к микрофону, чтобы надиктовать приём.')
  }
  const availability = await SpeechRecognition.available()
  if (!availability.available) {
    throw new Error(
      'Распознавание речи недоступно. Проверьте, что на телефоне включён голосовой ввод Google.',
    )
  }
  try {
    const result = await SpeechRecognition.start({
      language: 'ru-RU',
      maxResults: 1,
      popup: true,
      partialResults: false,
      prompt: 'Скажите продукты и граммы',
    })
    return result.matches?.[0]?.trim() ?? ''
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message === '0') throw new MealSpeechCancelled()
    throw err instanceof Error ? err : new Error('Не удалось распознать речь.')
  }
}

function recognizeWeb(): Promise<string> {
  const ctor = webSpeechCtor()
  if (!ctor) {
    return Promise.reject(
      new Error(
        'Голосовой ввод в этом браузере недоступен. Откройте приложение на телефоне или Chrome.',
      ),
    )
  }
  const rec = new ctor()
  rec.lang = 'ru-RU'
  rec.continuous = false
  rec.interimResults = true
  return new Promise((resolve, reject) => {
    let transcript = ''
    rec.onresult = (event) => {
      let next = ''
      for (let i = 0; i < event.results.length; i += 1) {
        next += `${event.results[i][0]?.transcript ?? ''} `
      }
      transcript = next.replace(/\s+/g, ' ').trim()
    }
    rec.onerror = (event) => {
      if (event.error === 'aborted' || event.error === 'no-speech') {
        resolve(transcript)
        return
      }
      reject(new Error(fatalSpeechMessage(event.error) ?? 'Не удалось распознать речь.'))
    }
    rec.onend = () => resolve(transcript)
    try {
      rec.start()
    } catch {
      reject(new Error('Не удалось включить микрофон.'))
    }
  })
}

function fatalSpeechMessage(code: string): string | null {
  const c = code.toLowerCase()
  if (c.includes('permission') || c.includes('not-allowed') || c.includes('insufficient')) {
    return 'Нужен доступ к микрофону, чтобы надиктовать приём.'
  }
  if (c.includes('network') || c.includes('server')) {
    return 'Нет сети — распознавание речи не сработало.'
  }
  if (c.includes('audio')) return 'Микрофон недоступен.'
  return null
}

type WebSpeech = {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
}

function webSpeechCtor(): (new () => WebSpeech) | null {
  const w = window as Window & {
    SpeechRecognition?: new () => WebSpeech
    webkitSpeechRecognition?: new () => WebSpeech
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}
