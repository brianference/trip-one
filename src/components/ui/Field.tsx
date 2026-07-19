import { useId, type InputHTMLAttributes, type ReactNode } from 'react'

/**
 * A labelled text input with inline validation messaging.
 *
 * The accessibility wiring is the reason this is a component rather than raw
 * markup at each call site: the label is bound by id, the error is linked with
 * `aria-describedby` and marked `role="alert"` so a screen reader announces it
 * when it appears, and `aria-invalid` marks the field itself. Hand-rolled forms
 * almost always drop one of those.
 */
export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  /** Validation message. Presence of this also puts the field in its error state. */
  error?: string | null
  /** Static helper text shown when there's no error. */
  hint?: ReactNode
}

export function Field({ label, error, hint, className = '', id, ...rest }: FieldProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const errorId = `${inputId}-error`
  const hintId = `${inputId}-hint`

  return (
    <div className="w-full">
      <label htmlFor={inputId} className="block text-sm font-medium mb-1.5">
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : hint ? hintId : undefined}
        className={`w-full rounded-xl border bg-[var(--surface)] px-3.5 py-2.5 text-base min-h-[44px]
          placeholder:text-ink-500/60 transition-colors
          ${error ? 'border-danger-500' : 'border-[var(--hairline)] focus:border-dusk-400'}
          ${className}`}
        {...rest}
      />
      {error ? (
        <p id={errorId} role="alert" className="mt-1.5 text-sm text-danger-500">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="mt-1.5 text-sm opacity-70">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

/**
 * A form-level error, for failures that belong to the whole submission rather
 * than one field ("Email or password is incorrect", "Something went wrong").
 */
export function FormError({ children }: { children: ReactNode }) {
  if (!children) return null
  return (
    <div
      role="alert"
      className="rounded-xl border border-danger-500/30 bg-danger-50 px-3.5 py-3 text-sm text-danger-600 dark:bg-danger-500/10"
    >
      {children}
    </div>
  )
}
