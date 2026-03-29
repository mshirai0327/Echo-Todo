import {
  addTask,
  closeTask,
  getAllTasks,
  getSettings,
  getStats,
  initDB,
  saveSettings,
  saveStats,
  type Task,
  type Settings,
  updateTask,
} from '../storage/db'
import { extractTasks } from '../llm/llm'
import { VoiceRecorder } from '../voice/voice'

// ====== ユーティリティ ======

function formatDuration(ms: number): string {
  if (ms <= 0) return '--'
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return `${days}日${hours % 24}時間`
  if (hours > 0) return `${hours}時間${minutes % 60}分`
  if (minutes > 0) return `${minutes}分`
  return `${totalSeconds}秒`
}

function showToast(message: string, type: 'success' | 'error' | 'info' = 'info'): void {
  const container = document.getElementById('toast-container')
  if (!container) return

  const toast = document.createElement('div')
  toast.className = `toast ${type}`
  toast.textContent = message
  container.appendChild(toast)

  setTimeout(() => {
    toast.classList.add('removing')
    toast.addEventListener('animationend', () => toast.remove())
  }, 2500)
}

function activateTab(tabId: 'main' | 'stats' | 'settings'): void {
  const tabBtns = document.querySelectorAll('.tab-btn')
  tabBtns.forEach((btn) => {
    btn.classList.toggle('active', (btn as HTMLElement).dataset.tab === tabId)
  })

  document.querySelectorAll('.tab-content').forEach((content) => {
    content.classList.remove('active')
  })

  const target = document.getElementById(`tab-${tabId}`)
  if (target) target.classList.add('active')
}

// ====== タスクUI ======

function createTaskElement(task: Task): HTMLElement {
  const item = document.createElement('div')
  item.className = 'task-item'
  item.dataset.id = task.id

  const checkBtn = document.createElement('button')
  checkBtn.className = 'task-check-btn'
  checkBtn.title = '完了'
  checkBtn.textContent = '✓'

  const textEl = document.createElement('div')
  textEl.className = 'task-text'
  textEl.textContent = task.text

  item.appendChild(checkBtn)
  item.appendChild(textEl)

  checkBtn.addEventListener('click', () => {
    handleCloseTask(task, item)
  })

  textEl.addEventListener('click', () => {
    startEditingTask(task, textEl)
  })

  return item
}

function startEditingTask(task: Task, textEl: HTMLElement): void {
  if (textEl.querySelector('input')) return // すでに編集中

  const original = task.text
  const input = document.createElement('input')
  input.type = 'text'
  input.className = 'task-edit-input'
  input.value = original

  textEl.textContent = ''
  textEl.appendChild(input)
  input.focus()
  input.select()

  const commit = async () => {
    const newText = input.value.trim()
    if (newText && newText !== original) {
      task.text = newText
      await updateTask(task)
    }
    textEl.textContent = task.text
  }

  const cancel = () => {
    task.text = original
    textEl.textContent = original
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commit() }
    if (e.key === 'Escape') { e.preventDefault(); cancel() }
  })

  input.addEventListener('blur', commit)
}

async function handleCloseTask(task: Task, element: HTMLElement): Promise<void> {
  element.classList.add('completing')

  await new Promise<void>((resolve) => {
    element.addEventListener('animationend', () => resolve(), { once: true })
  })

  await closeTask(task)
  element.remove()

  showToast('お疲れ様！✨', 'success')

  // 統計更新（statsタブが表示中なら）
  if (document.getElementById('tab-stats')?.classList.contains('active')) {
    await renderStats()
  }

  updateEmptyState()
}

function updateEmptyState(): void {
  const list = document.getElementById('task-list')
  const emptyState = document.getElementById('empty-state')
  if (!list || !emptyState) return

  const tasks = list.querySelectorAll('.task-item')
  emptyState.style.display = tasks.length === 0 ? '' : 'none'
}

async function renderTasks(): Promise<void> {
  const list = document.getElementById('task-list')
  const emptyState = document.getElementById('empty-state')
  if (!list || !emptyState) return

  const tasks = await getAllTasks()
  const now = Date.now()
  const activeTasks = tasks.filter((t) => t.expireAt > now)

  // 既存のタスクアイテムをクリア（emptyStateは残す）
  const existingItems = list.querySelectorAll('.task-item')
  existingItems.forEach((el) => el.remove())

  activeTasks.sort((a, b) => b.createdAt - a.createdAt)

  for (const task of activeTasks) {
    const el = createTaskElement(task)
    list.insertBefore(el, emptyState)
  }

  emptyState.style.display = activeTasks.length === 0 ? '' : 'none'
}

// ====== タスク追加 ======

async function addTasksFromText(text: string): Promise<void> {
  const trimmed = text.trim()
  if (!trimmed) return

  const statusEl = document.getElementById('voice-status')

  try {
    const settings = await getSettings()
    if (statusEl) {
      const processingLabel =
        settings.llmMode === 'input'
          ? 'タスクを追加中...'
          : settings.llmMode === 'nano'
          ? 'Gemini Nano で整理中...'
          : settings.llmMode === 'gemini'
            ? 'Gemini API で整理中...'
            : 'タスクを整理中...'
      statusEl.innerHTML = `<div class="processing-indicator"><div class="spinner"></div> ${processingLabel}</div>`
    }

    const taskTexts = await extractTasks(trimmed, settings)

    const now = Date.now()
    const ttlMs = settings.ttlHours * 3600 * 1000

    for (const taskText of taskTexts) {
      if (!taskText.trim()) continue
      const task: Task = {
        id: crypto.randomUUID(),
        text: taskText.trim(),
        createdAt: now,
        expireAt: now + ttlMs,
      }
      await addTask(task)
    }

    const stats = await getStats()
    stats.totalCreated += taskTexts.filter((task) => task.trim()).length
    await saveStats(stats)

    await renderTasks()
    showToast(`${taskTexts.length}件のタスクを追加しました 🌟`, 'success')
  } catch (e) {
    console.error('タスク追加エラー:', e)
    showToast('タスクの追加に失敗しました', 'error')
  } finally {
    if (statusEl) statusEl.textContent = ''
  }
}

// ====== 音声入力 ======

const voiceRecorder = new VoiceRecorder()
let isRecording = false

function setupVoiceInput(): void {
  const micBtn = document.getElementById('mic-btn')
  if (!micBtn) return

  if (!voiceRecorder.isSupported()) {
    micBtn.setAttribute('disabled', 'true')
    micBtn.setAttribute('title', '音声入力はこのブラウザでサポートされていません')
    return
  }

  micBtn.addEventListener('click', () => {
    if (isRecording) {
      voiceRecorder.stop()
      setRecordingState(false)
    } else {
      startRecording()
    }
  })
}

function startRecording(): void {
  const statusEl = document.getElementById('voice-status')

  setRecordingState(true)
  if (statusEl) statusEl.textContent = '🔴 録音中... 話しかけてください'

  voiceRecorder.start(
    async (text) => {
      setRecordingState(false)
      if (statusEl) statusEl.textContent = `認識: "${text}"`
      await addTasksFromText(text)
    },
    (error) => {
      setRecordingState(false)
      if (statusEl) statusEl.textContent = ''

      const message =
        error === 'not-allowed' || error === 'service-not-allowed'
          ? 'マイクの許可が必要です'
          : error === 'no-speech'
            ? '声をうまく認識できませんでした'
            : error === 'audio-capture'
              ? 'マイク入力を取得できませんでした'
              : error === 'not-supported'
                ? '音声入力はこのブラウザでサポートされていません'
                : `音声入力エラー: ${error}`

      showToast(message, 'error')
    },
  )
}

function setRecordingState(recording: boolean): void {
  isRecording = recording
  const micBtn = document.getElementById('mic-btn')
  if (!micBtn) return

  if (recording) {
    micBtn.classList.add('recording')
    micBtn.textContent = '⏹️'
  } else {
    micBtn.classList.remove('recording')
    micBtn.textContent = '🎤'
  }
}

// ====== テキスト入力 ======

function setupTextInput(): void {
  const input = document.getElementById('task-input') as HTMLTextAreaElement | null
  const addBtn = document.getElementById('add-btn')

  if (!input || !addBtn) return

  // Enterキーで送信（Shift+Enterは改行）
  input.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      const text = input.value
      input.value = ''
      await addTasksFromText(text)
    }
  })

  addBtn.addEventListener('click', async () => {
    const text = input.value
    input.value = ''
    await addTasksFromText(text)
  })

  // 自動リサイズ
  input.addEventListener('input', () => {
    input.style.height = 'auto'
    input.style.height = Math.min(input.scrollHeight, 80) + 'px'
  })
}

// ====== 統計表示 ======

async function renderStats(): Promise<void> {
  const stats = await getStats()

  const createdEl = document.getElementById('stat-created')
  const closedEl = document.getElementById('stat-closed')
  const expiredEl = document.getElementById('stat-expired')
  const avgTimeEl = document.getElementById('stat-avg-time')

  if (createdEl) createdEl.textContent = String(stats.totalCreated)
  if (closedEl) closedEl.textContent = String(stats.totalClosed)
  if (expiredEl) expiredEl.textContent = String(stats.totalExpired)
  if (avgTimeEl) {
    avgTimeEl.textContent =
      stats.totalClosed > 0 ? formatDuration(stats.avgCloseDurationMs) : '--'
  }
}

// ====== 設定 ======

async function renderSettings(): Promise<void> {
  const settings = await getSettings()

  const ttlInput = document.getElementById('ttl-input') as HTMLInputElement | null
  const llmMode = document.getElementById('llm-mode') as HTMLSelectElement | null
  const apiKeyInput = document.getElementById('api-key-input') as HTMLInputElement | null
  const apiKeyGroup = document.getElementById('api-key-group')

  if (ttlInput) ttlInput.value = String(settings.ttlHours)
  if (llmMode) llmMode.value = settings.llmMode
  if (apiKeyInput) apiKeyInput.value = settings.apiKey ?? ''
  updateApiKeyVisibility(settings.llmMode, apiKeyGroup)
}

function updateApiKeyVisibility(mode: Settings['llmMode'], apiKeyGroup: HTMLElement | null): void {
  if (!apiKeyGroup) return
  if (mode === 'nano' || mode === 'gemini') {
    apiKeyGroup.classList.add('visible')
  } else {
    apiKeyGroup.classList.remove('visible')
  }
}

function setupSettings(): void {
  const llmMode = document.getElementById('llm-mode') as HTMLSelectElement | null
  const apiKeyGroup = document.getElementById('api-key-group')
  const saveBtn = document.getElementById('save-settings-btn')

  if (llmMode && apiKeyGroup) {
    llmMode.addEventListener('change', () => {
      updateApiKeyVisibility(llmMode.value as Settings['llmMode'], apiKeyGroup)
    })
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      const ttlInput = document.getElementById('ttl-input') as HTMLInputElement | null
      const llmModeEl = document.getElementById('llm-mode') as HTMLSelectElement | null
      const apiKeyInput = document.getElementById('api-key-input') as HTMLInputElement | null

      const ttlHours = ttlInput ? parseInt(ttlInput.value, 10) : 72
      const llmMode = (llmModeEl?.value ?? 'input') as Settings['llmMode']
      const apiKey = apiKeyInput?.value.trim() || undefined

      if (isNaN(ttlHours) || ttlHours < 1) {
        showToast('有効期限は1以上の数値を入力してください', 'error')
        return
      }

      const settings: Settings = {
        ttlHours,
        llmMode,
        apiKey,
      }

      await saveSettings(settings)
      showToast('設定を保存しました 💾', 'success')
    })
  }
}

// ====== タブ切り替え ======

function setupTabs(): void {
  const tabBtns = document.querySelectorAll('.tab-btn')

  tabBtns.forEach((btn) => {
    btn.addEventListener('click', async () => {
      const tabId = (btn as HTMLElement).dataset.tab
      if (!tabId) return

      activateTab(tabId as 'main' | 'stats' | 'settings')

      // 各タブのデータ更新
      if (tabId === 'main') {
        await renderTasks()
      } else if (tabId === 'stats') {
        await renderStats()
      } else if (tabId === 'settings') {
        await renderSettings()
      }
    })
  })
}

// ====== 初期化 ======

async function init(): Promise<void> {
  await initDB()

  setupTabs()
  setupTextInput()
  setupVoiceInput()
  setupSettings()

  await renderTasks()
}

document.addEventListener('DOMContentLoaded', () => {
  init().catch(console.error)
})
