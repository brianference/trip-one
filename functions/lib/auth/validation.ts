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

export const confirmSchema = z.object({
  token: z.string().trim().min(1, 'This confirmation link is missing its token.').max(256),
})

export const resetRequestSchema = z.object({
  email,
})

export const resetSchema = z.object({
  token: z.string().trim().min(16, 'This reset link is missing its token.').max(256),
  password,
})

export const contactSchema = z.object({
  name: z.string().trim().min(1, 'Please enter your name').max(100),
  email,
  subject: z.string().trim().min(1, 'Please add a subject').max(150),
  message: z.string().trim().min(10, 'Please write a little more so we can actually help.').max(5000),
  /**
   * Honeypot. Accepts any value here on purpose: the handler checks it and
   * returns a normal success response, so a bot never learns what gave it away.
   * Rejecting it at validation would leak that signal in the 400.
   */
  website: z.string().max(200).optional(),
})

export type RegisterInput = z.infer<typeof registerSchema>
export type LoginInput = z.infer<typeof loginSchema>
export type ConfirmInput = z.infer<typeof confirmSchema>
export type ResetRequestInput = z.infer<typeof resetRequestSchema>
export type ResetInput = z.infer<typeof resetSchema>
export type ContactInput = z.infer<typeof contactSchema>

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
