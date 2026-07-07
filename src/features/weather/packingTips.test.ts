import { describe, it, expect } from 'vitest'
import { packingTips } from './packingTips'
import type { DailyForecast } from './useDailyForecast'

function day(overrides: Partial<DailyForecast> = {}): DailyForecast {
  return { date: '2026-07-10', hiF: 75, loF: 60, condition: 'Clear', precipPercent: 10, ...overrides }
}

describe('packingTips', () => {
  it('returns nothing for an empty forecast', () => {
    expect(packingTips([])).toEqual([])
  })

  it('suggests rain gear when any day has high precipitation odds', () => {
    const tips = packingTips([day({ precipPercent: 65 })])
    expect(tips).toContain('Pack a rain layer — some days have a high chance of precipitation.')
  })

  it('does not suggest rain gear when precip stays low', () => {
    const tips = packingTips([day({ precipPercent: 10 })])
    expect(tips).not.toContain('Pack a rain layer — some days have a high chance of precipitation.')
  })

  it('suggests warm layers when any night drops below 50F', () => {
    const tips = packingTips([day({ loF: 38 })])
    expect(tips).toContain('Pack warm layers — overnight lows drop below 50°F.')
  })

  it('suggests light clothing when any day tops 85F', () => {
    const tips = packingTips([day({ hiF: 92 })])
    expect(tips).toContain('Pack light, breathable clothing — daytime highs top 85°F.')
  })

  it('suggests sun protection only when every day is warm and dry', () => {
    const tips = packingTips([day({ hiF: 85, precipPercent: 5 }), day({ hiF: 88, precipPercent: 0 })])
    expect(tips).toContain('Pack sun protection — every day is forecast warm and dry.')
  })

  it('does not suggest sun protection when one day is rainy', () => {
    const tips = packingTips([day({ hiF: 85, precipPercent: 5 }), day({ hiF: 88, precipPercent: 60 })])
    expect(tips).not.toContain('Pack sun protection — every day is forecast warm and dry.')
  })

  it('returns no tips when the forecast is unremarkable', () => {
    const tips = packingTips([day({ hiF: 70, loF: 55, precipPercent: 15 })])
    expect(tips).toEqual([])
  })
})
