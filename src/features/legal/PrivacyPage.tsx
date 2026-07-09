import { Link } from 'react-router-dom'

/**
 * Privacy policy. Trip One collects no accounts and runs no trackers; this page
 * states plainly what data is and isn't handled, and which third parties see a
 * request. Kept factual and specific to how the app actually works.
 */
export function PrivacyPage() {
  return (
    <div className="chronicle-page">
      <article className="chronicle-chapter chronicle-legal">
        <p className="chronicle-kicker">Trip One</p>
        <h1>Privacy policy</h1>
        <p className="chronicle-legal-updated">Last updated 9 July 2026</p>

        <p>
          Trip One is a public trip planner with no accounts, no advertising, and no analytics or tracking. It is built to
          need as little of your data as possible. This page explains exactly what that means.
        </p>

        <h2>What we don’t do</h2>
        <ul>
          <li>No accounts, logins, or passwords.</li>
          <li>No advertising, cookies for tracking, or third-party analytics.</li>
          <li>No selling or sharing of personal data — there isn’t any to sell.</li>
          <li>No location tracking. You tell us a destination; we don’t read your device location.</li>
        </ul>

        <h2>What we store</h2>
        <ul>
          <li>
            <strong>Trips you create</strong> are saved in our database (Supabase) under a random trip ID that appears in the
            URL. Anyone with the link can view the trip. No name, email, or account is attached.
          </li>
          <li>
            <strong>Cached destination and place data</strong> (things to do, place details) are stored so the app is fast and
            cheap to run. This is public information about places, not about you.
          </li>
          <li>
            <strong>A hashed, salted form of your IP address</strong> is logged briefly, only to rate-limit the AI features and
            prevent abuse. It is a one-way hash, not your raw IP, and it is not used to identify or profile you.
          </li>
          <li>
            <strong>Your theme choice</strong> (light or dark) is kept in your browser’s local storage. It never leaves your
            device.
          </li>
        </ul>

        <h2>Third-party services</h2>
        <p>To build a trip, a request may be sent to these providers. Each sees only what it needs to answer:</p>
        <ul>
          <li>
            <strong>OpenAI</strong> — the text you type into the planner or chat, to turn it into an itinerary. Do not enter
            personal or sensitive information.
          </li>
          <li>
            <strong>Google Places</strong> and <strong>Tripadvisor</strong> — the destination, to fetch real nearby places,
            details, reviews, and photos.
          </li>
          <li>
            <strong>Open-Meteo</strong> — the destination’s coordinates, for weather.
          </li>
          <li>
            <strong>OpenStreetMap / Nominatim / CARTO</strong> — the destination, for geocoding and map tiles.
          </li>
        </ul>
        <p>Each provider handles that data under its own privacy policy.</p>

        <h2>Your choices</h2>
        <p>
          Because there is no account, there is nothing to log into or delete about you. A trip you created can be left to
          expire from the cache; if you want a specific trip removed sooner, contact us and include its link.
        </p>

        <h2>Contact</h2>
        <p>
          Questions about this policy can go to the project maintainer via the{' '}
          <a href="https://github.com/brianference/trip-one" target="_blank" rel="noreferrer">
            GitHub repository
          </a>
          .
        </p>

        <p className="chronicle-legal-back">
          <Link to="/">← Back to Trip One</Link>
        </p>
      </article>
    </div>
  )
}
