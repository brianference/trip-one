import type { ChatMessage } from './chatTypes'

/**
 * In-memory handoff of the opening chat exchange from the homepage planner to
 * the itinerary chat. The homepage builds the first trip from one sentence;
 * stashing that sentence + the AI's first reply here (keyed by trip id) lets
 * the itinerary chat open mid-conversation instead of cold, so refining feels
 * continuous. It's a same-session SPA navigation, so a module-level map is
 * enough — nothing needs to persist across reloads.
 */
const pending = new Map<string, ChatMessage[]>()

/** Stash the opening messages for a trip, to be consumed once by the chat. */
export function stashOpeningChat(tripId: string, messages: ChatMessage[]): void {
  pending.set(tripId, messages)
}

/** Take (and clear) any stashed opening messages for a trip. */
export function takeOpeningChat(tripId: string): ChatMessage[] | null {
  const found = pending.get(tripId)
  if (found) pending.delete(tripId)
  return found ?? null
}
