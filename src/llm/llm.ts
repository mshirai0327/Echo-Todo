import type { Settings } from '../storage/db'

declare global {
  interface Window {
    ai?: {
      languageModel: {
        capabilities(): Promise<{ available: 'readily' | 'after-download' | 'no' }>
        create(options?: { systemPrompt?: string }): Promise<{
          prompt(text: string): Promise<string>
          destroy(): void
        }>
      }
    }
  }
}

const SYSTEM_PROMPT = `あなたはTodo管理アシスタントです。
ユーザーの発話からTodoタスクを抽出し、JSON配列で返してください。
タスクは簡潔な日本語にしてください。
出力形式: ["タスク1", "タスク2", ...]
JSON配列のみを返し、他の文章は含めないでください。`

const SPLIT_CONJUNCTIONS = [
  'それと',
  'それから',
  'あとは',
  'あと',
  'そして',
  'ついでに',
  'それに',
  'また',
  'さらに',
  'あわせて',
  'あともう一つ',
  'もう一つ',
]

export function splitByRules(text: string): string[] {
  const trimmed = text.trim()
  if (!trimmed) return []

  const conjPattern = SPLIT_CONJUNCTIONS
    .map((conjunction) => conjunction.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')
  const pattern = new RegExp(`[。\\.\\n]|、?(?=${conjPattern})`, 'g')

  const parts = trimmed
    .split(pattern)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)

  return parts.length > 0 ? parts : [trimmed]
}

function parseTaskArray(response: string): string[] | null {
  const match = response.match(/\[[\s\S]*\]/)
  if (!match) return null

  try {
    const parsed = JSON.parse(match[0])
    if (Array.isArray(parsed) && parsed.every((task) => typeof task === 'string')) {
      return parsed
    }
    return null
  } catch {
    return null
  }
}

async function extractTasksWithNano(speech: string): Promise<string[]> {
  if (!window.ai) throw new Error('Chrome Prompt API not available')

  const { available } = await window.ai.languageModel.capabilities()
  if (available === 'no') throw new Error('Gemini Nano not available')

  const session = await window.ai.languageModel.create({ systemPrompt: SYSTEM_PROMPT })
  try {
    const response = await session.prompt(`発話: "${speech}"`)
    const tasks = parseTaskArray(response)
    if (!tasks) throw new Error('Failed to parse response as task array')
    return tasks
  } finally {
    session.destroy()
  }
}

async function extractTasksWithGeminiAPI(speech: string, apiKey: string): Promise<string[]> {
  const endpoint =
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'

  const response = await fetch(`${endpoint}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: {
        parts: [{ text: SYSTEM_PROMPT }],
      },
      contents: [
        {
          parts: [{ text: `発話: "${speech}"` }],
        },
      ],
    }),
  })

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status}`)
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> }
    }>
  }
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  const tasks = parseTaskArray(text)
  if (!tasks) throw new Error('Failed to parse Gemini API response')
  return tasks
}

export async function extractTasks(speech: string, settings: Settings): Promise<string[]> {
  const trimmed = speech.trim()
  if (!trimmed) return []

  if (settings.llmMode === 'input') {
    return [trimmed]
  }

  if (settings.llmMode === 'nano') {
    try {
      return await extractTasksWithNano(trimmed)
    } catch (error) {
      console.info('Gemini Nano unavailable, trying Gemini API fallback:', error)
    }

    if (settings.apiKey) {
      try {
        return await extractTasksWithGeminiAPI(trimmed, settings.apiKey)
      } catch (error) {
        console.warn('Gemini API fallback failed:', error)
      }
    }
  }

  if (settings.llmMode === 'gemini' && settings.apiKey) {
    try {
      return await extractTasksWithGeminiAPI(trimmed, settings.apiKey)
    } catch (error) {
      console.warn('Gemini API failed:', error)
    }
  }

  return splitByRules(trimmed)
}
