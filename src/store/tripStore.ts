import { create } from 'zustand'
import type { ItineraryItem } from '../lib/validation/schemas'

export type DesignStyle = 'bento' | 'chronicle' | 'field-guide' | 'liquid-glass' | 'trail-ledger'

interface TripState {
  tripId: string | null
  locationSlug: string | null
  itinerary: ItineraryItem[]
  designStyle: DesignStyle
  /** Total number of days the traveler plans for this trip, or null if not set yet. */
  tripLengthDays: number | null
  /** True when the most recent save to the backend failed, so the UI can surface it and offer a retry. */
  saveError: boolean
  setTrip: (tripId: string, locationSlug: string, itinerary: ItineraryItem[], designStyle: DesignStyle) => void
  addItem: (item: ItineraryItem) => void
  removeItem: (index: number) => void
  reorderItems: (fromIndex: number, toIndex: number) => void
  setDesignStyle: (style: DesignStyle) => void
  setTripLengthDays: (days: number | null) => void
  setItinerary: (itinerary: ItineraryItem[]) => void
  setSaveError: (saveError: boolean) => void
}

export const useTripStore = create<TripState>((set) => ({
  tripId: null,
  locationSlug: null,
  itinerary: [],
  designStyle: 'chronicle',
  tripLengthDays: null,
  saveError: false,
  setTrip: (tripId, locationSlug, itinerary, designStyle) => set({ tripId, locationSlug, itinerary, designStyle }),
  addItem: (item) => set((s) => ({ itinerary: [...s.itinerary, item] })),
  removeItem: (index) => set((s) => ({ itinerary: s.itinerary.filter((_, i) => i !== index) })),
  reorderItems: (fromIndex, toIndex) =>
    set((s) => {
      const next = [...s.itinerary]
      const [moved] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, moved)
      return { itinerary: next }
    }),
  setDesignStyle: (style) => set({ designStyle: style }),
  setTripLengthDays: (days) => set({ tripLengthDays: days }),
  setItinerary: (itinerary) => set({ itinerary }),
  setSaveError: (saveError) => set({ saveError }),
}))
