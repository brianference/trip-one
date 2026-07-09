import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useTripChat } from './useTripChat'
import { stashOpeningChat } from './chatHandoff'
import { CHAT_GREETING } from './chatTypes'
import * as client from '../../../lib/api/client'
import type { ThingToDo } from '../../../lib/api/client'

const places: ThingToDo[] = [
  { name: 'Balboa Park', category: 'park', source: 'places', rating: 4.8, lat: 32.73, lng: -117.14 },
  { name: 'Birch Aquarium', category: 'aquarium', source: 'places', rating: 4.7, lat: 32.87, lng: -117.25 },
]

describe('useTripChat', () => {
  afterEach(() => vi.restoreAllMocks())

  it('opens with a greeting when there is no handoff', () => {
    const { result } = renderHook(() => useTripChat('trip-x', places, 3, vi.fn()))
    expect(result.current.messages).toHaveLength(1)
    expect(result.current.messages[0].role).toBe('assistant')
    expect(result.current.messages[0].text).toBe(CHAT_GREETING)
  })

  it('opens from the homepage handoff exchange when present', () => {
    stashOpeningChat('trip-handoff', [
      { id: 'u', role: 'user', text: 'a foodie trip', ts: 1 },
      { id: 'a', role: 'assistant', text: 'Here is your foodie trip.', ts: 2 },
    ])
    const { result } = renderHook(() => useTripChat('trip-handoff', places, 3, vi.fn()))
    expect(result.current.messages.map((m) => m.text)).toEqual(['a foodie trip', 'Here is your foodie trip.'])
  })

  it('sends a message, applies the grounded plan, and appends the reply', async () => {
    const genSpy = vi
      .spyOn(client, 'generatePlan')
      .mockResolvedValue({ days: [{ day: 1, placeIndexes: [0] }], message: 'Added Balboa Park to day 1.' })
    const onApply = vi.fn()
    const { result } = renderHook(() => useTripChat('t', places, 3, onApply))

    await act(async () => {
      await result.current.send('add a park', [])
    })

    // user bubble + assistant reply appended after the greeting
    expect(result.current.messages.map((m) => m.role)).toEqual(['assistant', 'user', 'assistant'])
    expect(result.current.messages[1].text).toBe('add a park')
    expect(result.current.messages[2].text).toBe('Added Balboa Park to day 1.')
    expect(onApply).toHaveBeenCalledWith([{ day: 1, placeIndexes: [0] }], expect.any(Array), 3)
    // grounded: sends only name/category/rating for real places
    expect(genSpy.mock.calls[0][2][0]).toMatchObject({ name: 'Balboa Park' })
  })

  it('passes prior turns and the current itinerary so edits build on context', async () => {
    const genSpy = vi
      .spyOn(client, 'generatePlan')
      .mockResolvedValue({ days: [{ day: 2, placeIndexes: [1] }], message: 'Relaxed day 2.' })
    const { result } = renderHook(() => useTripChat('t', places, 2, vi.fn()))

    await act(async () => {
      await result.current.send('make day 2 relaxed', [
        { time: '', text: 'Balboa Park', type: 'option', day: 1 },
        { time: '', text: 'Birch Aquarium', type: 'option', day: 2 },
      ])
    })

    const opts = genSpy.mock.calls[0][3]
    expect(opts?.conversation?.[0]).toMatchObject({ role: 'assistant', content: CHAT_GREETING })
    expect(opts?.currentPlan).toEqual([
      { day: 1, placeNames: ['Balboa Park'] },
      { day: 2, placeNames: ['Birch Aquarium'] },
    ])
  })

  it('surfaces a friendly assistant message on failure instead of throwing', async () => {
    vi.spyOn(client, 'generatePlan').mockRejectedValue(new Error('AI planner unavailable, try again'))
    const onApply = vi.fn()
    const { result } = renderHook(() => useTripChat('t', places, 3, onApply))

    await act(async () => {
      await result.current.send('do something', [])
    })

    await waitFor(() => expect(result.current.isThinking).toBe(false))
    const last = result.current.messages[result.current.messages.length - 1]
    expect(last.role).toBe('assistant')
    expect(last.text).toMatch(/unavailable/i)
    expect(onApply).not.toHaveBeenCalled()
  })

  it('does nothing when there are no places to ground on', async () => {
    const genSpy = vi.spyOn(client, 'generatePlan')
    const { result } = renderHook(() => useTripChat('t', [], 3, vi.fn()))
    await act(async () => {
      await result.current.send('plan it', [])
    })
    expect(genSpy).not.toHaveBeenCalled()
    expect(result.current.error).toMatch(/nothing to plan from/i)
  })
})
