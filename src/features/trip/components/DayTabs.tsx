/** Day-selector tabs shown above the map for a multi-day trip. */
export function DayTabs({ dayCount, selectedDay, onSelect }: { dayCount: number; selectedDay: number; onSelect: (day: number) => void }) {
  if (dayCount <= 1) return null
  return (
    <div className="chronicle-day-tabs" role="tablist" aria-label="Select day to show its route">
      {Array.from({ length: dayCount }, (_, i) => i + 1).map((day) => (
        <button
          key={day}
          type="button"
          role="tab"
          aria-selected={selectedDay === day}
          className={`chronicle-day-tab${selectedDay === day ? ' chronicle-day-tab--active' : ''}`}
          onClick={() => onSelect(day)}
        >
          Day {day}
        </button>
      ))}
    </div>
  )
}
