import { z } from 'zod'

/**
 * Credential validation shared by register and login.
 *
 * Deliberately permissive on email shape: over-strict regexes reject valid
 * real-world addresses (plus-addressing, new TLDs, unicode local parts). Zod's
 * check plus a length bound is the right trade — the real proof an address
 * works is a delivered email, not a regex.
 */

/** Passwords below this are trivially guessable; above 200 is a DoS vector against PBKDF2. */
export const MIN_PASSWORD_LENGTH = 10
export const MAX_PASSWORD_LENGTH = 200

const email = z.string().trim().min(3).max(254).email()

/**
 * A password long enough to be worth hashing.
 *
 * Length is the only hard rule. Composition rules ("one uppercase, one digit,
 * one symbol") measurably push people toward `Password1!` and are no longer
 * recommended by NIST, so a longer minimum is used instead.
 */
const password = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
  .max(MAX_PASSWORD_LENGTH, 'Password is too long')

export const registerSchema = z.object({
  email,
  password,
  displayName: z.string().trim().min(1).max(80).optional(),
})

export const loginSchema = z.object({
  email,
  // Not length-checked: an existing password predating a rule change must
  // still be able to log in, and the answer to a wrong one is the same either
  // way. Only the upper bound is kept, to cap hashing work.
  password: z.string().min(1).max(MAX_PASSWORD_LENGTH),
})

export type RegisterInput = z.infer<typeof registerSchema>
export type LoginInput = z.infer<typeof loginSchema>

/**
 * Turns a Zod error into one short, user-facing message.
 *
 * Field-level detail is safe here (it's the user's own input) and is what makes
 * a form usable — "Password must be at least 10 characters" beats
 * "invalid request".
 */
export function firstIssueMessage(error: z.ZodError): string {
  const issue = error.issues[0]
  if (!issue) return 'Please check the details you entered'
  if (issue.path[0] === 'email') return 'Please enter a valid email address'
  return issue.message
}
