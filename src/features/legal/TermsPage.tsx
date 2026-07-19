import { Link } from 'react-router-dom'
import { Seo } from '../../components/Seo'
import { PageShell, Prose } from '../../components/layout/PageShell'

/** Kept in one place so the page and the "last updated" line cannot disagree. */
const LAST_UPDATED = '19 July 2026'

/**
 * Terms and Conditions.
 *
 * Written to be read: short sections, plain sentences, no defined-term
 * apparatus. It states honestly that itineraries are generated and may be
 * wrong, which is the single most important thing a user of this app needs to
 * understand before relying on it for travel.
 */
export function TermsPage() {
  return (
    <>
      <Seo
        title="Terms and Conditions"
        description="The rules for using Trip One: who can use it, what you can and cannot do, and the limits of our responsibility. Written in plain English."
        path="/terms"
      />
      <PageShell
        title="Terms and Conditions"
        lead="The rules for using Trip One, in plain English. Please read them before you use the service."
        crumbs={[{ label: 'Home', to: '/' }, { label: 'Terms and Conditions' }]}
      >
        <p className="mb-8 text-sm opacity-70">Last updated: {LAST_UPDATED}</p>

        <Prose>
          <p>
            Trip One is a free trip-planning service. By using it, you agree to these terms. If you do not agree,
            please do not use the service.
          </p>

          <h2>Who can use Trip One</h2>
          <p>
            You need to be at least 13 years old. If you are under 18, you should have a parent or guardian's
            permission. You may use Trip One for your own personal travel planning, whether or not you create an
            account.
          </p>
          <p>
            If you create an account, keep your password to yourself. You are responsible for what happens under your
            account. Tell us if you think someone else has access to it.
          </p>

          <h2>What you can do</h2>
          <ul>
            <li>Plan as many trips as you like, for yourself, friends, or family.</li>
            <li>Save trips to your account and open them on any device.</li>
            <li>Share a link to a trip with anyone. Anyone with the link can view it.</li>
            <li>Print or export your itinerary and take it with you.</li>
          </ul>

          <h2>What you cannot do</h2>
          <ul>
            <li>Break the law, or use Trip One to plan anything illegal.</li>
            <li>Scrape, bulk-download, or resell the content and place data.</li>
            <li>Try to break, overload, or get around the limits of the service.</li>
            <li>Attempt to access other people's accounts or trips.</li>
            <li>Upload or submit anything abusive, hateful, or designed to harass someone.</li>
            <li>Pretend to be someone else, or claim Trip One endorses you.</li>
          </ul>

          <h2>Itineraries are suggestions, not advice</h2>
          <p>
            This is the most important section on this page.
          </p>
          <p>
            Trip One builds itineraries automatically, using AI and data from third parties such as Google Places and
            Tripadvisor. Every place we suggest is checked against a real place database, but we cannot guarantee that
            opening hours, prices, availability, accessibility, or safety information are accurate or current. Places
            close. Details change. Automated systems make mistakes.
          </p>
          <p>
            Always confirm the important things yourself before you travel — especially anything involving money,
            bookings, border crossings, remote areas, or safety. Trip One is a starting point for planning, not travel,
            legal, medical, or safety advice.
          </p>

          <h2>Your content</h2>
          <p>
            Trips you create belong to you. You give us permission to store and display them so the service can work,
            including showing a trip to anyone you share its link with.
          </p>

          <h2>Removing content</h2>
          <p>
            We can remove content or suspend an account that breaks these terms, is illegal, or risks harming other
            people or the service. Where it is reasonable to do so, we will explain why. You can delete your own trips
            at any time from your account.
          </p>

          <h2>The service can change</h2>
          <p>
            Trip One is free and offered as-is. We may add, change, or remove features, and we may limit or stop the
            service at any time. We do not promise it will always be available or free of errors.
          </p>

          <h2>Limitation of liability</h2>
          <p>
            To the extent the law allows, Trip One is not liable for any loss, cost, or damage arising from your use of
            the service — including trips that do not go to plan, places that are closed or different than described,
            missed bookings, or reliance on an itinerary.
          </p>
          <p>
            Nothing in these terms limits liability where the law does not allow it to be limited.
          </p>

          <h2>Changes to these terms</h2>
          <p>
            We may update these terms as the service changes. The date at the top always shows the current version. If
            we make a significant change, we will make that clear in the app. Continuing to use Trip One after a change
            means you accept the updated terms.
          </p>

          <h2>Contact</h2>
          <p>
            Questions about these terms? <Link to="/contact">Get in touch</Link>. Our{' '}
            <Link to="/privacy">Privacy Policy</Link> explains what we do with your data.
          </p>
        </Prose>
      </PageShell>
    </>
  )
}
