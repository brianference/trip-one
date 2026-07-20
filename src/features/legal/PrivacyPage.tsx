import { Link } from 'react-router-dom'
import { Seo } from '../../components/Seo'
import { PageShell, Prose } from '../../components/layout/PageShell'

const LAST_UPDATED = '19 July 2026'

/**
 * Privacy policy.
 *
 * Rewritten when accounts shipped. The previous version stated "no accounts,
 * logins, or passwords" and named Supabase as the database — both untrue after
 * the D1 migration and the auth work. A privacy policy describing the wrong
 * product is worse than a plain one, so this stays strictly factual about how
 * the app actually works today.
 */
export function PrivacyPage() {
  return (
    <>
      <Seo
        title="Privacy Policy"
        description="What Trip One collects, what it doesn't, and who else sees anything. No advertising, no analytics, no tracking — explained in plain English."
        path="/privacy"
      />
      <PageShell
        title="Privacy Policy"
        lead="What we collect, what we don't, and who else sees anything. In plain English."
        crumbs={[{ label: 'Home', to: '/' }, { label: 'Privacy Policy' }]}
      >
        <p className="mb-8 text-sm opacity-70">Last updated: {LAST_UPDATED}</p>

        <Prose>
          <p>
            Trip One is built to need as little of your data as possible. There is no advertising, no analytics, and no
            tracking of any kind. You can plan a complete trip without ever creating an account.
          </p>

          <h2>What we never do</h2>
          <ul>
            <li>No advertising and no ad networks.</li>
            <li>No analytics, tracking pixels, or third-party tracking scripts.</li>
            <li>No selling or sharing of your personal data.</li>
            <li>No reading your device location. You type a destination; we don't look.</li>
          </ul>

          <h2>If you don't create an account</h2>
          <p>
            We save the trip you create — the destination and its itinerary — so it can be reopened from its link. It
            isn't connected to you, because we don't know who you are. Anyone with the link can view that trip, so treat
            the link itself as the key to it.
          </p>

          <h2>If you do create an account</h2>
          <p>Then we also store:</p>
          <ul>
            <li>
              <strong>Your email address</strong>, so you can sign in and we can reach you about your account.
            </li>
            <li>
              <strong>Your name</strong> — optional, and only if you choose to give one.
            </li>
            <li>
              <strong>Your password, scrambled</strong>, never the password itself. It goes through a one-way function
              combined with a secret we keep separately from the database, so we cannot read it and neither could
              anyone who obtained a copy of the database alone.
            </li>
            <li>
              <strong>The trips you save</strong>, linked to your account so they appear on any device you sign in from.
            </li>
          </ul>
          <p>
            You can delete any saved trip at any time, and deleting means deleting — we don't keep a shadow copy.
          </p>

          <h2>Cookies</h2>
          <p>
            One cookie, and only once you sign in. It keeps you signed in and does nothing else. It cannot be read by
            JavaScript running in the page, and it is never used to follow you across other sites. Signing out removes
            it. There are no advertising or analytics cookies, so there's nothing to consent to.
          </p>
          <p>
            Your light or dark theme choice is kept in your browser's own storage and never leaves your device.
          </p>

          <h2>Rate limiting</h2>
          <p>
            To prevent abuse we record that a request happened, together with a scrambled, one-way fingerprint of the
            IP address it came from. That fingerprint cannot be turned back into an IP address and isn't used to
            identify or profile anyone.
          </p>

          <h2>Where your data lives</h2>
          <p>
            Trips, accounts, and cached place data are stored in Cloudflare D1, Cloudflare's database, and the app runs
            on Cloudflare Pages.
          </p>

          <h2>Who else sees anything</h2>
          <p>To build a trip, we send your destination and interests to these services:</p>
          <ul>
            <li>
              <strong>OpenAI</strong> — the text you type into the planner or chat, to turn it into an itinerary. Please
              don't type personal or sensitive information into it.
            </li>
            <li>
              <strong>Google Places</strong> and <strong>Tripadvisor</strong> — the destination, to look up places,
              details, and photos.
            </li>
            <li>
              <strong>Brave Search</strong> — the destination and interests, to find travel guides.
            </li>
            <li>
              <strong>Open-Meteo</strong> — coordinates, for weather.
            </li>
            <li>
              <strong>OpenStreetMap / Nominatim / CARTO</strong> — the destination, for geocoding and map tiles.
            </li>
          </ul>
          <p>
            These receive search terms, not your identity. We never send them your email address, your name, or your
            account details. Each handles that data under its own privacy policy.
          </p>

          <h2>How long we keep things</h2>
          <p>
            Trips stay until you delete them. Account details stay until you ask us to close your account. Cached place
            data refreshes periodically. Rate-limiting records are short-lived and only used to count recent requests.
          </p>

          <h2>Your rights</h2>
          <p>
            You can ask for a copy of your data, ask us to correct it, or ask us to delete your account and everything
            in it. <Link to="/contact">Contact us</Link> and we'll sort it out — you don't need to give a reason.
          </p>

          <h2>Children</h2>
          <p>
            Trip One isn't intended for children under 13 and we don't knowingly collect their data. If you believe a
            child has created an account, contact us and we'll remove it.
          </p>

          <h2>Changes to this policy</h2>
          <p>
            If what we collect changes, we'll update this page and the date at the top. If a change is significant we'll
            make it obvious in the app rather than quietly editing this page.
          </p>

          <h2>Contact</h2>
          <p>
            Questions about your privacy? <Link to="/contact">Get in touch</Link>. Our{' '}
            <Link to="/terms">Terms and Conditions</Link> cover the rules for using the service.
          </p>
        </Prose>
      </PageShell>
    </>
  )
}
