/** A single message in the itinerary planning chat. */
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  /** Epoch ms; used for the timestamp line. */
  ts: number
}

/** Ready-made conversation starters shown when the chat is empty. */
export const CHAT_STARTERS = [
  'A relaxed trip with the best food and history',
  'Kid-friendly, easy walking, one museum a day',
  'A foodie trip — top-rated restaurants and cafés',
  'More outdoors and scenic views',
] as const

/** How the assistant opens the conversation on a fresh trip. */
export const CHAT_GREETING =
  'Hi! Tell me what you’re after — pace, who’s coming, what you love — and I’ll shape your itinerary from real places here. You can keep refining as we go.'
