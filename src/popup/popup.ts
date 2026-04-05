import {
  addTask,
  closeTask,
  expireTask,
  getAllTasks,
  getSettings,
  getStats,
  initDB,
  saveSettings,
  saveStats,
  type Task,
  updateTask,
} from '../storage/db'
import { splitByRules } from '../llm/llm'
import { VoiceRecorder, type VoiceError } from '../voice/voice'

// ====== ユーティリティ ======

const EXPIRED_TASK_INITIAL_DELAY_MS = 200
const EXPIRED_TASK_STAGGER_MS = 300

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

function formatTtl(expireAt: number): string {
  const remaining = expireAt - Date.now()
  if (remaining <= 0) return '期限切れ'
  const totalMinutes = Math.ceil(remaining / 60000)
  const hours = Math.floor(totalMinutes / 60)
  const days = Math.floor(hours / 24)
  if (days > 0) return `${days}日`
  if (hours > 0) return `${hours}時間`
  return `${totalMinutes}分`
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function waitForAnimation(
  element: HTMLElement,
  animationName: string,
  fallbackMs: number,
): Promise<void> {
  return new Promise((resolve) => {
    let settled = false

    const cleanup = () => {
      element.removeEventListener('animationend', onAnimationEnd)
      window.clearTimeout(fallbackId)
    }

    const finish = () => {
      if (settled) return
      settled = true
      cleanup()
      resolve()
    }

    const onAnimationEnd = (event: AnimationEvent) => {
      if (event.target === element && event.animationName === animationName) {
        finish()
      }
    }

    const fallbackId = window.setTimeout(finish, fallbackMs)
    element.addEventListener('animationend', onAnimationEnd)
  })
}

function setTaskButtonsDisabled(element: HTMLElement, disabled: boolean): void {
  element.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
    button.disabled = disabled
  })
}

function setTaskOverlayState(item: HTMLElement, message: string, accent = false): void {
  const overlayText = item.querySelector<HTMLElement>('.task-overlay-text')
  if (overlayText) overlayText.textContent = message

  item.classList.add('overlay-visible')
  item.classList.toggle('overlay-accent', accent)
}

function resetTaskOverlayState(item: HTMLElement): void {
  const overlayText = item.querySelector<HTMLElement>('.task-overlay-text')
  if (overlayText) overlayText.textContent = ''

  item.classList.remove('overlay-visible', 'overlay-accent', 'shinki-itten')
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
  item.dataset.expireAt = String(task.expireAt)

  const checkBtn = document.createElement('button')
  checkBtn.type = 'button'
  checkBtn.className = 'task-check-btn'
  checkBtn.title = '完了にする'
  checkBtn.textContent = '✓'

  const textEl = document.createElement('div')
  textEl.className = 'task-text'
  textEl.textContent = task.text

  const ttlEl = document.createElement('span')
  ttlEl.className = 'task-ttl'
  ttlEl.textContent = formatTtl(task.expireAt)

  const overlay = document.createElement('div')
  overlay.className = 'task-overlay'

  const overlayText = document.createElement('span')
  overlayText.className = 'task-overlay-text'
  overlay.appendChild(overlayText)

  item.append(checkBtn, textEl, ttlEl, overlay)

  checkBtn.addEventListener('click', () => {
    if (item.classList.contains('task-busy')) return
    void handleCloseTask(task, item)
  })

  textEl.addEventListener('click', () => {
    if (item.classList.contains('task-busy')) return
    startEditingTask(task, textEl)
  })

  return item
}

async function startShinkiAutoDelete(task: Task, item: HTMLElement): Promise<void> {
  const isPendingAutoDelete = item.classList.contains('task-expiring')
  if (item.classList.contains('task-busy') && !isPendingAutoDelete) return

  item.classList.remove('task-expiring')
  setTaskButtonsDisabled(item, true)
  item.classList.add('task-busy', 'shinki-itten')
  setTaskOverlayState(item, '心機一転！', true)

  try {
    await waitForAnimation(item, 'flyAway', 900)
    await expireTask(task.id)
    item.remove()
  } catch (error) {
    console.error('期限切れタスクの自動削除エラー:', error)
    item.classList.remove('task-busy', 'shinki-itten')
    setTaskButtonsDisabled(item, false)
    resetTaskOverlayState(item)
    showToast('期限切れタスクの整理に失敗しました', 'error')
  }
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
  if (element.classList.contains('task-busy')) return

  element.classList.add('task-busy', 'removing')
  setTaskButtonsDisabled(element, true)

  try {
    await waitForAnimation(element, 'taskExit', 450)
    await closeTask(task)
    element.remove()

    showToast('お疲れ様！✨', 'success')

    if (document.getElementById('tab-stats')?.classList.contains('active')) {
      await renderStats()
    }

    updateEmptyState()
  } catch (error) {
    console.error('タスク完了エラー:', error)
    element.classList.remove('task-busy', 'removing')
    setTaskButtonsDisabled(element, false)
    showToast('タスクの完了に失敗しました', 'error')
    await renderTasks()
  }
}

function updateEmptyState(): void {
  const list = document.getElementById('task-list')
  const emptyState = document.getElementById('empty-state')
  if (!list || !emptyState) return

  const tasks = list.querySelectorAll('.task-item')
  emptyState.style.display = tasks.length === 0 ? '' : 'none'
}

let renderTasksGeneration = 0

async function renderTasks(): Promise<void> {
  const list = document.getElementById('task-list')
  const emptyState = document.getElementById('empty-state')
  if (!list || !emptyState) return

  const renderGeneration = ++renderTasksGeneration
  const tasks = await getAllTasks()
  const now = Date.now()
  const activeTasks = tasks.filter((t) => t.expireAt >= now)
  const expiredTasks = tasks.filter((t) => t.expireAt < now)

  // 既存のタスクアイテムをクリア（emptyStateは残す）
  const existingItems = list.querySelectorAll('.task-item')
  existingItems.forEach((el) => el.remove())

  activeTasks.sort((a, b) => b.createdAt - a.createdAt)
  expiredTasks.sort((a, b) => b.createdAt - a.createdAt)

  for (const task of activeTasks) {
    const el = createTaskElement(task)
    list.insertBefore(el, emptyState)
  }

  const expiredEntries: Array<{ task: Task; element: HTMLElement }> = []
  for (const task of expiredTasks) {
    const el = createTaskElement(task)
    el.classList.add('task-busy', 'task-expiring')
    setTaskButtonsDisabled(el, true)
    list.insertBefore(el, emptyState)
    expiredEntries.push({ task, element: el })
  }

  emptyState.style.display = activeTasks.length === 0 && expiredTasks.length === 0 ? '' : 'none'

  if (expiredEntries.length === 0) return

  await sleep(EXPIRED_TASK_INITIAL_DELAY_MS)
  if (renderGeneration !== renderTasksGeneration) return

  for (const [index, entry] of expiredEntries.entries()) {
    if (index > 0) {
      await sleep(EXPIRED_TASK_STAGGER_MS)
      if (renderGeneration !== renderTasksGeneration) return
    }

    if (!entry.element.isConnected) continue
    await startShinkiAutoDelete(entry.task, entry.element)
  }

  if (renderGeneration !== renderTasksGeneration) return

  updateEmptyState()

  if (document.getElementById('tab-stats')?.classList.contains('active')) {
    await renderStats()
  }
}

// ====== タスク追加 ======

async function addTasksFromText(text: string): Promise<void> {
  const trimmed = text.trim()
  if (!trimmed) return

  const statusEl = document.getElementById('voice-status')

  try {
    const settings = await getSettings()
    if (statusEl) {
      statusEl.innerHTML = `<div class="processing-indicator"><div class="spinner"></div> タスクを追加中...</div>`
    }

    const taskTexts = splitByRules(trimmed)

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
let isPreparingRecording = false

function getVoiceErrorMessage(error: VoiceError): string {
  return error === 'not-allowed' || error === 'service-not-allowed'
    ? 'マイクの許可が必要です'
    : error === 'no-speech'
      ? '声をうまく認識できませんでした'
      : error === 'audio-capture'
        ? 'マイク入力を取得できませんでした'
        : error === 'not-supported'
          ? '音声入力はこのブラウザでサポートされていません'
          : `音声入力エラー: ${error}`
}

function openMicPermissionPage(): void {
  window.open('./mic-permission.html', '_blank', 'noopener,noreferrer')
}

function showMicPermissionHelp(): void {
  const statusEl = document.getElementById('voice-status')
  if (!statusEl) return

  const wrapper = document.createElement('div')
  wrapper.className = 'voice-permission-help'

  const copy = document.createElement('div')
  copy.className = 'voice-permission-copy'

  const title = document.createElement('p')
  title.textContent = 'マイクを使うには許可が必要です'

  const detailTop = document.createElement('p')
  detailTop.textContent = '専用ページでブラウザの許可をオンにすると'

  const detailBottom = document.createElement('p')
  detailBottom.textContent = '音声でタスクを追加できます'

  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'voice-permission-btn'
  button.textContent = '許可ページを開く'
  button.addEventListener('click', () => openMicPermissionPage())

  copy.append(title, detailTop, detailBottom)
  wrapper.append(copy, button)
  statusEl.replaceChildren(wrapper)
}

function setupVoiceInput(): void {
  const micBtn = document.getElementById('mic-btn')
  if (!micBtn) return

  if (!voiceRecorder.isSupported()) {
    micBtn.setAttribute('disabled', 'true')
    micBtn.setAttribute('title', '音声入力はこのブラウザでサポートされていません')
    return
  }

  micBtn.addEventListener('click', () => {
    if (isPreparingRecording) return

    if (isRecording) {
      voiceRecorder.stop()
      setRecordingState(false)
    } else {
      void startRecording()
    }
  })
}

async function startRecording(): Promise<void> {
  const statusEl = document.getElementById('voice-status')

  isPreparingRecording = true
  if (statusEl) statusEl.textContent = 'マイクを確認中...'

  try {
    const accessError = await voiceRecorder.ensureMicrophoneAccess()
    if (accessError) {
      if (statusEl) statusEl.textContent = ''
      if (accessError === 'not-allowed' || accessError === 'service-not-allowed') {
        showMicPermissionHelp()
      }
      showToast(getVoiceErrorMessage(accessError), 'error')
      return
    }

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
        if (error === 'not-allowed' || error === 'service-not-allowed') {
          showMicPermissionHelp()
        }
        showToast(getVoiceErrorMessage(error), 'error')
      },
    )
  } finally {
    isPreparingRecording = false
  }
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
  if (ttlInput) ttlInput.value = String(settings.ttlHours)
}

function setupSettings(): void {
  const saveBtn = document.getElementById('save-settings-btn')

  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      const ttlInput = document.getElementById('ttl-input') as HTMLInputElement | null
      const ttlHours = ttlInput ? parseInt(ttlInput.value, 10) : 72

      if (isNaN(ttlHours) || ttlHours < 1) {
        showToast('有効期限は1以上の数値を入力してください', 'error')
        return
      }

      await saveSettings({ ttlHours })
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

function startTtlUpdateTimer(): void {
  setInterval(() => {
    document.querySelectorAll<HTMLElement>('.task-item[data-id]').forEach((item) => {
      const ttlEl = item.querySelector<HTMLElement>('.task-ttl')
      const expireAt = Number(item.dataset.expireAt)
      if (ttlEl && expireAt) {
        ttlEl.textContent = formatTtl(expireAt)
      }
    })
  }, 60000)
}

async function init(): Promise<void> {
  await initDB()

  setupTabs()
  setupTextInput()
  setupVoiceInput()
  setupSettings()

  await renderTasks()
  startTtlUpdateTimer()
}

document.addEventListener('DOMContentLoaded', () => {
  init().catch(console.error)
})
