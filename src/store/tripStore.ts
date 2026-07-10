import { create } from 'zustand'
import type { ItineraryItem } from '../lib/validation/schemas'

export type DesignStyle = 'bento' | 'chronicle' | 'field-guide' | 'liquid-glass' | 'trail-ledger'

/**
 * A place the user asked to focus — from a chat "Added …" link or a stop click.
 * The Plan page reacts by selecting its day, opening its detail, and panning the
 * map to it. Carries a `nonce` so clicking the SAME place twice still re-triggers.
 */
export interface FocusPlace {
  name: string
  lat?: number
  lng?: number
  category?: string
  day?: number
  placeId?: string
  nonce: number
}

interface TripState {
  tripId: string | null
  locationSlug: string | null
  itinerary: ItineraryItem[]
  designStyle: DesignStyle
  /** Total number of days the traveler plans for this trip, or null if not set yet. */
  tripLengthDays: number | null
  /** Trip start date (YYYY-MM-DD), or null if not set. */
  startDate: string | null
  /** True when the most recent save to the backend failed, so the UI can surface it and offer a retry. */
  saveError: boolean
  /** A place to reveal on the Plan page (open detail, select day, pan map), or null. */
  focusPlace: FocusPlace | null
  setTrip: (tripId: string, locationSlug: string, itinerary: ItineraryItem[], designStyle: DesignStyle) => void
  addItem: (item: ItineraryItem) => void
  removeItem: (index: number) => void
  reorderItems: (fromIndex: number, toIndex: number) => void
  setDesignStyle: (style: DesignStyle) => void
  setTripLengthDays: (days: number | null) => void
  setStartDate: (startDate: string | null) => void
  setItinerary: (itinerary: ItineraryItem[]) => void
  setSaveError: (saveError: boolean) => void
  /** Focus a place (a fresh nonce is stamped so repeat clicks re-trigger). */
  focusOnPlace: (place: Omit<FocusPlace, 'nonce'>) => void
  clearFocusPlace: () => void
}

export const useTripStore = create<TripState>((set) => ({
  tripId: null,
  locationSlug: null,
  itinerary: [],
  designStyle: 'chronicle',
  tripLengthDays: null,
  startDate: null,
  saveError: false,
  focusPlace: null,
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
  setStartDate: (startDate) => set({ startDate }),
  setItinerary: (itinerary) => set({ itinerary }),
  setSaveError: (saveError) => set({ saveError }),
  focusOnPlace: (place) => set({ focusPlace: { ...place, nonce: Date.now() } }),
  clearFocusPlace: () => set({ focusPlace: null }),
}))
