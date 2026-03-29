declare global {
  interface SpeechRecognitionEvent extends Event {
    results: SpeechRecognitionResultList
  }

  interface SpeechRecognitionErrorEvent extends Event {
    error: string
  }

  interface SpeechRecognition extends EventTarget {
    lang: string
    continuous: boolean
    interimResults: boolean
    onresult: ((event: SpeechRecognitionEvent) => void) | null
    onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
    onend: (() => void) | null
    start(): void
    stop(): void
  }

  interface Window {
    SpeechRecognition?: new () => SpeechRecognition
    webkitSpeechRecognition?: new () => SpeechRecognition
  }
}

export class VoiceRecorder {
  private recognition: SpeechRecognition | null = null

  isSupported(): boolean {
    return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
  }

  start(onResult: (text: string) => void, onError: (error: string) => void): void {
    const Impl = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!Impl) {
      onError('not-supported')
      return
    }

    this.recognition = new Impl()
    this.recognition.lang = 'ja-JP'
    this.recognition.continuous = false
    this.recognition.interimResults = false

    this.recognition.onresult = (event) => {
      const text = event.results[0]?.[0]?.transcript ?? ''
      this.cleanup()
      onResult(text)
    }

    this.recognition.onerror = (event) => {
      this.cleanup()
      onError(event.error)
    }

    this.recognition.onend = () => {
      this.cleanup()
    }

    this.recognition.start()
  }

  stop(): void {
    this.recognition?.stop()
    this.cleanup()
  }

  private cleanup(): void {
    if (!this.recognition) return
    this.recognition.onresult = null
    this.recognition.onerror = null
    this.recognition.onend = null
    this.recognition = null
  }
}
