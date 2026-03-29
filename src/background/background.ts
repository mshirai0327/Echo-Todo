// Chrome Extension API型定義
declare const chrome: {
  runtime: {
    onInstalled: {
      addListener(callback: () => void): void
    }
  }
  alarms: {
    create(name: string, alarmInfo: { periodInMinutes: number }): void
    onAlarm: {
      addListener(callback: (alarm: { name: string }) => void): void
    }
  }
}

// IndexedDB操作をインポートせずに直接実装（Service Worker環境）
const DB_NAME = 'echo-todo-db'
const DB_VERSION = 1

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains('tasks')) {
        db.createObjectStore('tasks', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' })
      }
      if (!db.objectStoreNames.contains('stats')) {
        db.createObjectStore('stats', { keyPath: 'key' })
      }
    }

    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result)
    }

    request.onerror = (event) => {
      reject((event.target as IDBOpenDBRequest).error)
    }
  })
}

interface Task {
  id: string
  text: string
  createdAt: number
  expireAt: number
}

interface Stats {
  totalCreated: number
  totalExpired: number
  totalClosed: number
  sumCloseDurationMs: number
  avgCloseDurationMs: number
}

const defaultStats: Stats = {
  totalCreated: 0,
  totalExpired: 0,
  totalClosed: 0,
  sumCloseDurationMs: 0,
  avgCloseDurationMs: 0,
}

async function getAllTasks(db: IDBDatabase): Promise<Task[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('tasks', 'readonly')
    const store = tx.objectStore('tasks')
    const request = store.getAll()
    request.onsuccess = () => resolve(request.result as Task[])
    request.onerror = () => reject(request.error)
  })
}

async function deleteTaskById(db: IDBDatabase, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('tasks', 'readwrite')
    const store = tx.objectStore('tasks')
    const request = store.delete(id)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

async function getStats(db: IDBDatabase): Promise<Stats> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('stats', 'readonly')
    const store = tx.objectStore('stats')
    const request = store.get('stats')
    request.onsuccess = () => {
      const record = request.result as { key: string; value: Stats } | undefined
      resolve(record ? record.value : { ...defaultStats })
    }
    request.onerror = () => reject(request.error)
  })
}

async function saveStats(db: IDBDatabase, stats: Stats): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('stats', 'readwrite')
    const store = tx.objectStore('stats')
    const request = store.put({ key: 'stats', value: stats })
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

async function performTTLCheck(): Promise<void> {
  try {
    const db = await openDB()
    const now = Date.now()
    const tasks = await getAllTasks(db)
    const expired = tasks.filter((t) => t.expireAt < now)

    for (const task of expired) {
      await deleteTaskById(db, task.id)
    }

    if (expired.length > 0) {
      const stats = await getStats(db)
      stats.totalExpired += expired.length
      await saveStats(db, stats)
      console.log(`[Echo-Todo] TTLチェック: ${expired.length}件のタスクを削除しました`)
    }
    db.close()
  } catch (e) {
    console.error('[Echo-Todo] TTLチェックエラー:', e)
  }
}

// インストール時にアラームを設定
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('ttl-check', { periodInMinutes: 5 })
  console.log('[Echo-Todo] Service Worker インストール完了')
})

// アラームハンドラ
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'ttl-check') {
    performTTLCheck()
  }
})
