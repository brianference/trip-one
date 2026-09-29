import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'

/**
 * Reads the img-src source list from the Content-Security-Policy that
 * Cloudflare Pages serves from public/_headers.
 * @returns The whitespace-separated img-src sources
 */
function imgSrcSources(): string[] {
  const headers = readFileSync(resolve(__dirname, '../../../public/_headers'), 'utf8')
  const csp = headers.split(/\r?\n/).find((line) => line.trim().startsWith('Content-Security-Policy:'))
  if (!csp) throw new Error('no Content-Security-Policy line in public/_headers')
  const directive = csp.split(';').map((part) => part.trim()).find((part) => part.startsWith('img-src'))
  if (!directive) throw new Error('no img-src directive in the CSP')
  return directive.split(/\s+/).slice(1)
}

describe('CSP img-src', () => {
  // DestinationImage requests commons.wikimedia.org/wiki/Special:FilePath,
  // which redirects through commons to thumb.wikimedia.org (observed
  // 2026-09-28: every Explore card was blocked there and fell back to its
  // gradient). A CSP check applies to every hop, so each host must be listed.
  it.each(['https://commons.wikimedia.org', 'https://upload.wikimedia.org', 'https://thumb.wikimedia.org'])(
    'allows %s, a hop in the Wikimedia thumbnail redirect chain',
    (host) => {
      expect(imgSrcSources()).toContain(host)
    },
  )
})
