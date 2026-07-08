import { describe, it, expect, vi, afterEach } from 'vitest'
import { queueTripWrite, __resetTripWriteQueues } from './tripWriteQueue'
import * as client from './client'
import type { ItineraryItem } from '../validation/schemas'

function item(text: string): ItineraryItem {
  return { time: '', text, type: 'option' }
}

/** A manually-resolvable updateTrip mock, so we can control response ordering. */
function deferredUpdateTrip() {
  const resolvers: Array<() => void> = []
  const calls: Array<{ itinerary?: ItineraryItem[] }> = []
  const spy = vi.spyOn(client, 'updateTrip').mockImplementation((_id, patch) => {
    calls.push(patch as { itinerary?: ItineraryItem[] })
    return new Promise((resolve) => {
      resolvers.push(() => resolve({ id: 't1', locationSlug: 's', itinerary: [], designStyle: 'chronicle' }))
    })
  })
  return { spy, resolvers, calls }
}

describe('tripWriteQueue', () => {
  afterEach(() => {
    __resetTripWriteQueues()
    vi.restoreAllMocks()
  })

  it('sends the first write immediately', () => {
    const { spy } = deferredUpdateTrip()
    queueTripWrite('t1', { itinerary: [item('A')] })
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('never runs two writes concurrently — a second edit waits for the first', () => {
    const { spy, resolvers } = deferredUpdateTrip()
    queueTripWrite('t1', { itinerary: [item('A')] })
    queueTripWrite('t1', { itinerary: [item('B')] })
    queueTripWrite('t1', { itinerary: [item('C')] })
    // only the first is in flight; the rest are coalesced into one pending write
    expect(spy).toHaveBeenCalledTimes(1)
    expect(resolvers).toHaveLength(1)
  })

  it('coalesces rapid edits so the final persisted state is the newest, not a stale one', async () => {
    const { calls, resolvers } = deferredUpdateTrip()
    queueTripWrite('t1', { itinerary: [item('A')] }) // in flight
    queueTripWrite('t1', { itinerary: [item('B')] }) // pending
    queueTripWrite('t1', { itinerary: [item('C')] }) // coalesces over B in pending

    resolvers[0]() // first write resolves
    await Promise.resolve()
    await Promise.resolve()

    // second flush sent exactly the LATEST state (C), skipping the stale B
    expect(calls.map((c) => c.itinerary?.[0].text)).toEqual(['A', 'C'])
  })

  it('coalesces different keys (itinerary + tripLengthDays) into one pending write', async () => {
    const { calls, resolvers } = deferredUpdateTrip()
    queueTripWrite('t1', { itinerary: [item('A')] }) // in flight
    queueTripWrite('t1', { tripLengthDays: 3 }) // pending
    queueTripWrite('t1', { itinerary: [item('B')] }) // pending, merges with above

    resolvers[0]()
    await Promise.resolve()
    await Promise.resolve()

    const second = calls[1] as { itinerary?: ItineraryItem[]; tripLengthDays?: number }
    expect(second.itinerary?.[0].text).toBe('B')
    expect(second.tripLengthDays).toBe(3)
  })

  it('reports failures via onError instead of swallowing them', async () => {
    vi.spyOn(client, 'updateTrip').mockRejectedValue(new Error('network down'))
    const onError = vi.fn()
    queueTripWrite('t1', { itinerary: [item('A')] }, onError)
    await Promise.resolve()
    await Promise.resolve()
    expect(onError).toHaveBeenCalled()
  })
})
