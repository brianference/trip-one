/** The USD amounts the money page converts, as the owner specified. */
export const PRESET_USD_AMOUNTS = [10, 25, 50, 100, 300, 1000] as const

const USD_FORMAT = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const FALLBACK_DECIMALS = 2

/**
 * Formats an amount in its own currency, letting Intl pick the minor units
 * (JPY and VND get none, EUR gets two).
 * @param amount - Value in `currency`
 * @param currency - ISO 4217 code
 * @returns Display string such as "¥1,504" or "€9.00"
 */
export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)
  } catch {
    return `${amount.toFixed(FALLBACK_DECIMALS)} ${currency}`
  }
}

/**
 * One row per preset USD amount, converted at `rate`.
 * @param rate - Units of `currency` per 1 USD
 * @param currency - ISO 4217 code of the destination
 * @returns Rows of formatted USD and local amounts
 */
export function presetRows(rate: number, currency: string): { usd: string; local: string }[] {
  return PRESET_USD_AMOUNTS.map((usd) => ({ usd: USD_FORMAT.format(usd), local: formatMoney(usd * rate, currency) }))
}
