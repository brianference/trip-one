export const DEMO_TRIP_IDS = {
  yellowstone: '00000000-0000-4000-8000-000000000001',
  tokyo: '00000000-0000-4000-8000-000000000002',
  dublin: '6d92a21e-2d45-4f92-883e-30f919a8b61b',
  beijing: 'c129576f-61d1-4e76-bef2-51b0cdf433f2',
} as const

/** Pre-built trips shown on the homepage as one-tap starting points — all real data. */
export const DEMO_TRIPS = [
  { id: DEMO_TRIP_IDS.tokyo, city: 'Tokyo', blurb: 'Ramen, gardens, neighborhoods · 5 days' },
  { id: DEMO_TRIP_IDS.yellowstone, city: 'Yellowstone', blurb: 'Geysers, wolves, Old Faithful · 3 days' },
  { id: DEMO_TRIP_IDS.dublin, city: 'Dublin', blurb: 'History, pubs, great food · 3 days' },
  { id: DEMO_TRIP_IDS.beijing, city: 'Beijing', blurb: 'History, food, top sights · 4 days' },
] as const
