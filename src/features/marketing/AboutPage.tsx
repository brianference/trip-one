import { Seo } from '../../components/Seo'
import type { ReactNode } from 'react'
import { PageShell } from '../../components/layout/PageShell'
import { ButtonLink } from '../../components/ui/Button'

/**
 * One About-page topic. On large screens the heading sits in a left column
 * beside its text, so the page fills the same width as the site header while
 * each paragraph keeps a readable line length. Below `lg` it stacks.
 * @param props.title - The section heading
 * @param props.children - The section's paragraphs
 */
function AboutSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-3 border-t border-[var(--hairline)] py-8 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] lg:gap-12 lg:py-10">
      <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">{title}</h2>
      <div className="max-w-[70ch] space-y-5 leading-relaxed">{children}</div>
    </section>
  )
}

/**
 * The About page: what Trip One does, how it avoids invented places, and its limits.
 */
export function AboutPage() {
  return (
    <>
      <Seo
        title="About us"
        description="Why Trip One exists: itineraries built from checked place data and matched to who is actually travelling."
        path="/about"
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'AboutPage',
          name: 'About Trip One',
          description: 'Trip One plans day-by-day itineraries matched to who is travelling.',
        }}
      />
      <PageShell
        title="About Trip One"
        lead="Most trip planners either hand you a blank page or a list of the same ten attractions. We wanted something that actually reads like a plan."
        crumbs={[{ label: 'Home', to: '/' }, { label: 'About us' }]}
        wide
      >
        <div className="border-b border-[var(--hairline)]">
        <AboutSection title="The problem we set out to fix">
            <p>
              Ask a typical AI planner for a trip and it will happily invent a restaurant that closed in 2019, or a
              viewpoint that never existed. Ask a listings site and you'll get whatever is nearest the map pin, sorted by
              rating, which is how a fishing trip in northern Minnesota comes back as a tour of cafés.
            </p>
            <p>
              Both failures have the same root: the tool doesn't check whether a place exists, or ask who wants to go.
            </p>
        </AboutSection>
        <AboutSection title="How Trip One works">
            <p>
              We search real travel guides for your specific trip, pull out the places those guides actually name, and
              then check each one against Google Places before it goes anywhere near your itinerary. Anything that
              doesn't check out is dropped.
            </p>
            <p>
              The planner can only choose from that verified list. It cannot invent a place, because it never gets to
              write a place name — only to pick from ones we've already confirmed exist.
            </p>
        </AboutSection>
        <AboutSection title="It matters who's travelling">
            <p>
              A ski trip with two kids and a 21st birthday in Dublin are not the same trip, even to the same city. We read
              who's going, what the occasion is, and the season, and filter accordingly. A family trip won't be sent to a
              distillery. A stag weekend won't be sent to the zoo.
            </p>
        </AboutSection>
        <AboutSection title="What we don't do">
            <p>
              No adverts. No analytics. No tracking. No selling data. You can plan an entire trip without making an
              account, and if you do make one it's so your trips follow you between devices — nothing more.
            </p>
        </AboutSection>
        <AboutSection title="Bookable experiences">
            <p>
              When a trip includes a bookable experience from Viator, you will see a clear link to book on their site.
              Trip One may earn a commission if you book through that link, at no extra cost to you. The price, duration,
              and availability always come from Viator — we never invent them.
            </p>
        </AboutSection>
        <AboutSection title="Honest limitations">
            <p>
              Automated planning gets things wrong. Opening hours change, places close, and a plan that looks great on
              screen can miss something obvious about a place we've never been. Always double-check the things that
              matter — bookings, money, remote areas, anything involving safety. Trip One is a strong starting point, not
              a substitute for your own judgement.
            </p>
        </AboutSection>
        </div>

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
