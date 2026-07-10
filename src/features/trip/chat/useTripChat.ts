import { useCallback, useEffect, useState } from 'react'
import { sendChat, type ThingToDo, type PlanDay, type PlanTurn, type CurrentPlanDay } from '../../../lib/api/client'
import type { ItineraryItem } from '../../../lib/validation/schemas'
import { MIN_TRIP_DAYS } from '../planning/createTripForDestination'
import { logger } from '../../../lib/logger'
import { CHAT_GREETING, type ChatMessage } from './chatTypes'
import { takeOpeningChat } from './chatHandoff'
import { loadChat, saveChat } from './chatStorage'

// Match AiPlanner: send only the top-rated N so the request stays under the
// backend candidate cap, and the plan's indices map into exactly this subset.
const MAX_CANDIDATES = 40

let messageCounter = 0
/** Stable-ish unique id for a message (id only needs to be unique in-session). */
function nextId(): string {
  messageCounter += 1
  return `m${Date.now()}-${messageCounter}`
}

function makeMessage(role: ChatMessage['role'], text: string): ChatMessage {
  return { id: nextId(), role, text, ts: Date.now() }
}

/** Summarize the current itinerary by day so the planner edits rather than rebuilds. */
function summarizeItinerary(itinerary: ItineraryItem[]): CurrentPlanDay[] {
  const byDay = new Map<number, string[]>()
  for (const item of itinerary) {
    const day = item.day ?? 1
    if (!byDay.has(day)) byDay.set(day, [])
    byDay.get(day)?.push(item.text)
  }
  return [...byDay.entries()].sort(([a], [b]) => a - b).map(([day, placeNames]) => ({ day, placeNames }))
}

/**
 * Conversational planning state for the itinerary chat, modeled after the
 * Daisy Dog chat: a running message list plus an `isThinking` flag that drives
 * the typing indicator. Each user message re-plans the grounded itinerary in
 * light of the whole conversation and the current plan, then the assistant
 * replies in natural language. Nothing is invented — the planner may only pick
 * from the trip's real nearby places.
 *
 * The assistant routes each message: a plan edit re-plans the itinerary, a
 * question is answered from the real trip data (no plan change), and naming a
 * different destination relocates the trip (via `onRelocate`).
 *
 * @param tripId - The trip being planned (also used to consume the homepage handoff)
 * @param places - The trip's real nearby places (the grounding pool)
 * @param days - Current trip length, used as the plan target (clamped to the minimum)
 * @param locationName - The current destination name, so the assistant can detect a switch
 * @param onApplyPlan - Applies a new grounded plan to the itinerary (and persists it)
 * @param onRelocate - Rebuilds the trip around a new destination and navigates to it
 */
export function useTripChat(
  tripId: string,
  places: ThingToDo[],
  days: number,
  locationName: string | undefined,
  onApplyPlan: (plan: PlanDay[], candidatePlaces: ThingToDo[], days: number) => void,
  onRelocate: (destination: string, interests: string) => Promise<void>,
) {
  // Seed from the homepage handoff, else a saved conversation, else a greeting.
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const handed = takeOpeningChat(tripId)
    if (handed && handed.length > 0) return handed
    const saved = loadChat(tripId)
    if (saved && saved.length > 0) return saved
    return [makeMessage('assistant', CHAT_GREETING)]
  })
  const [isThinking, setIsThinking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Persist the conversation per trip so it survives reloads and page switches.
  useEffect(() => {
    saveChat(tripId, messages)
  }, [tripId, messages])

  const send = useCallback(
    async (text: string, currentItinerary: ItineraryItem[]) => {
      const trimmed = text.trim()
      if (!trimmed || isThinking) return
      if (places.length === 0) {
        setError('No nearby places found yet, so there’s nothing to plan from.')
        return
      }
      setError(null)

      // The latest request is sent separately (as `intent`); `conversation`
      // carries only the PRIOR turns for context. So we snapshot messages
      // before appending the user's new bubble — the model still sees the new
      // request via `intent`, just not duplicated in the history.
      const priorTurns: PlanTurn[] = messages.map((m) => ({ role: m.role, content: m.text }))
      setMessages((prev) => [...prev, makeMessage('user', trimmed)])
      setIsThinking(true)

      try {
        const candidatePlaces = [...places]
          .sort((a, b) => (b.rating ?? -Infinity) - (a.rating ?? -Infinity))
          .slice(0, MAX_CANDIDATES)
        const candidates = candidatePlaces.map((p) => ({ name: p.name, category: p.category, rating: p.rating, lat: p.lat, lng: p.lng }))
        const currentPlan = summarizeItinerary(currentItinerary)
        const planDays = Math.max(days, MIN_TRIP_DAYS)

        const result = await sendChat(trimmed, planDays, candidates, {
          locationName,
          conversation: priorTurns,
          itinerary: currentPlan.length > 0 ? currentPlan : undefined,
        })

        if (result.action === 'relocate' && result.destination) {
          // Show the assistant's acknowledgement, then rebuild the trip around
          // the new destination and navigate there.
          if (result.message) setMessages((prev) => [...prev, makeMessage('assistant', result.message)])
          await onRelocate(result.destination, trimmed)
          return
        }

        if (result.action === 'plan' && result.days) {
          onApplyPlan(result.days, candidatePlaces, planDays)
        }
        setMessages((prev) => [...prev, makeMessage('assistant', result.message || 'Done — your itinerary is updated.')])
      } catch (err) {
        logger.error('itinerary chat turn failed', err)
        // Backend messages (rate limit, planner unavailable) are already
        // traveler-friendly — show them as-is. Anything else (network/parse) is
        // technical, so replace it with a plain retry prompt.
        const reason = err instanceof Error ? err.message : ''
        const friendly = /try again|rate limit|unavailable|couldn/i.test(reason)
          ? reason
          : 'Something went wrong on my end. Mind trying that again?'
        setMessages((prev) => [...prev, makeMessage('assistant', friendly)])
      } finally {
        setIsThinking(false)
      }
    },
    [messages, isThinking, places, days, locationName, onApplyPlan, onRelocate],
  )

  return { messages, isThinking, error, send }
}
