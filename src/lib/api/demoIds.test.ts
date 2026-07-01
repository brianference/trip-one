import { describe, it, expect } from 'vitest'
import { DEMO_TRIP_IDS } from './demoIds'

describe('DEMO_TRIP_IDS', () => {
  it('has a fixed UUID for each demo', () => {
    expect(DEMO_TRIP_IDS.yellowstone).toMatch(/^[0-9a-f-]{36}$/)
    expect(DEMO_TRIP_IDS.tokyo).toMatch(/^[0-9a-f-]{36}$/)
    expect(DEMO_TRIP_IDS.yellowstone).not.toBe(DEMO_TRIP_IDS.tokyo)
  })
})
