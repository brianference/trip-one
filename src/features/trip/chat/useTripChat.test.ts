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

function hook(onApply = vi.fn(), onRelocate = vi.fn().mockResolvedValue(undefined)) {
  return renderHook(() => useTripChat('t', places, 3, 'San Diego, California', onApply, onRelocate))
}

describe('useTripChat', () => {
  afterEach(() => vi.restoreAllMocks())

  it('opens with a greeting when there is no handoff', () => {
    const { result } = renderHook(() => useTripChat('trip-x', places, 3, 'San Diego', vi.fn(), vi.fn()))
    expect(result.current.messages).toHaveLength(1)
    expect(result.current.messages[0].text).toBe(CHAT_GREETING)
  })

  it('opens from the homepage handoff exchange when present', () => {
    stashOpeningChat('trip-handoff', [
      { id: 'u', role: 'user', text: 'a foodie trip', ts: 1 },
      { id: 'a', role: 'assistant', text: 'Here is your foodie trip.', ts: 2 },
    ])
    const { result } = renderHook(() => useTripChat('trip-handoff', places, 3, 'San Diego', vi.fn(), vi.fn()))
    expect(result.current.messages.map((m) => m.text)).toEqual(['a foodie trip', 'Here is your foodie trip.'])
  })

  it('a plan-edit applies the grounded plan and appends the reply', async () => {
    const chatSpy = vi
      .spyOn(client, 'sendChat')
      .mockResolvedValue({ action: 'plan', message: 'Added Balboa Park.', days: [{ day: 1, placeIndexes: [0] }], destination: null })
    const onApply = vi.fn()
    const { result } = hook(onApply)

    await act(async () => {
      await result.current.send('add a park', [])
    })

    expect(result.current.messages.map((m) => m.role)).toEqual(['assistant', 'user', 'assistant'])
    expect(result.current.messages[2].text).toBe('Added Balboa Park.')
    expect(onApply).toHaveBeenCalledWith([{ day: 1, placeIndexes: [0] }], expect.any(Array), 3)
    // grounded: sends real places + the current destination for context
    expect(chatSpy.mock.calls[0][2][0]).toMatchObject({ name: 'Balboa Park' })
    expect(chatSpy.mock.calls[0][3]?.locationName).toBe('San Diego, California')
  })

  it('an answer appends the reply WITHOUT changing the plan', async () => {
    vi.spyOn(client, 'sendChat').mockResolvedValue({ action: 'answer', message: 'Balboa Park is great for kids.', days: null, destination: null })
    const onApply = vi.fn()
    const { result } = hook(onApply)

    await act(async () => {
      await result.current.send('is balboa park good for kids?', [])
    })

    expect(result.current.messages[2].text).toBe('Balboa Park is great for kids.')
    expect(onApply).not.toHaveBeenCalled()
  })

  it('a relocate calls onRelocate with the new destination and the message', async () => {
    vi.spyOn(client, 'sendChat').mockResolvedValue({
      action: 'relocate',
      message: 'Switching to Las Vegas!',
      days: null,
      destination: 'Las Vegas, Nevada',
    })
    const onApply = vi.fn()
    const onRelocate = vi.fn().mockResolvedValue(undefined)
    const { result } = hook(onApply, onRelocate)

    await act(async () => {
      await result.current.send('it should be las vegas', [])
    })

    expect(onRelocate).toHaveBeenCalledWith('Las Vegas, Nevada', 'it should be las vegas')
    expect(onApply).not.toHaveBeenCalled()
    // the acknowledgement is shown before navigating away
    expect(result.current.messages.some((m) => m.text === 'Switching to Las Vegas!')).toBe(true)
  })

  it('enforces the 3-day minimum when planning', async () => {
    const chatSpy = vi
      .spyOn(client, 'sendChat')
      .mockResolvedValue({ action: 'plan', message: 'ok', days: [{ day: 1, placeIndexes: [0] }], destination: null })
    const { result } = renderHook(() => useTripChat('t', places, 1, 'San Diego', vi.fn(), vi.fn()))
    await act(async () => {
      await result.current.send('plan it', [])
    })
    // days arg passed to sendChat is clamped up to 3
    expect(chatSpy.mock.calls[0][1]).toBe(3)
  })

  it('surfaces a friendly assistant message on failure', async () => {
    vi.spyOn(client, 'sendChat').mockRejectedValue(new Error('AI assistant unavailable, try again'))
    const { result } = hook()
    await act(async () => {
      await result.current.send('do something', [])
    })
    await waitFor(() => expect(result.current.isThinking).toBe(false))
    const last = result.current.messages[result.current.messages.length - 1]
    expect(last.text).toMatch(/unavailable/i)
  })

  it('does nothing when there are no places to ground on', async () => {
    const chatSpy = vi.spyOn(client, 'sendChat')
    const { result } = renderHook(() => useTripChat('t', [], 3, 'San Diego', vi.fn(), vi.fn()))
    await act(async () => {
      await result.current.send('plan it', [])
    })
    expect(chatSpy).not.toHaveBeenCalled()
    expect(result.current.error).toMatch(/nothing to plan from/i)
  })
})
