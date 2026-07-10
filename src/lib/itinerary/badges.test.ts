import { describe, it, expect } from 'vitest'
import { badgeFor, directionsUrl, roleFor, slotLabel } from './badges'

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

describe('roleFor', () => {
  it('maps categories to user-meaningful roles', () => {
    expect(roleFor({ type: 'option', text: 'Museum', category: 'museum' }).label).toBe('Attraction')
    expect(roleFor({ type: 'option', text: 'Sushi Ota', category: 'restaurant' }).label).toBe('Meal')
    expect(roleFor({ type: 'option', text: 'Blue Bottle', category: 'cafe' }).label).toBe('Break')
    expect(roleFor({ type: 'travel', text: 'Take the metro', category: undefined }).label).toBe('Transit')
  })

  it('reads meal intent from the text when the category is missing', () => {
    expect(roleFor({ type: 'option', text: 'Dinner in Shinjuku', category: undefined }).label).toBe('Meal')
  })
})

describe('slotLabel', () => {
  it('distributes stops across the day', () => {
    expect(slotLabel(0, 4)).toBe('Morning')
    expect(slotLabel(3, 4)).toBe('Evening')
  })

  it('handles a single-stop day', () => {
    expect(slotLabel(0, 1)).toBe('Morning')
  })
})
