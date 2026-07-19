import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button } from './Button'

/**
 * A blocking confirmation for destructive actions.
 *
 * Rendered through a portal to `document.body` deliberately: a `position:
 * fixed` overlay is trapped by ANY ancestor with a transform, filter or
 * backdrop-filter, and this app's header and cards use backdrop blur. Inside
 * the tree the dialog would be clipped to a card instead of covering the page.
 *
 * Keyboard handling matters most here, because this is the last thing standing
 * between a user and deleting their trip:
 *  - Escape cancels.
 *  - Focus moves to the CANCEL button on open, so a stray Enter does not
 *    confirm the deletion.
 *  - Focus is trapped in the dialog while it is open, and returned to whatever
 *    opened it on close.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  destructive = true,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  body: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    openerRef.current = document.activeElement as HTMLElement | null
    cancelRef.current?.focus()

    // The page behind must not scroll while a modal is up — on iOS especially,
    // scrolling the page under an overlay feels broken.
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
        return
      }
      if (e.key !== 'Tab') return
      const focusables = panelRef.current?.querySelectorAll<HTMLElement>('button, [href], input, [tabindex]:not([tabindex="-1"])')
      if (!focusables || focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
      openerRef.current?.focus()
    }
  }, [open, onCancel])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-[100] grid place-items-center p-4">
      {/* Clicking the backdrop cancels — the same as Escape, never confirms. */}
      <div className="absolute inset-0 bg-ink-900/60 backdrop-blur-sm" onClick={onCancel} aria-hidden="true" />
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-body"
        className="relative w-full max-w-md rounded-[var(--radius-card)] border border-[var(--hairline)] bg-[var(--surface)] p-6 shadow-[var(--shadow-lifted)]"
      >
        <h2 id="confirm-title" className="font-[family-name:var(--font-display)] text-xl font-semibold">
          {title}
        </h2>
        <div id="confirm-body" className="mt-2 text-sm leading-relaxed opacity-80">
          {body}
        </div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button ref={cancelRef} variant="secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant={destructive ? 'danger' : 'primary'} onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
