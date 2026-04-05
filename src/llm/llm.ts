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
