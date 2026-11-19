import { Capacitor, type PluginListenerHandle } from '@capacitor/core'
import type { SpeechRecognitionPartialResultEvent } from '@capgo/capacitor-speech-recognition'

export type MealDictation = {
  /** End listening and return the raw transcript. */
  stop: () => Promise<string>
}

/**
 * Start Russian dictation.
 * On Android this uses the system recognizer and keeps listening through pauses.
 * In Chrome it uses the Web Speech API.
 */
export async function startMealDictation(
  onPartial: (transcript: string) => void,
  onError?: (error: Error) => void,
): Promise<MealDictation> {
  if (Capacitor.isNativePlatform()) return startNative(onPartial, onError)
  return startWeb(onPartial, onError)
}

async function startNative(
  onPartial: (transcript: string) => void,
  onError?: (error: Error) => void,
): Promise<MealDictation> {
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

  let want = true
  let sealed = ''
  let tail = ''
  let live = false
  let starting = false
  let fatal: Error | null = null
  let sawStopped = false
  let stopWait: (() => void) | null = null
  const handles: PluginListenerHandle[] = []

  const emit = () => onPartial(joinTranscript(sealed, tail))

  const begin = async () => {
    if (!want || starting || live) return
    starting = true
    try {
      await SpeechRecognition.setPTTState({ held: true, mute: true })
      await SpeechRecognition.start({
        language: 'ru-RU',
        maxResults: 1,
        partialResults: true,
        popup: false,
        continuousPTT: true,
        muteRecognizerBeep: true,
      })
      live = true
    } finally {
      starting = false
    }
  }

  const cleanup = async () => {
    await Promise.all(handles.map((handle) => handle.remove().catch(() => undefined)))
    handles.length = 0
  }

  handles.push(
    await SpeechRecognition.addListener('partialResults', (event) => {
      tail = partialText(event)
      emit()
    }),
  )
  const fail = (error: Error) => {
    fatal = error
    want = false
    onError?.(error)
  }

  handles.push(
    await SpeechRecognition.addListener('listeningState', (event) => {
      const stopped = event.status === 'stopped' || event.state === 'stopped'
      if (!stopped) {
        if (event.status === 'started' || event.state === 'started') live = true
        return
      }
      live = false
      if (!want) {
        sawStopped = true
        stopWait?.()
        return
      }
    }),
  )
  handles.push(
    await SpeechRecognition.addListener('error', (event) => {
      const message = fatalSpeechMessage(event.code)
      if (!message) return
      fail(new Error(message))
    }),
  )

  try {
    await begin()
  } catch (err) {
    await cleanup()
    throw err instanceof Error ? err : new Error('Не удалось включить микрофон.')
  }

  return {
    async stop() {
      want = false
      const finished = new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 2500)
        stopWait = () => {
          clearTimeout(timer)
          resolve()
        }
        if (sawStopped) {
          clearTimeout(timer)
          resolve()
        }
      })
      let snapshot = ''
      try {
        await SpeechRecognition.setPTTState({ held: false })
      } catch {
        /* already idle */
      }
      try {
        await SpeechRecognition.stop()
      } catch {
        /* session already ended */
      }
      try {
        const last = await SpeechRecognition.getLastPartialResult()
        snapshot = last.text?.trim() ?? ''
      } catch {
        /* cache already cleared */
      }
      await finished
      await new Promise((resolve) => setTimeout(resolve, 200))
      const transcript = joinTranscript(sealed, tail, snapshot)
      await cleanup()
      if (!transcript && fatal) throw fatal
      return transcript
    },
  }
}

function partialText(event: SpeechRecognitionPartialResultEvent): string {
  if (event.accumulatedText?.trim()) return event.accumulatedText.trim()
  const accumulated = event.accumulated?.trim() ?? ''
  const match = event.matches?.[0]?.trim() ?? ''
  if (!accumulated) return match
  if (!match || accumulated.endsWith(match)) return accumulated
  if (match.endsWith(accumulated)) return match
  return `${accumulated} ${match}`.trim()
}

function fatalSpeechMessage(code: string): string | null {
  const c = code.toLowerCase()
  if (
    c.includes('permission') ||
    c.includes('not-allowed') ||
    c.includes('insufficient') ||
    c === '9'
  ) {
    return 'Нужен доступ к микрофону, чтобы надиктовать приём.'
  }
  if (c.includes('network') || c.includes('server') || c === '2' || c === '4') {
    return 'Нет сети — распознавание речи не сработало.'
  }
  if (c.includes('audio') || c === '3') return 'Микрофон недоступен.'
  return null
}

function startWeb(
  onPartial: (transcript: string) => void,
  onError?: (error: Error) => void,
): Promise<MealDictation> {
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
  rec.continuous = true
  rec.interimResults = true

  let transcript = ''
  let stopped = false
  let fatal: Error | null = null

  rec.onresult = (event) => {
    let next = ''
    for (let i = 0; i < event.results.length; i += 1) {
      next += `${event.results[i][0]?.transcript ?? ''} `
    }
    transcript = next.replace(/\s+/g, ' ').trim()
    onPartial(transcript)
  }
  rec.onerror = (event) => {
    if (event.error === 'aborted' || event.error === 'no-speech') return
    fatal = new Error(fatalSpeechMessage(event.error) ?? 'Не удалось распознать речь.')
    stopped = true
    onError?.(fatal)
  }
  rec.onend = () => {
    if (stopped || fatal) return
    try {
      rec.start()
    } catch {
      stopped = true
    }
  }

  try {
    rec.start()
  } catch {
    return Promise.reject(new Error('Не удалось включить микрофон.'))
  }

  return Promise.resolve({
    stop() {
      stopped = true
      return new Promise((resolve, reject) => {
        let settled = false
        const finish = () => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          if (!transcript && fatal) reject(fatal)
          else resolve(transcript.trim())
        }
        const timer = setTimeout(finish, 1200)
        rec.onend = finish
        try {
          rec.stop()
        } catch {
          finish()
        }
      })
    },
  })
}

type WebSpeech = {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
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

function joinTranscript(...parts: string[]): string {
  let out = ''
  for (const part of parts) {
    const bit = part.replace(/\s+/g, ' ').trim()
    if (!bit) continue
    if (!out || bit === out || out.endsWith(bit)) continue
    if (bit.startsWith(out) || bit.endsWith(out)) {
      out = bit.length >= out.length ? bit : out
      continue
    }
    out = `${out} ${bit}`
  }
  return out.replace(/\s+/g, ' ').trim()
}
