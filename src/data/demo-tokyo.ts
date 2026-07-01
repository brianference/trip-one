import type { ItineraryItem } from '../lib/validation/schemas'

export const DEMO_TOKYO: {
  slug: string
  lat: number
  lng: number
  displayName: string
  itinerary: ItineraryItem[]
} = {
  slug: 'tokyo-demo',
  lat: 35.6812,
  lng: 139.7671,
  displayName: 'Tokyo, Japan',
  itinerary: [
    { time: '08:00', text: 'Breakfast near Shinjuku', type: 'fixed' },
    { time: '10:00', text: 'Shibuya Crossing', type: 'fixed', q: 'Shibuya Crossing, Tokyo' },
    { time: '12:00', text: 'Ramen lunch in Shibuya', type: 'option' },
    { time: '14:00', text: 'Meiji Jingu Shrine', type: 'option', q: 'Meiji Jingu, Tokyo' },
    { time: '16:00', text: 'Samurai Museum', type: 'option', q: 'Samurai Museum Shinjuku' },
    { time: '19:00', text: 'Dinner in Shinjuku', type: 'fixed' },
  ],
}
