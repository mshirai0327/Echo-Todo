declare const chrome: {
  runtime: {
    sendMessage(msg: Record<string, unknown>): void
    onMessage: {
      addListener(cb: (msg: Record<string, unknown>) => void): void
      removeListener(cb: (msg: Record<string, unknown>) => void): void
    }
  }
}

export class VoiceRecorder {
  private listener: ((msg: Record<string, unknown>) => void) | null = null

  isSupported(): boolean {
    return typeof chrome !== 'undefined' && !!chrome.runtime
  }

  start(onResult: (text: string) => void, onError: (err: string) => void): void {
    this.listener = (msg: Record<string, unknown>) => {
      if (msg.action === 'voice_result' && typeof msg.text === 'string') {
        onResult(msg.text)
        this.cleanup()
      } else if (msg.action === 'voice_error' && typeof msg.error === 'string') {
        onError(`音声認識エラー: ${msg.error}`)
        this.cleanup()
      }
    }
    chrome.runtime.onMessage.addListener(this.listener)
    chrome.runtime.sendMessage({ action: 'voice_start' })
  }

  stop(): void {
    chrome.runtime.sendMessage({ action: 'voice_stop' })
    this.cleanup()
  }

  private cleanup(): void {
    if (this.listener) {
      chrome.runtime.onMessage.removeListener(this.listener)
      this.listener = null
    }
  }
}
