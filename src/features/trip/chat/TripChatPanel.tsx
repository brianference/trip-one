import { useEffect, useRef, useState } from 'react'
import type { ChatMessage, ChatPlace } from './chatTypes'
import { chatStartersFor } from './chatTypes'
import { ChatMessageBubble } from './ChatMessageBubble'
import { ThinkingIndicator } from './ThinkingIndicator'

/**
 * The persistent left-rail itinerary chat, modeled on Tripadvisor's AI
 * Assistant panel and the Daisy Dog chat: a scrolling message list, a live
 * "thinking" indicator, tappable starters when the conversation is young, and
 * a composer. Purely presentational — all planning state lives in
 * useTripChat; this renders it and forwards the composer text up via onSend.
 */
export function TripChatPanel({
  messages,
  isThinking,
  error,
  disabled,
  onSend,
  locationName,
  onClose,
  pendingRelocate,
  onConfirmRelocate,
  onCancelRelocate,
  onPlaceClick,
  onNewTrip,
}: {
  messages: ChatMessage[]
  isThinking: boolean
  error: string | null
  disabled: boolean
  onSend: (text: string) => void
  /** Destination display name, used to make the starter prompts place-aware. */
  locationName?: string
  /** When provided, shows a collapse button (the panel is a toggleable rail/drawer). */
  onClose?: () => void
  /** A detected destination change awaiting confirmation (null when none). */
  pendingRelocate?: { destination: string } | null
  onConfirmRelocate?: () => void
  onCancelRelocate?: () => void
  /** Tapping an added-place chip reveals it on the Plan page. */
  onPlaceClick?: (place: ChatPlace) => void
  /** Start a fresh trip somewhere new (leaves for the homepage location picker). */
  onNewTrip?: () => void
}) {
  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const starters = chatStartersFor(locationName)

  // Keep the newest message (or the thinking indicator) in view.
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, isThinking])

  function submit(text: string) {
    const trimmed = text.trim()
    if (!trimmed || disabled || isThinking) return
    onSend(trimmed)
    setDraft('')
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    submit(draft)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends; Shift+Enter makes a newline — the common chat convention.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit(draft)
    }
  }

  // Starters only while the conversation is still just the greeting.
  const showStarters = messages.filter((m) => m.role === 'user').length === 0 && !isThinking

  return (
    <section className="flex h-full min-h-0 flex-col bg-[var(--surface)]" aria-label="Trip planner chat">
      <header className="relative shrink-0 border-b border-[var(--hairline)] px-4 py-4">
        {onClose && (
          <button
            type="button"
            className="absolute right-2 top-2 grid size-9 place-items-center rounded-lg text-xl leading-none hover:bg-[var(--surface-muted)]"
            onClick={onClose}
            aria-label="Hide chat"
          >
            ×
          </button>
        )}
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--accent-text)]">✨ Your AI Trip</p>
        <h2 className="mt-1 font-[family-name:var(--font-display)] text-lg font-semibold">Plan by chat</h2>
        <p className="mt-1 text-sm leading-relaxed opacity-75">Refine your trip in plain language — add, remove or reshape any day.</p>
        {onNewTrip && (
          <button
            type="button"
            className="mt-3 inline-flex min-h-[44px] items-center gap-1 rounded-[var(--radius-pill)] border border-[var(--hairline)] px-3 text-sm font-medium text-[var(--accent-text)] hover:bg-[var(--surface-muted)]"
            onClick={onNewTrip}
          >
            <span aria-hidden="true">＋</span> Start a new trip
          </button>
        )}
      </header>

      <div
        className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4"
        ref={listRef}
        role="log"
        aria-live="polite"
        aria-busy={isThinking}
      >
        {messages.map((m) => (
          <ChatMessageBubble key={m.id} message={m} onPlaceClick={onPlaceClick} />
        ))}
        {isThinking && <ThinkingIndicator />}
      </div>

      {showStarters && (
        <div className="flex shrink-0 flex-wrap gap-2 px-4 pb-3" aria-label="Conversation starters">
          {starters.map((starter) => (
            <button
              key={starter}
              type="button"
              className="min-h-[44px] rounded-[var(--radius-pill)] border border-[var(--hairline)] px-3.5 text-sm hover:bg-[var(--surface-muted)] disabled:opacity-50"
              onClick={() => submit(starter)}
              disabled={disabled}
            >
              {starter}
            </button>
          ))}
        </div>
      )}

      {error && (
        <p role="alert" className="shrink-0 px-4 pb-2 text-sm text-danger-500">
          {error}
        </p>
      )}

      {pendingRelocate && onConfirmRelocate && onCancelRelocate && (
        <div className="flex shrink-0 gap-2 px-4 pb-3" role="group" aria-label={`Start a new trip to ${pendingRelocate.destination}?`}>
          <button
            type="button"
            className="min-h-[44px] flex-1 rounded-[var(--radius-pill)] bg-[var(--color-primary)] px-4 text-sm font-medium text-[var(--color-on-primary)] hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
            onClick={onConfirmRelocate}
            disabled={isThinking}
          >
            Yes, start it
          </button>
          <button
            type="button"
            className="min-h-[44px] flex-1 rounded-[var(--radius-pill)] border border-[var(--hairline)] px-4 text-sm font-medium hover:bg-[var(--surface-muted)] disabled:opacity-50"
            onClick={onCancelRelocate}
            disabled={isThinking}
          >
            No, stay here
          </button>
        </div>
      )}

      <form className="flex shrink-0 items-end gap-2 border-t border-[var(--hairline)] p-3" onSubmit={handleSubmit}>
        <label htmlFor="chronicle-chat-input" className="sr-only">
          Message the trip planner
        </label>
        <textarea
          id="chronicle-chat-input"
          className="min-h-[44px] flex-1 resize-none rounded-xl border border-[var(--hairline)] bg-[var(--surface)] px-3 py-2.5 text-base disabled:opacity-60"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? 'No nearby places to plan from yet' : 'Ask to add, remove, or reshape days…'}
          rows={2}
          maxLength={500}
          disabled={disabled || isThinking}
        />
        <button
          type="submit"
          className="min-h-[44px] shrink-0 rounded-[var(--radius-pill)] bg-[var(--color-primary)] px-4 text-sm font-medium text-[var(--color-on-primary)] hover:bg-[var(--color-primary-hover)] disabled:opacity-40"
          disabled={disabled || isThinking || !draft.trim()}
          aria-label="Send"
        >
          {isThinking ? '…' : 'Send'}
        </button>
      </form>
    </section>
  )
}
