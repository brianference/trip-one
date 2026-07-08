/** Real, forecast-derived packing suggestions (see src/features/weather/packingTips.ts). */
export function PackingTips({ tips }: { tips: string[] }) {
  if (tips.length === 0) return null
  return (
    <div className="chronicle-packing-tips">
      <h3>Packing</h3>
      <ul>
        {tips.map((tip) => (
          <li key={tip}>{tip}</li>
        ))}
      </ul>
    </div>
  )
}
