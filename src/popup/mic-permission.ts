import { VoiceRecorder, type VoiceError } from '../voice/voice'

const voiceRecorder = new VoiceRecorder()

function getVoiceErrorMessage(error: VoiceError): string {
  return error === 'not-allowed' || error === 'service-not-allowed'
    ? 'マイクの許可が拒否されました。Chrome のサイト設定か OS のマイク設定を見直してください。'
    : error === 'audio-capture'
      ? 'マイク入力を取得できませんでした。マイク未接続や他アプリ使用中の可能性があります。'
      : error === 'not-supported'
        ? 'この環境では音声入力がサポートされていません。'
        : `音声入力エラー: ${error}`
}

function setStatus(message: string, type: 'success' | 'error' | 'info' = 'info'): void {
  const statusEl = document.getElementById('status')
  if (!statusEl) return

  statusEl.textContent = message
  statusEl.className = type === 'info' ? '' : type
}

async function requestMicrophoneAccess(): Promise<void> {
  const requestButton = document.getElementById('request-btn') as HTMLButtonElement | null
  if (requestButton) requestButton.disabled = true

  setStatus('Chrome のマイク許可を確認しています...')

  try {
    const error = await voiceRecorder.ensureMicrophoneAccess()
    if (error) {
      setStatus(getVoiceErrorMessage(error), 'error')
      return
    }

    setStatus(
      'マイクを許可しました。このタブを閉じて、Echo-Todo のポップアップで再度マイクを押してください。',
      'success',
    )
  } finally {
    if (requestButton) requestButton.disabled = false
  }
}

function setupPage(): void {
  const originEl = document.getElementById('origin')
  if (originEl) originEl.textContent = window.location.origin

  const requestButton = document.getElementById('request-btn')
  requestButton?.addEventListener('click', () => {
    void requestMicrophoneAccess()
  })

  const closeButton = document.getElementById('close-btn')
  closeButton?.addEventListener('click', () => {
    window.close()
  })
}

document.addEventListener('DOMContentLoaded', setupPage)
