import { describe, it, expect, beforeEach } from 'vitest'
import { useTripStore } from './tripStore'

describe('useTripStore', () => {
  beforeEach(() => {
    useTripStore.setState({ tripId: null, locationSlug: null, itinerary: [], designStyle: 'bento' })
  })

  it('setTrip populates all fields', () => {
    useTripStore.getState().setTrip('t1', 'dublin-ireland', [], 'chronicle')
    expect(useTripStore.getState()).toMatchObject({ tripId: 't1', locationSlug: 'dublin-ireland', designStyle: 'chronicle' })
  })

  it('addItem appends to the itinerary', () => {
    useTripStore.getState().addItem({ time: '09:00', text: 'Breakfast', type: 'fixed' })
    expect(useTripStore.getState().itinerary).toHaveLength(1)
  })

  it('removeItem removes by index', () => {
    useTripStore.getState().addItem({ time: '09:00', text: 'A', type: 'fixed' })
    useTripStore.getState().addItem({ time: '10:00', text: 'B', type: 'fixed' })
    useTripStore.getState().removeItem(0)
    expect(useTripStore.getState().itinerary).toEqual([{ time: '10:00', text: 'B', type: 'fixed' }])
  })

  it('reorderItems moves an item from one index to another', () => {
    useTripStore.getState().addItem({ time: '09:00', text: 'A', type: 'fixed' })
    useTripStore.getState().addItem({ time: '10:00', text: 'B', type: 'fixed' })
    useTripStore.getState().reorderItems(0, 1)
    expect(useTripStore.getState().itinerary.map((i) => i.text)).toEqual(['B', 'A'])
  })

  it('setDesignStyle updates the style', () => {
    useTripStore.getState().setDesignStyle('trail-ledger')
    expect(useTripStore.getState().designStyle).toBe('trail-ledger')
  })
})
