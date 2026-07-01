import { createClient } from '@supabase/supabase-js'
import { DEMO_TRIP_IDS } from '../src/lib/api/demoIds.ts'

const url = process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceKey) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.')
  process.exit(1)
}
const supabase = createClient(url, serviceKey)

const demos = [
  {
    id: DEMO_TRIP_IDS.yellowstone,
    module: '../src/data/demo-yellowstone.ts',
    exportName: 'DEMO_YELLOWSTONE',
  },
  {
    id: DEMO_TRIP_IDS.tokyo,
    module: '../src/data/demo-tokyo.ts',
    exportName: 'DEMO_TOKYO',
  },
]

for (const demo of demos) {
  const mod = await import(demo.module)
  const data = mod[demo.exportName]

  const { error: locError } = await supabase.from('locations').upsert({
    slug: data.slug,
    lat: data.lat,
    lng: data.lng,
    display_name: data.displayName,
    things_to_do: [],
  })
  if (locError) throw locError

  const { error: tripError } = await supabase.from('trips').upsert({
    id: demo.id,
    location_slug: data.slug,
    itinerary: data.itinerary,
    design_style: 'bento',
  })
  if (tripError) throw tripError

  console.log(`Seeded ${data.slug} at trip id ${demo.id}`)
}
