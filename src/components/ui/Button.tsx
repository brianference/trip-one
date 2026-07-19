import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

/**
 * The app's button, in the three roles a screen actually needs.
 *
 * `primary` is the one thing to press and uses the single accent colour;
 * `secondary` is a real but lesser action; `ghost` is for dismissals and
 * tertiary controls. Keeping this to three stops the accent appearing on six
 * different controls at once, which is what makes a page feel unfocused.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

const BASE =
  'inline-flex items-center justify-center gap-2 font-medium transition-colors ' +
  'disabled:opacity-50 disabled:pointer-events-none select-none rounded-[var(--radius-pill)]'

const VARIANTS: Record<ButtonVariant, string> = {
  // Dark text on the accent, not white. White on dusk-500 measures 3.18:1 --
  // below WCAG AA for the 14px label this button uses -- while ink-900 on the
  // same orange is 5.89:1. Hover lightens rather than darkens so the pairing
  // keeps its contrast.
  primary: 'bg-dusk-500 text-ink-900 hover:bg-dusk-400 active:bg-dusk-500 shadow-[var(--shadow-card)]',
  secondary:
    'bg-[var(--surface)] text-[var(--page-fg)] border border-[var(--hairline)] hover:bg-[var(--surface-muted)]',
  ghost: 'bg-transparent text-[var(--page-fg)] hover:bg-[var(--surface-muted)]',
  danger: 'bg-danger-500 text-white hover:bg-danger-600',
}

/**
 * Sizes are floored at 44px tall for `md` and `lg` — the minimum comfortable
 * touch target. `sm` is only for controls inside a row that a finger is not
 * expected to hit precisely.
 */
const SIZES: Record<ButtonSize, string> = {
  sm: 'text-sm px-3 py-1.5 min-h-[36px]',
  md: 'text-sm px-4 py-2.5 min-h-[44px]',
  lg: 'text-base px-6 py-3 min-h-[52px]',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Renders a spinner, disables the button, and announces the busy state. */
  loading?: boolean
  /** Full width — the right default for a form's submit button on a phone. */
  block?: boolean
  children?: ReactNode
}

/**
 * Ref-forwarding so callers can focus a button directly — the confirmation
 * dialog focuses Cancel on open so a stray Enter cannot confirm a deletion.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, block = false, className = '', children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      // A loading button must not be pressable twice — that's how duplicate
      // registrations and double submissions happen.
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${block ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  )
})

/** Same look as {@link Button}, but a real link so it can be opened in a new tab. */
export function ButtonLink({
  to,
  variant = 'primary',
  size = 'md',
  block = false,
  className = '',
  children,
}: {
  to: string
  variant?: ButtonVariant
  size?: ButtonSize
  block?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <Link to={to} className={`${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${block ? 'w-full' : ''} ${className}`}>
      {children}
    </Link>
  )
}

/** Decorative only — the button's `aria-busy` is what announces the state. */
export function Spinner({ className = '' }: { className?: string }) {
  return (
    <svg className={`size-4 animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-90" fill="currentColor" d="M12 2a10 10 0 0 1 10 10h-3a7 7 0 0 0-7-7V2Z" />
    </svg>
  )
}
