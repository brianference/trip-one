interface Props {
  lat: number
  lng: number
  label: string
}

export function StaticMap({ lat, lng, label }: Props) {
  return (
    <svg viewBox="0 0 200 120" role="img" aria-label={`Map placeholder for ${label}`}>
      <rect width="200" height="120" fill="#e8f1ff" />
      <circle cx="100" cy="60" r="6" fill="#0a84ff" />
      <text x="100" y="90" textAnchor="middle" fontSize="10">
        {label}
      </text>
      <text x="100" y="104" textAnchor="middle" fontSize="7" fill="#666">
        {lat.toFixed(2)}, {lng.toFixed(2)}
      </text>
    </svg>
  )
}
