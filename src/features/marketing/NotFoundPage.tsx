import { Seo } from '../../components/Seo'
import { PageShell } from '../../components/layout/PageShell'
import { ButtonLink } from '../../components/ui/Button'

/**
 * 404. Marked noindex so a mistyped URL can never be indexed as a real page,
 * and offers the two routes back that people actually want.
 */
export function NotFoundPage() {
  return (
    <>
      <Seo title="Page not found" description="That page doesn't exist." noindex />
      <PageShell
        title="We can't find that page"
        lead="The link may be old, or the trip may have been deleted."
        crumbs={[{ label: 'Home', to: '/' }, { label: 'Not found' }]}
      >
        <div className="flex flex-wrap gap-3">
          <ButtonLink to="/" size="lg">
            Plan a trip
          </ButtonLink>
          <ButtonLink to="/explore" variant="secondary" size="lg">
            Explore destinations
          </ButtonLink>
        </div>
      </PageShell>
    </>
  )
}
