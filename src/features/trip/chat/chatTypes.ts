/** A single message in the itinerary planning chat. */
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  /** Epoch ms; used for the timestamp line. */
  ts: number
}

/**
 * Ready-made conversation starters shown when the chat is empty. Made
 * destination-aware when a place is known ("A foodie trip in Lisbon") so they
 * feel relevant and immediately actionable rather than generic.
 * @param place - The trip's display name (e.g. "Lisbon, Portugal"); the city part is used
 */
export function chatStartersFor(place?: string): string[] {
  const city = place?.split(',')[0]?.trim()
  const where = city ? ` in ${city}` : ''
  return [
    `A relaxed trip with the best food and history${where}`,
    `Kid-friendly, easy walking, one museum a day`,
    `A foodie trip — top-rated restaurants and cafés${where}`,
    `More outdoors and scenic views${where}`,
  ]
}

/** How the assistant opens the conversation on a fresh trip. */
export const CHAT_GREETING =
  'Hi! Tell me what you’re after — pace, who’s coming, what you love — and I’ll shape your itinerary from real places here. You can keep refining as we go.'
