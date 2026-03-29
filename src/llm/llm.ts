import type { Settings } from '../storage/db'

// Chrome Prompt API型定義
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

function parseTaskArray(response: string): string[] | null {
  const match = response.match(/\[[\s\S]*\]/)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[0])
    if (Array.isArray(parsed) && parsed.every((t) => typeof t === 'string')) return parsed
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

async function extractTasksWithOpenAI(speech: string, apiKey: string): Promise<string[]> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `発話: "${speech}"` },
      ],
    }),
  })

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`)
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const text = data.choices?.[0]?.message?.content ?? ''
  const tasks = parseTaskArray(text)
  if (!tasks) throw new Error('Failed to parse OpenAI response')
  return tasks
}

export async function extractTasks(speech: string, settings: Settings): Promise<string[]> {
  const mode = settings.llmMode

  // nano モードの場合はまず Nano を試みる
  if (mode === 'nano') {
    try {
      return await extractTasksWithNano(speech)
    } catch (e) {
      console.warn('Gemini Nano failed, trying fallback:', e)
    }
  }

  // gemini モード or nano フォールバック
  if (mode === 'gemini' || mode === 'nano') {
    if (settings.apiKey) {
      try {
        return await extractTasksWithGeminiAPI(speech, settings.apiKey)
      } catch (e) {
        console.warn('Gemini API failed:', e)
      }
    }
  }

  // openai モード or フォールバック
  if (mode === 'openai') {
    if (settings.apiKey) {
      try {
        return await extractTasksWithOpenAI(speech, settings.apiKey)
      } catch (e) {
        console.warn('OpenAI API failed:', e)
      }
    }
  }

  // 全てのLLMが失敗した場合はテキストをそのまま1件として登録
  return [speech]
}
