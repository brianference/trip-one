import type { ChatMessage } from './chatTypes'

/**
 * Per-trip chat persistence in localStorage, so the conversation survives a
 * page reload and stays consistent as you move between the trip's pages. Keyed
 * by trip id. Fails soft (private mode, quota) — the chat still works in memory.
 */
const KEY_PREFIX = 'trip-one-chat:'
const MAX_STORED = 40

function key(tripId: string): string {
  return `${KEY_PREFIX}${tripId}`
}

/** Load a trip's saved messages, or null if none/unreadable. */
export function loadChat(tripId: string): ChatMessage[] | null {
  try {
    const raw = localStorage.getItem(key(tripId))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    return parsed.filter(
      (m): m is ChatMessage =>
        m && (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string' && typeof m.id === 'string',
    )
  } catch {
    return null
  }
}

/** Save a trip's messages (capped to the most recent, to bound storage). */
export function saveChat(tripId: string, messages: ChatMessage[]): void {
  try {
    localStorage.setItem(key(tripId), JSON.stringify(messages.slice(-MAX_STORED)))
  } catch {
    // Ignore storage failures — the chat still works in memory.
  }
}
