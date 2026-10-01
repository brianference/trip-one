// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { sqliteD1 } from './testSqliteD1'
import expectations from '../../scripts/schema-expectations.json'

/**
 * scripts/verify-schema.mjs checks the REMOTE database against
 * scripts/schema-expectations.json. This test checks the same file against the
 * local schema plus every migration, so the expectations cannot drift from
 * what the migrations actually create (a column listed that no migration adds
 * would make the remote check fail for the wrong reason; a column the code
 * needs but the file omits would let a missing migration pass).
 */
describe('scripts/schema-expectations.json', () => {
  it('names only tables the schema and migrations create', () => {
    const db = sqliteD1()
    const present = new Set(db.rows<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'").map((r) => r.name))
    for (const table of expectations.tables) expect(present, table).toContain(table)
  })

  it.each(Object.entries(expectations.columns))('%s has every expected column via pragma_table_info', (table, columns) => {
    const db = sqliteD1()
    const actual = new Set(db.rows<{ name: string }>(`SELECT name FROM pragma_table_info('${table}')`).map((r) => r.name))
    expect(actual.size).toBeGreaterThan(0)
    for (const column of columns) expect(actual, `${table}.${column}`).toContain(column)
  })

  it('covers trip_photos.uploader_user_id, the column 0008 adds', () => {
    expect(expectations.columns.trip_photos).toContain('uploader_user_id')
  })
})
