import { useState } from 'react'

/**
 * Copies the trip's shareable URL to the clipboard. Trips are just UUID links
 * with no account, so the link IS the trip — this makes that explicit and easy
 * to save or send. Uses the Web Share API on devices that support it, else
 * copies to the clipboard.
 */
export function ShareTrip({ tripId, tripName }: { tripId: string; tripName: string }) {
  const [copied, setCopied] = useState(false)

  async function share() {
    const url = `${window.location.origin}/trip/${tripId}`
    if (navigator.share) {
      try {
        await navigator.share({ title: `${tripName} · Trip One`, url })
        return
      } catch {
        // User cancelled the share sheet, or it failed — fall through to copy.
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard blocked — prompt the URL so it can still be copied manually.
      window.prompt('Copy your trip link:', url)
    }
  }

  return (
    <button type="button" className="chronicle-share-btn" onClick={share} aria-label="Share or copy this trip's link">
      {copied ? '✓ Link copied' : '↗ Share trip'}
    </button>
  )
}
