// Web Speech API - lib.domに含まれていない型を補完
declare global {
  interface SpeechRecognitionEvent extends Event {
    results: SpeechRecognitionResultList
  }

  interface SpeechRecognitionErrorEvent extends Event {
    readonly error: string
    readonly message: string
  }

  interface SpeechRecognition extends EventTarget {
    lang: string
    continuous: boolean
    interimResults: boolean
    maxAlternatives: number
    onresult: ((event: SpeechRecognitionEvent) => void) | null
    onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
    onend: (() => void) | null
    start(): void
    stop(): void
    abort(): void
  }

  interface SpeechRecognitionConstructor {
    new (): SpeechRecognition
  }

  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }
}

export class VoiceRecorder {
  private recognition: SpeechRecognition | null = null

  isSupported(): boolean {
    return 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window
  }

  start(onResult: (text: string) => void, onError: (err: string) => void): void {
    if (!this.isSupported()) {
      onError('Web Speech API はこのブラウザでサポートされていません')
      return
    }

    const SpeechRecognitionImpl = window.SpeechRecognition || window.webkitSpeechRecognition

    if (!SpeechRecognitionImpl) {
      onError('SpeechRecognition の初期化に失敗しました')
      return
    }

    this.recognition = new SpeechRecognitionImpl()
    this.recognition.lang = 'ja-JP'
    this.recognition.continuous = false
    this.recognition.interimResults = false

    this.recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0][0].transcript
      onResult(transcript)
    }

    this.recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      onError(`音声認識エラー: ${event.error}`)
    }

    this.recognition.onend = () => {
      this.recognition = null
    }

    this.recognition.start()
  }

  stop(): void {
    if (this.recognition) {
      this.recognition.stop()
      this.recognition = null
    }
  }
}
