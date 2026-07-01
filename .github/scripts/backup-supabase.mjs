import { createClient } from '@supabase/supabase-js'
import { writeFileSync, readdirSync, unlinkSync } from 'node:fs'

const url = process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(url, serviceKey)

const tables = ['locations', 'trips', 'request_log']
const dump = {}
for (const table of tables) {
  const { data, error } = await supabase.from(table).select('*')
  if (error) throw error
  dump[table] = data
}

const timestamp = process.env.BACKUP_TIMESTAMP
const filename = `backups/${timestamp}.json`
writeFileSync(filename, JSON.stringify(dump, null, 2))
console.log(`Wrote ${filename}`)

const files = readdirSync('backups')
  .filter((f) => f.endsWith('.json'))
  .sort()
const KEEP = 8
if (files.length > KEEP) {
  for (const file of files.slice(0, files.length - KEEP)) {
    unlinkSync(`backups/${file}`)
    console.log(`Pruned backups/${file}`)
  }
}
