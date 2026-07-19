import { useState, type FormEvent } from 'react'
import { Seo } from '../../components/Seo'
import { PageShell } from '../../components/layout/PageShell'
import { Button } from '../../components/ui/Button'
import { Field, FormError } from '../../components/ui/Field'

/**
 * Contact page.
 *
 * There is no mail-sending backend, and pretending otherwise would be worse
 * than useless — a form that silently discards a bug report is a trap. So the
 * form composes a real `mailto:` and hands it to the user's mail client, which
 * genuinely delivers. The address is also shown in full so anyone without a
 * configured mail client can copy it.
 */
const CONTACT_EMAIL = 'hello@trip-one.pages.dev'
const GITHUB_ISSUES = 'https://github.com/brianference/trip-one/issues'

const TOPICS = [
  { value: 'question', label: 'A question about a trip' },
  { value: 'bug', label: 'Something is broken' },
  { value: 'data', label: 'A place is wrong or missing' },
  { value: 'privacy', label: 'My data or account' },
  { value: 'other', label: 'Something else' },
]

export function ContactPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [topic, setTopic] = useState(TOPICS[0].value)
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [opened, setOpened] = useState(false)

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (message.trim().length < 10) {
      setError('Please write a little more so we can actually help.')
      return
    }
    const topicLabel = TOPICS.find((t) => t.value === topic)?.label ?? 'Message'
    const body = `${message.trim()}\n\n—\n${name.trim() || 'Someone'}${email.trim() ? ` (${email.trim()})` : ''}`
    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
      `[Trip One] ${topicLabel}`,
    )}&body=${encodeURIComponent(body)}`
    setOpened(true)
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
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <FormError>{error}</FormError>

            {opened && (
              <div role="status" className="rounded-xl border border-pine-400/40 bg-pine-400/10 px-4 py-3 text-sm">
                Your email app should have opened with the message ready. If nothing happened, email us directly at{' '}
                <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium underline underline-offset-4">
                  {CONTACT_EMAIL}
                </a>
                .
              </div>
            )}

            <Field label="Your name" value={name} onChange={(e) => setName(e.target.value)} hint="Optional." autoComplete="name" />
            <Field
              label="Your email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              hint="Optional, but we can't reply without it."
              autoComplete="email"
            />

            <div>
              <label htmlFor="contact-topic" className="mb-1.5 block text-sm font-medium">
                What's it about?
              </label>
              <select
                id="contact-topic"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
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
                className="w-full rounded-xl border border-[var(--hairline)] bg-[var(--surface)] px-3.5 py-2.5 text-base"
              />
            </div>

            <Button type="submit" size="lg">
              Open email to send
            </Button>
            <p className="text-xs opacity-65">
              This opens your own email app with the message ready — we don't store anything you type here.
            </p>
          </form>

          <aside className="space-y-6 text-sm">
            <div className="rounded-[var(--radius-card)] border border-[var(--hairline)] bg-[var(--surface)] p-5">
              <h2 className="font-[family-name:var(--font-display)] text-base font-semibold">Email us directly</h2>
              <a href={`mailto:${CONTACT_EMAIL}`} className="mt-2 block break-all text-[var(--accent-text)] underline underline-offset-4">
                {CONTACT_EMAIL}
              </a>
            </div>
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
