/**
 * Detects mojibake — text mangled by a broken UTF-8 decode. Two signatures:
 * an unpaired surrogate (U+D800–U+DFFF not in a valid high/low pair) or the
 * U+FFFD replacement character. Both mean the original bytes are unrecoverable,
 * so such a name can never be shown correctly. This shows up in place names
 * that were imported by an earlier (Python surrogateescape) seed path where a
 * multi-byte character was split across a chunk boundary — e.g. a Chinese place
 * name rendering as "故宫\uDC8D物院".
 *
 * The current TypeScript pipeline only uses spec-compliant `res.json()` /
 * `JSON.stringify`, which produce U+FFFD at worst and never lone surrogates, so
 * new data is clean — this guards against the historically-corrupt cached rows.
 */
export function isTextCorrupt(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (code === 0xfffd) return true
    if (code >= 0xd800 && code <= 0xdbff) {
      // High surrogate: must be immediately followed by a low surrogate.
      const next = text.charCodeAt(i + 1)
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true
      i++ // valid pair — skip its low half
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true // lone low surrogate
    }
  }
  return false
}

/** True if any item's `name` is mojibake — used to treat a cached row as stale. */
export function anyNameCorrupt(items: Array<{ name?: unknown }>): boolean {
  return items.some((item) => typeof item.name === 'string' && isTextCorrupt(item.name))
}

/**
 * Removes items whose `name` is mojibake. A place whose real name can't be
 * recovered is better dropped than shown as garbled text — there are dozens of
 * real, correctly-named places per location to stand in for it.
 */
export function dropCorruptNames<T extends { name?: unknown }>(items: T[]): T[] {
  return items.filter((item) => !(typeof item.name === 'string' && isTextCorrupt(item.name)))
}
