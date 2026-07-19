import { useEffect, useId, useRef, useState } from 'react'

/**
 * Destination search, following the pattern the large travel sites use
 * (Tripadvisor, Booking, Airbnb) rather than inventing one:
 *
 *  - ONE prominent text input. No mode toggles or advanced-search panel; the
 *    overwhelming majority of searches are a place name typed into a box.
 *  - Suggestions appear as you type, debounced, and are keyboard-navigable
 *    with the arrow keys, Enter and Escape.
 *  - Submitting free text always works, even with no suggestion picked, so the
 *    box never traps someone whose destination isn't in the list.
 *
 * Implemented as the ARIA combobox pattern: the input owns
 * `aria-expanded`/`aria-controls`/`aria-activedescendant`, and the list is a
 * `listbox` of `option`s. Highlighting is tracked by index rather than DOM
 * focus, so focus stays in the input and typing is never interrupted.
 */

/** Long enough to stop firing on every keystroke, short enough to feel instant. */
const DEBOUNCE_MS = 220
const MIN_QUERY = 2

export interface Suggestion {
  label: string
  slug?: string
  /** Optional secondary line, e.g. "Ireland". */
  context?: string
  /**
   * The unambiguous full place string, when the label is only the first part.
   * Submitted in preference to `label` — "Dublin" alone is ambiguous, but
   * "Dublin, Leinster, Ireland" geocodes correctly.
   */
  full?: string
}

export function SearchBox({
  onSubmit,
  placeholder = 'Where do you want to go?',
  autoFocus = false,
  initialValue = '',
  fetchSuggestions,
  size = 'lg',
  onQueryChange,
}: {
  onSubmit: (query: string, suggestion?: Suggestion) => void
  placeholder?: string
  autoFocus?: boolean
  initialValue?: string
  /** Returns suggestions for a query; rejections are treated as "no suggestions". */
  fetchSuggestions: (query: string, signal: AbortSignal) => Promise<Suggestion[]>
  size?: 'md' | 'lg'
  /** Fires as the user types, for callers that filter a list live. */
  onQueryChange?: (query: string) => void
}) {
  const [query, setQuery] = useState(initialValue)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(-1)
  const [loading, setLoading] = useState(false)

  const listId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  // Set while choosing a suggestion so the resulting value change doesn't
  // immediately re-open the list with a fresh query.
  const justPicked = useRef(false)

  useEffect(() => {
    if (justPicked.current) {
      justPicked.current = false
      return
    }
    const trimmed = query.trim()
    if (trimmed.length < MIN_QUERY) {
      setSuggestions([])
      setOpen(false)
      return
    }

    const controller = new AbortController()
    setLoading(true)
    const timer = setTimeout(() => {
      fetchSuggestions(trimmed, controller.signal)
        .then((results) => {
          setSuggestions(results)
          setOpen(results.length > 0)
          setHighlighted(-1)
        })
        // An aborted or failed lookup must not break typing; free text still submits.
        .catch(() => setSuggestions([]))
        .finally(() => setLoading(false))
    }, DEBOUNCE_MS)

    return () => {
      clearTimeout(timer)
      controller.abort()
      setLoading(false)
    }
  }, [query, fetchSuggestions])

  // Clicking anywhere else dismisses the list.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  function choose(index: number) {
    const picked = suggestions[index]
    if (!picked) return
    justPicked.current = true
    setQuery(picked.label)
    setOpen(false)
    onSubmit(picked.full ?? picked.label, picked)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!open || suggestions.length === 0) return
      e.preventDefault()
      const delta = e.key === 'ArrowDown' ? 1 : -1
      setHighlighted((current) => {
        const next = current + delta
        // Wrap, so holding an arrow key never dead-ends.
        if (next < 0) return suggestions.length - 1
        if (next >= suggestions.length) return 0
        return next
      })
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (open && highlighted >= 0) choose(highlighted)
      else if (query.trim().length > 0) {
        setOpen(false)
        onSubmit(query.trim())
      }
      return
    }
    if (e.key === 'Escape') {
      setOpen(false)
      setHighlighted(-1)
    }
  }

  const tall = size === 'lg'

  return (
    <div ref={rootRef} className="relative w-full">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault()
          if (query.trim().length > 0) {
            setOpen(false)
            onSubmit(query.trim())
          }
        }}
      >
        <div
          className={`flex items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--hairline)] bg-[var(--surface)] shadow-[var(--shadow-card)] transition-shadow focus-within:shadow-[var(--shadow-lifted)] ${
            tall ? 'py-2 pl-5 pr-2' : 'py-1.5 pl-4 pr-1.5'
          }`}
        >
          <svg viewBox="0 0 24 24" className="size-5 shrink-0 opacity-50" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" strokeLinecap="round" />
          </svg>

          <input
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={highlighted >= 0 ? `${listId}-opt-${highlighted}` : undefined}
            aria-label="Search destinations"
            autoComplete="off"
            autoFocus={autoFocus}
            value={query}
            placeholder={placeholder}
            onChange={(e) => {
              setQuery(e.target.value)
              onQueryChange?.(e.target.value)
            }}
            onKeyDown={onKeyDown}
            onFocus={() => suggestions.length > 0 && setOpen(true)}
            className={`w-full min-w-0 bg-transparent outline-none placeholder:opacity-50 ${tall ? 'py-2 text-base' : 'py-1.5 text-sm'}`}
          />

          {loading && (
            <span className="size-4 shrink-0 animate-spin rounded-full border-2 border-dusk-400 border-t-transparent" aria-hidden="true" />
          )}

          <button
            type="submit"
            disabled={query.trim().length === 0}
            className={`shrink-0 rounded-[var(--radius-pill)] bg-dusk-500 font-medium text-[var(--color-on-accent)] transition-colors hover:bg-dusk-400 disabled:opacity-40 ${
              tall ? 'min-h-[44px] px-5 text-sm' : 'min-h-[36px] px-4 text-sm'
            }`}
          >
            Search
          </button>
        </div>
      </form>

      {open && suggestions.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Destination suggestions"
          className="absolute left-0 right-0 top-full z-40 mt-2 max-h-80 overflow-auto rounded-[var(--radius-card)] border border-[var(--hairline)] bg-[var(--surface)] py-1.5 shadow-[var(--shadow-lifted)]"
        >
          {suggestions.map((s, i) => (
            <li
              key={`${s.label}-${i}`}
              id={`${listId}-opt-${i}`}
              role="option"
              aria-selected={i === highlighted}
              // pointerdown, not click: click fires after blur, which would
              // close the list before the choice registers.
              onPointerDown={(e) => {
                e.preventDefault()
                choose(i)
              }}
              onMouseEnter={() => setHighlighted(i)}
              className={`flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm ${
                i === highlighted ? 'bg-[var(--surface-muted)]' : ''
              }`}
            >
              <svg viewBox="0 0 24 24" className="size-4 shrink-0 opacity-45" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z" />
                <circle cx="12" cy="10" r="2.5" />
              </svg>
              <span className="min-w-0 flex-1 truncate">{s.label}</span>
              {s.context && <span className="shrink-0 text-xs opacity-60">{s.context}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
