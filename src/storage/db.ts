export interface Task {
  id: string
  text: string
  createdAt: number
  expireAt: number
}

export interface Settings {
  ttlHours: number
  llmMode: 'nano' | 'openai' | 'gemini'
  apiProvider?: 'openai' | 'gemini'
  apiKey?: string
}

export interface Stats {
  totalCreated: number
  totalExpired: number
  totalClosed: number
  sumCloseDurationMs: number
  avgCloseDurationMs: number
}

const DB_NAME = 'echo-todo-db'
const DB_VERSION = 1

const defaultSettings: Settings = { ttlHours: 72, llmMode: 'nano' }
const defaultStats: Stats = {
  totalCreated: 0,
  totalExpired: 0,
  totalClosed: 0,
  sumCloseDurationMs: 0,
  avgCloseDurationMs: 0,
}

let dbInstance: IDBDatabase | null = null

export function initDB(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance)

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
      dbInstance = (event.target as IDBOpenDBRequest).result
      resolve(dbInstance)
    }

    request.onerror = (event) => {
      reject((event.target as IDBOpenDBRequest).error)
    }
  })
}

function getDB(): Promise<IDBDatabase> {
  return initDB()
}

export async function getAllTasks(): Promise<Task[]> {
  const db = await getDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('tasks', 'readonly')
    const store = tx.objectStore('tasks')
    const request = store.getAll()
    request.onsuccess = () => resolve(request.result as Task[])
    request.onerror = () => reject(request.error)
  })
}

export async function addTask(task: Task): Promise<void> {
  const db = await getDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('tasks', 'readwrite')
    const store = tx.objectStore('tasks')
    const request = store.put(task)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

export async function updateTask(task: Task): Promise<void> {
  const db = await getDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('tasks', 'readwrite')
    const store = tx.objectStore('tasks')
    const request = store.put(task)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

export async function deleteTask(id: string): Promise<void> {
  const db = await getDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('tasks', 'readwrite')
    const store = tx.objectStore('tasks')
    const request = store.delete(id)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

export async function getExpiredTasks(now: number): Promise<Task[]> {
  const tasks = await getAllTasks()
  return tasks.filter((t) => t.expireAt < now)
}

export async function deleteExpiredTasks(now: number): Promise<number> {
  const expired = await getExpiredTasks(now)
  for (const task of expired) {
    await deleteTask(task.id)
  }
  if (expired.length > 0) {
    const stats = await getStats()
    stats.totalExpired += expired.length
    await saveStats(stats)
  }
  return expired.length
}

export async function getSettings(): Promise<Settings> {
  const db = await getDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('settings', 'readonly')
    const store = tx.objectStore('settings')
    const request = store.get('settings')
    request.onsuccess = () => {
      const record = request.result as { key: string; value: Settings } | undefined
      resolve(record ? record.value : { ...defaultSettings })
    }
    request.onerror = () => reject(request.error)
  })
}

export async function saveSettings(settings: Settings): Promise<void> {
  const db = await getDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('settings', 'readwrite')
    const store = tx.objectStore('settings')
    const request = store.put({ key: 'settings', value: settings })
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

export async function getStats(): Promise<Stats> {
  const db = await getDB()
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

export async function saveStats(stats: Stats): Promise<void> {
  const db = await getDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('stats', 'readwrite')
    const store = tx.objectStore('stats')
    const request = store.put({ key: 'stats', value: stats })
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

export async function closeTask(task: Task): Promise<void> {
  const now = Date.now()
  const duration = now - task.createdAt

  const stats = await getStats()
  stats.totalClosed += 1
  stats.sumCloseDurationMs += duration
  stats.avgCloseDurationMs =
    stats.totalClosed > 0 ? stats.sumCloseDurationMs / stats.totalClosed : 0

  await saveStats(stats)
  await deleteTask(task.id)
}
