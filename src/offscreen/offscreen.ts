// Web Speech API 型補完
declare global {
  interface SpeechRecognitionEvent extends Event {
    results: SpeechRecognitionResultList
  }
  interface SpeechRecognitionErrorEvent extends Event {
    readonly error: string
  }
  interface SpeechRecognition extends EventTarget {
    lang: string
    continuous: boolean
    interimResults: boolean
    onresult: ((e: SpeechRecognitionEvent) => void) | null
    onerror: ((e: SpeechRecognitionErrorEvent) => void) | null
    onend: (() => void) | null
    start(): void
    stop(): void
  }
  interface Window {
    SpeechRecognition?: new () => SpeechRecognition
    webkitSpeechRecognition?: new () => SpeechRecognition
  }
}

declare const chrome: {
  runtime: {
    onMessage: { addListener(cb: (msg: Record<string, unknown>) => void): void }
    sendMessage(msg: Record<string, unknown>): void
  }
}

let recognition: SpeechRecognition | null = null

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.target !== 'offscreen') return

  if (msg.action === 'voice_start') {
    startRecognition()
  } else if (msg.action === 'voice_stop') {
    stopRecognition()
  }
})

function startRecognition(): void {
  const Impl = window.SpeechRecognition || window.webkitSpeechRecognition
  if (!Impl) {
    chrome.runtime.sendMessage({ action: 'voice_error', error: 'not-supported' })
    return
  }

  // マイク権限を取得してから SpeechRecognition を起動する
  navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
    stream.getTracks().forEach((t) => t.stop())
    runRecognition(Impl)
  }).catch((err: Error) => {
    chrome.runtime.sendMessage({ action: 'voice_error', error: `mic-denied: ${err.message}` })
  })
}

function runRecognition(Impl: new () => SpeechRecognition): void {
  recognition = new Impl()
  recognition.lang = 'ja-JP'
  recognition.continuous = false
  recognition.interimResults = false

  recognition.onresult = (e: SpeechRecognitionEvent) => {
    const text = e.results[0][0].transcript
    chrome.runtime.sendMessage({ action: 'voice_result', text })
  }

  recognition.onerror = (e: SpeechRecognitionErrorEvent) => {
    // エラーコードを詳細ログ出力して送信
    console.error('[Echo-Todo offscreen] SpeechRecognition error:', e.error)
    chrome.runtime.sendMessage({ action: 'voice_error', error: e.error })
    recognition = null
  }

  recognition.onend = () => {
    recognition = null
  }

  recognition.start()
}

function stopRecognition(): void {
  if (recognition) {
    recognition.stop()
    recognition = null
  }
}
