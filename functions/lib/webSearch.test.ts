import { describe, it, expect } from 'vitest'
import { htmlToText } from './webSearch'

describe('htmlToText', () => {
  it('strips tags, scripts, and styles, collapsing whitespace', () => {
    const html = '<html><head><style>.x{color:red}</style></head><body><script>evil()</script><h1>Mangy Moose</h1><p>Great   apres-ski</p></body></html>'
    const out = htmlToText(html)
    expect(out).toContain('Mangy Moose')
    expect(out).toContain('Great apres-ski')
    expect(out).not.toContain('evil')
    expect(out).not.toContain('color:red')
  })

  it('decodes the entities that matter for venue names', () => {
    expect(htmlToText('<p>Fish &amp; Chips at O&#39;Brien&rsquo;s</p>')).toContain("Fish & Chips at O'Brien's")
  })
})
