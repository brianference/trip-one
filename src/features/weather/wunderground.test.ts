import { describe, it, expect } from 'vitest'
import { hourlyForecastUrl, slugifyPlace } from './wunderground'

describe('hourlyForecastUrl', () => {
  it('builds a US state URL (the yellowstone-one pattern)', () => {
    expect(hourlyForecastUrl('Yellowstone National Park, Wyoming', '2026-06-26')).toBe(
      'https://www.wunderground.com/hourly/us/wy/yellowstone-national-park/date/2026-06-26',
    )
  })

  it('builds an international URL from the country', () => {
    expect(hourlyForecastUrl('Prague, Czechia', '2026-07-10')).toBe('https://www.wunderground.com/hourly/cz/prague/date/2026-07-10')
    expect(hourlyForecastUrl('Tokyo, Japan', '2026-07-10')).toBe('https://www.wunderground.com/hourly/jp/tokyo/date/2026-07-10')
  })

  it('strips accents in the city slug', () => {
    expect(hourlyForecastUrl('Ševětín, Czechia', '2026-07-10')).toBe('https://www.wunderground.com/hourly/cz/sevetin/date/2026-07-10')
  })

  it('falls back to a Google weather search when the region is unknown', () => {
    const url = hourlyForecastUrl('Someville, Freedonia', '2026-07-10')
    expect(url).toContain('google.com/search')
    expect(url).toContain('Someville')
  })
})

describe('slugifyPlace', () => {
  it('lowercases, hyphenates, and strips accents', () => {
    expect(slugifyPlace('Yellowstone National Park')).toBe('yellowstone-national-park')
    expect(slugifyPlace('São Paulo')).toBe('sao-paulo')
  })
})
