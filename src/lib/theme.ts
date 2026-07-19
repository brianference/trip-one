export type ThemeChoice = 'light' | 'dark'

const STORAGE_KEY = 'trip-one-theme'

/** The user's saved theme choice, or null when they've never chosen (follow the OS). */
export function getStoredTheme(): ThemeChoice | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === 'light' || v === 'dark' ? v : null
  } catch {
    return null
  }
}

/** What the OS currently prefers, used as the starting point before any explicit choice. */
export function systemTheme(): ThemeChoice {
  // Light is the app default; only go dark when the OS explicitly prefers it.
  // Guard matchMedia — it's absent in some environments (e.g. jsdom under test).
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/**
 * Apply a theme by setting `data-theme` on the document root (which the CSS
 * keys off) and persisting the choice so it survives reloads and overrides the
 * OS preference.
 */
export function applyTheme(theme: ThemeChoice): void {
  document.documentElement.setAttribute('data-theme', theme)
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // Ignore storage failures (private mode) — the in-page attribute still applies.
  }
}

/** The theme to show on first paint: the saved choice, else the OS preference. */
export function initialTheme(): ThemeChoice {
  // Light is the product default. The OS preference is deliberately NOT
  // consulted: dark is opt-in through the toggle, and a stored choice wins.
  return getStoredTheme() ?? 'light'
}
