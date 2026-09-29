import { describe, it, expect } from 'vitest'
import { sniffImageType } from './imageSniff'

/** Builds a byte array from numbers and ASCII strings, in order. */
function bytesOf(...parts: (number | string)[]): Uint8Array {
  const out: number[] = []
  for (const part of parts) {
    if (typeof part === 'number') out.push(part)
    else for (const ch of part) out.push(ch.charCodeAt(0))
  }
  return new Uint8Array(out)
}

describe('sniffImageType', () => {
  it('recognises a JPEG by FF D8 FF', () => {
    expect(sniffImageType(bytesOf(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 'JFIF'))).toBe('image/jpeg')
  })

  it('recognises a PNG by its eight-byte signature', () => {
    expect(sniffImageType(bytesOf(0x89, 'PNG', 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d))).toBe('image/png')
  })

  it('recognises a WEBP by RIFF....WEBP', () => {
    expect(sniffImageType(bytesOf('RIFF', 0x24, 0x00, 0x00, 0x00, 'WEBP', 'VP8 '))).toBe('image/webp')
  })

  it('rejects an HTML file renamed .jpg', () => {
    expect(sniffImageType(bytesOf('<!doctype html><script>alert(1)</script>'))).toBeNull()
  })

  it('rejects empty input', () => {
    expect(sniffImageType(new Uint8Array(0))).toBeNull()
  })

  it('rejects a truncated PNG signature', () => {
    expect(sniffImageType(bytesOf(0x89, 'PNG'))).toBeNull()
  })

  it('rejects a RIFF container that is not WEBP (e.g. WAV)', () => {
    expect(sniffImageType(bytesOf('RIFF', 0x24, 0x00, 0x00, 0x00, 'WAVE', 'fmt '))).toBeNull()
  })
})
