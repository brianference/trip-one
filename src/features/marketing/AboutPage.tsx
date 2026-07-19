import { Seo } from '../../components/Seo'
import { PageShell, Prose } from '../../components/layout/PageShell'
import { ButtonLink } from '../../components/ui/Button'

export function AboutPage() {
  return (
    <>
      <Seo
        title="About us"
        description="Why Trip One exists: itineraries built from real, verified places instead of invented ones, matched to who is actually travelling."
        path="/about"
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'AboutPage',
          name: 'About Trip One',
          description: 'Trip One plans day-by-day itineraries from real, verified places.',
        }}
      />
      <PageShell
        title="About Trip One"
        lead="Most trip planners either hand you a blank page or a list of the same ten attractions. We wanted something that actually reads like a plan."
        crumbs={[{ label: 'Home', to: '/' }, { label: 'About us' }]}
      >
        <Prose>
          <h2>The problem we set out to fix</h2>
          <p>
            Ask a typical AI planner for a trip and it will happily invent a restaurant that closed in 2019, or a
            viewpoint that never existed. Ask a listings site and you'll get whatever is nearest the map pin, sorted by
            rating, which is how a fishing trip in northern Minnesota comes back as a tour of cafés.
          </p>
          <p>
            Both failures have the same root: the tool doesn't know what a real place is, or who is asking.
          </p>

          <h2>How Trip One works</h2>
          <p>
            We search real travel guides for your specific trip, pull out the places those guides actually name, and
            then verify every one against a real place database. Anything that fails to verify is dropped before it ever
            reaches your itinerary.
          </p>
          <p>
            The planner can only choose from that verified list. It cannot invent a place, because it never gets to
            write a place name — only to pick from ones we've already confirmed exist.
          </p>

          <h2>It matters who's travelling</h2>
          <p>
            A ski trip with two kids and a 21st birthday in Dublin are not the same trip, even to the same city. We read
            who's going, what the occasion is, and the season, and filter accordingly. A family trip won't be sent to a
            distillery. A stag weekend won't be sent to the zoo.
          </p>

          <h2>What we don't do</h2>
          <p>
            No adverts. No analytics. No tracking. No selling data. You can plan an entire trip without making an
            account, and if you do make one it's so your trips follow you between devices — nothing more.
          </p>

          <h2>Honest limitations</h2>
          <p>
            Automated planning gets things wrong. Opening hours change, places close, and a plan that looks great on
            screen can miss something obvious about a place we've never been. Always double-check the things that
            matter — bookings, money, remote areas, anything involving safety. Trip One is a strong starting point, not
            a substitute for your own judgement.
          </p>
        </Prose>

        <div className="mt-10 flex flex-wrap gap-3">
          <ButtonLink to="/" size="lg">
            Plan a trip
          </ButtonLink>
          <ButtonLink to="/contact" variant="secondary" size="lg">
            Contact us
          </ButtonLink>
        </div>
      </PageShell>
    </>
  )
}
