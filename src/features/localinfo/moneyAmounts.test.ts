import { describe, it, expect } from 'vitest'
import { presetRows, formatMoney, PRESET_USD_AMOUNTS } from './moneyAmounts'

describe('presetRows', () => {
  it('returns exactly the six requested amounts in order', () => {
    expect(PRESET_USD_AMOUNTS).toEqual([10, 25, 50, 100, 300, 1000])
    expect(presetRows(0.9, 'EUR').map((r) => r.usd)).toEqual(['$10', '$25', '$50', '$100', '$300', '$1,000'])
  })
  it('uses no decimals for zero-minor-unit currencies', () => {
    expect(presetRows(150.4, 'JPY')[0].local).toBe('¥1,504')
    expect(presetRows(25000, 'VND')[5].local).toMatch(/25,000,000/)
    expect(presetRows(25000, 'VND')[5].local).not.toMatch(/\.00/)
  })
  it('keeps two decimals for euro', () => {
    expect(presetRows(0.9, 'EUR')[0].local).toBe('€9.00')
  })
  it('does not throw on a code Intl does not know', () => {
    const result = formatMoney(12.5, 'XXZ')
    expect(result).toContain('12.50')
    expect(result).toContain('XXZ')
  })
})
