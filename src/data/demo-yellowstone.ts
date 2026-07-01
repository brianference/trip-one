import type { ItineraryItem } from '../lib/validation/schemas'

export const DEMO_YELLOWSTONE: {
  slug: string
  lat: number
  lng: number
  displayName: string
  itinerary: ItineraryItem[]
} = {
  slug: 'yellowstone-demo',
  lat: 44.6,
  lng: -110.5,
  displayName: 'Yellowstone National Park, Wyoming',
  itinerary: [
    { time: '08:00', text: 'Breakfast near West Yellowstone', type: 'fixed' },
    { time: '09:30', text: 'Drive to Old Faithful', type: 'travel', q: 'Old Faithful, Yellowstone National Park' },
    { time: '10:30', text: 'Watch Old Faithful erupt', type: 'fixed', q: 'Old Faithful, Yellowstone National Park' },
    { time: '12:00', text: 'Lunch at Old Faithful Inn', type: 'option' },
    { time: '14:00', text: 'Hayden Valley wildlife viewing', type: 'option', q: 'Hayden Valley, Yellowstone' },
    { time: '17:00', text: 'Sunset at Grand Prismatic overlook', type: 'option', q: 'Grand Prismatic Spring' },
  ],
}
