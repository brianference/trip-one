import { useState, type FormEvent } from 'react'
import { Seo } from '../../components/Seo'
import { PageShell } from '../../components/layout/PageShell'
import { Button } from '../../components/ui/Button'
import { Field, FormError } from '../../components/ui/Field'

const GITHUB_ISSUES = 'https://github.com/brianference/trip-one/issues'

const TOPICS = [
  { value: 'question', label: 'A question about a trip' },
  { value: 'bug', label: 'Something is broken' },
  { value: 'data', label: 'A place is wrong or missing' },
  { value: 'privacy', label: 'My data or account' },
  { value: 'other', label: 'Something else' },
]

/**
 * Contact page.
 *
 * Posts to `/api/contact`, which stores the message first and then emails the
 * operator. A hidden `website` field is a honeypot: bots that fill it get a
 * normal 200 and nothing is written.
 */
export function ContactPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [topic, setTopic] = useState(TOPICS[0].value)
  const [message, setMessage] = useState('')
  const [website, setWebsite] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (name.trim() === '') {
      setError('Please enter your name.')
      return
    }
    if (email.trim() === '') {
      setError('Please enter your email so we can reply.')
      return
    }
    if (message.trim().length < 10) {
      setError('Please write a little more so we can actually help.')
      return
    }

    const topicLabel = TOPICS.find((t) => t.value === topic)?.label ?? 'Message'
    setSubmitting(true)
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          subject: `[Trip One] ${topicLabel}`,
          message: message.trim(),
          website,
        }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        setError(typeof body.error === 'string' ? body.error : 'Could not send your message. Please try again.')
        return
      }
      setSent(true)
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <Seo
        title="Contact us"
        description="Get in touch with Trip One about a trip, a bug, incorrect place data, or your account and privacy."
        path="/contact"
      />
      <PageShell
        title="Contact us"
        lead="Questions, bugs, or a place we've got wrong — we'd like to hear about it."
        crumbs={[{ label: 'Home', to: '/' }, { label: 'Contact us' }]}
      >
        <div className="grid gap-10 md:grid-cols-[1fr_18rem]">
          <form onSubmit={onSubmit} className="relative space-y-4" noValidate>
            <FormError>{error}</FormError>

            {sent && (
              <div
                role="status"
                aria-live="polite"
                className="rounded-xl border border-pine-400/40 bg-pine-400/10 px-4 py-3 text-sm"
              >
                Thanks — we've received your message and will get back to you by email.
              </div>
            )}

            <Field
              label="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              required
              disabled={sent}
            />
            <Field
              label="Your email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              hint="We'll use this to reply."
              autoComplete="email"
              required
              disabled={sent}
            />

            {/*
              Honeypot. Hidden from people, present for bots. Must not use
              `display: none` alone — many bots skip those. Off-screen keeps
              it in the accessibility tree as aria-hidden so a screen reader
              doesn't announce it.
            */}
            <div className="absolute -left-[10000px] h-px w-px overflow-hidden" aria-hidden="true">
              <label htmlFor="contact-website">Website</label>
              <input
                id="contact-website"
                name="website"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
              />
            </div>

            <div>
              <label htmlFor="contact-topic" className="mb-1.5 block text-sm font-medium">
                What's it about?
              </label>
              <select
                id="contact-topic"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                disabled={sent}
                className="min-h-[44px] w-full rounded-xl border border-[var(--hairline)] bg-[var(--surface)] px-3.5 py-2.5 text-base"
              >
                {TOPICS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="contact-message" className="mb-1.5 block text-sm font-medium">
                Message
              </label>
              <textarea
                id="contact-message"
                required
                rows={6}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Tell us what happened, and which trip or place it was about."
                disabled={sent}
                className="w-full rounded-xl border border-[var(--hairline)] bg-[var(--surface)] px-3.5 py-2.5 text-base"
              />
            </div>

            <Button type="submit" size="lg" loading={submitting} disabled={sent}>
              {submitting ? 'Sending…' : sent ? 'Message sent' : 'Send message'}
            </Button>
          </form>

          <aside className="space-y-6 text-sm">
            <div className="rounded-[var(--radius-card)] border border-[var(--hairline)] bg-[var(--surface)] p-5">
              <h2 className="font-[family-name:var(--font-display)] text-base font-semibold">Found a bug?</h2>
              <p className="mt-2 opacity-75">Bug reports are most useful as issues, where we can track them.</p>
              <a
                href={GITHUB_ISSUES}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block text-[var(--accent-text)] underline underline-offset-4"
              >
                Open an issue on GitHub
              </a>
            </div>
          </aside>
        </div>
      </PageShell>
    </>
  )
}
