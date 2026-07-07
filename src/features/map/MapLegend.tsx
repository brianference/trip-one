import { LEGEND_ENTRIES } from './categoryLegend'

/**
 * A small color legend for the map's category-coded pins, so a traveler can
 * tell what a colored dot means without opening every popup. Reuses the
 * exact same color map `MapView` draws pins with, so the two can't drift.
 */
export function MapLegend({ className }: { className: string }) {
  return (
    <ul className={className} aria-label="Map pin colors">
      {LEGEND_ENTRIES.map((entry) => (
        <li key={entry.label}>
          <span aria-hidden style={{ background: entry.color }} />
          {entry.label}
        </li>
      ))}
    </ul>
  )
}
