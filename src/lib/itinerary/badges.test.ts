import { describe, it, expect } from 'vitest'
import { badgeFor, directionsUrl } from './badges'

describe('badgeFor', () => {
  it('labels a dinner-text item as Dinner regardless of type', () => {
    expect(badgeFor({ type: 'option', text: 'Dinner at the lodge' })).toEqual({ label: 'Dinner', tone: 'dinner' })
  })

  it('labels a fixed item as Booked', () => {
    expect(badgeFor({ type: 'fixed', text: 'Check in' })).toEqual({ label: 'Booked', tone: 'booked' })
  })

  it('labels an option item as Optional', () => {
    expect(badgeFor({ type: 'option', text: 'Visit the museum' })).toEqual({ label: 'Optional', tone: 'optional' })
  })

  it('labels a travel item as Transit', () => {
    expect(badgeFor({ type: 'travel', text: 'Drive to the park' })).toEqual({ label: 'Transit', tone: 'transit' })
  })
})

describe('directionsUrl', () => {
  it('builds a real Google Maps directions URL for the destination', () => {
    expect(directionsUrl('Eiffel Tower')).toBe('https://www.google.com/maps/dir/?api=1&destination=Eiffel%20Tower')
  })
})
