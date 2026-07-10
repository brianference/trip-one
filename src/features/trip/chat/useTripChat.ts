import { useCallback, useEffect, useState } from 'react'
import { sendChat, searchPlacesNearby, type ThingToDo, type PlanDay, type PlanTurn, type CurrentPlanDay } from '../../../lib/api/client'
import type { ItineraryItem } from '../../../lib/validation/schemas'
import { MIN_TRIP_DAYS } from '../planning/createTripForDestination'
import { requestedDayCount } from '../../../lib/itinerary/requestedDays'
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
  locationLat?: number,
  locationLng?: number,
  onAddPlaces?: (places: ThingToDo[]) => void,
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
  // A detected destination change waits for explicit confirmation before we
  // rebuild the trip and navigate away — relocating silently threw away the
  // plan the traveler was looking at.
  const [pendingRelocate, setPendingRelocate] = useState<{ destination: string; interests: string } | null>(null)

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
      // Typing a new message supersedes any unconfirmed relocate prompt.
      setPendingRelocate(null)

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
        // An explicit "make it N days" in the message changes the trip length —
        // otherwise the model is told the current count and can never expand it
        // (and the plan gets clamped back). This is what makes a chat length
        // change actually update the day tabs and dropdown, not just the text.
        const requested = requestedDayCount(trimmed)
        const planDays = Math.max(requested ?? days, MIN_TRIP_DAYS)

        const result = await sendChat(trimmed, planDays, candidates, {
          locationName,
          conversation: priorTurns,
          itinerary: currentPlan.length > 0 ? currentPlan : undefined,
        })

        if (result.action === 'relocate' && result.destination) {
          // Don't navigate away silently — ask first. Rebuilding around a new
          // destination replaces what the traveler is looking at, so it needs
          // an explicit yes (see confirmRelocate below).
          const ack = result.message?.trim()
          const question = `Start a new trip to ${result.destination}? Your current plan stays saved at this link.`
          setPendingRelocate({ destination: result.destination, interests: trimmed })
          setMessages((prev) => [...prev, makeMessage('assistant', ack ? `${ack}\n\n${question}` : question)])
          return
        }

        if (result.action === 'search' && result.searchQuery && locationLat != null && locationLng != null) {
          // The traveler asked for a KIND of place the fixed pool doesn't cover
          // (a cuisine, a venue type). Acknowledge, then look it up for real via
          // Google Places, add the results to the map + candidate pool, and
          // re-plan so the itinerary actually gets those places.
          const query = result.searchQuery
          setMessages((prev) => [...prev, makeMessage('assistant', result.message?.trim() || `Let me find some ${query} nearby…`)])
          const found = await searchPlacesNearby(query, locationLat, locationLng)
          if (found.length === 0) {
            setMessages((prev) => [
              ...prev,
              makeMessage('assistant', `I couldn’t find ${query} near ${locationName ?? 'here'}. Want to try something else?`),
            ])
            return
          }
          onAddPlaces?.(found)
          // Found places first (so the planner uses them), then the existing
          // pool, deduped by name and capped to the request limit.
          const seen = new Set<string>()
          const augmented: ThingToDo[] = []
          for (const p of [...found.slice(0, 15), ...candidatePlaces]) {
            const key = p.name.toLowerCase()
            if (seen.has(key)) continue
            seen.add(key)
            augmented.push(p)
            if (augmented.length >= MAX_CANDIDATES) break
          }
          const result2 = await sendChat(
            trimmed,
            planDays,
            augmented.map((p) => ({ name: p.name, category: p.category, rating: p.rating, lat: p.lat, lng: p.lng })),
            { locationName, conversation: priorTurns, itinerary: currentPlan.length > 0 ? currentPlan : undefined },
          )
          let searchReply = result2.message || `Here are some ${query} spots I found nearby.`
          if (result2.action === 'plan' && result2.days) {
            onApplyPlan(result2.days, augmented, planDays)
            const newNames = result2.days.flatMap((d) => d.placeIndexes.map((i) => augmented[i]?.name).filter((n): n is string => !!n))
            const existing = new Set(currentItinerary.map((it) => it.text))
            const added = newNames.filter((n) => !existing.has(n))
            if (added.length > 0) searchReply += `\n\nAdded: ${added.join(', ')}.`
          }
          setMessages((prev) => [...prev, makeMessage('assistant', searchReply)])
          return
        }

        let replyText = result.message || 'Done — your itinerary is updated.'
        if (result.action === 'plan' && result.days) {
          onApplyPlan(result.days, candidatePlaces, planDays)
          // List the places that are new versus the current itinerary, so the
          // change is concrete ("Added: X, Y") rather than a vague claim.
          const newNames = result.days.flatMap((d) => d.placeIndexes.map((i) => candidatePlaces[i]?.name).filter((n): n is string => !!n))
          const existing = new Set(currentItinerary.map((it) => it.text))
          const added = newNames.filter((n) => !existing.has(n))
          if (added.length > 0) replyText += `\n\nAdded: ${added.join(', ')}.`
        }
        setMessages((prev) => [...prev, makeMessage('assistant', replyText)])
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
    [messages, isThinking, places, days, locationName, onApplyPlan, onRelocate, locationLat, locationLng, onAddPlaces],
  )

  /** Confirms a pending destination change — rebuilds the trip and navigates. */
  const confirmRelocate = useCallback(async () => {
    if (!pendingRelocate || isThinking) return
    const { destination, interests } = pendingRelocate
    setPendingRelocate(null)
    setIsThinking(true)
    try {
      await onRelocate(destination, interests)
    } catch (err) {
      logger.error('relocate failed', err)
      setMessages((prev) => [...prev, makeMessage('assistant', 'I couldn’t start that trip just now. Mind trying again?')])
    } finally {
      setIsThinking(false)
    }
  }, [pendingRelocate, isThinking, onRelocate])

  /** Dismisses a pending destination change and stays on the current trip. */
  const cancelRelocate = useCallback(() => {
    setPendingRelocate(null)
    setMessages((prev) => [
      ...prev,
      makeMessage('assistant', `Okay — staying with ${locationName ?? 'your current trip'}. What would you like to change?`),
    ])
  }, [locationName])

  return { messages, isThinking, error, send, pendingRelocate, confirmRelocate, cancelRelocate }
}
