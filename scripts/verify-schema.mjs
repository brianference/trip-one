import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_ANON_KEY

if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_ANON_KEY in the environment first.')
  process.exit(1)
}

const supabase = createClient(url, key)

for (const table of ['locations', 'trips']) {
  const { error } = await supabase.from(table).select('*').limit(1)
  if (error) {
    console.error(`FAIL: ${table} —`, error.message)
    process.exit(1)
  }
  console.log(`OK: ${table} reachable`)
}
