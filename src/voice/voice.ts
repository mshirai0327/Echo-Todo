type SpeechRecognitionResultEvent = Event & {
  results: SpeechRecognitionResultList
}

type SpeechRecognitionErrorEventLike = Event & {
  readonly error: string
}

type SpeechRecognitionLike = EventTarget & {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

export type VoiceError =
  | 'audio-capture'
  | 'no-speech'
  | 'not-allowed'
  | 'not-supported'
  | 'service-not-allowed'
  | string

export class VoiceRecorder {
  private recognition: SpeechRecognitionLike | null = null

  isSupported(): boolean {
    return Boolean(this.getRecognitionConstructor())
  }

  async ensureMicrophoneAccess(): Promise<VoiceError | null> {
    if (!navigator.mediaDevices?.getUserMedia) return null

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((track) => track.stop())
      return null
    } catch (error) {
      if (!(error instanceof DOMException)) return 'not-allowed'

      if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
        return 'not-allowed'
      }

      if (
        error.name === 'NotFoundError' ||
        error.name === 'DevicesNotFoundError' ||
        error.name === 'NotReadableError' ||
        error.name === 'TrackStartError'
      ) {
        return 'audio-capture'
      }

      return 'not-allowed'
    }
  }

  start(onResult: (text: string) => void, onError: (error: VoiceError) => void): void {
    const Impl = this.getRecognitionConstructor()
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

  private getRecognitionConstructor(): SpeechRecognitionConstructor | null {
    const recognitionWindow = window as Window & {
      SpeechRecognition?: SpeechRecognitionConstructor
      webkitSpeechRecognition?: SpeechRecognitionConstructor
    }

    return recognitionWindow.SpeechRecognition || recognitionWindow.webkitSpeechRecognition || null
  }
}
