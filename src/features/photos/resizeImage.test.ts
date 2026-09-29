import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { resizeImage, UnsupportedImageError, JPEG_QUALITY } from './resizeImage'

/** Minimal stand-in for the ImageBitmap a real decode would produce. */
function makeBitmap(width: number, height: number) {
  return { width, height, close: vi.fn() }
}

// jsdom has no rendering canvas (no `canvas` npm package installed), so
// getContext/toBlob are stubbed here rather than exercised for real.
describe('resizeImage', () => {
  let toBlobMock: ReturnType<typeof vi.fn>
  let drawImageMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    drawImageMock = vi.fn()
    toBlobMock = vi.fn((callback: BlobCallback, type?: string) => {
      callback(new Blob(['jpeg-bytes'], { type: type ?? 'image/jpeg' }))
    })
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: drawImageMock,
    } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(
      toBlobMock as unknown as HTMLCanvasElement['toBlob'],
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shrinks a 4000x3000 source to 1600x1200', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(makeBitmap(4000, 3000)))
    const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' })

    const result = await resizeImage(file)

    expect(result.width).toBe(1600)
    expect(result.height).toBe(1200)
  })

  it('leaves an 800x600 source unchanged', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(makeBitmap(800, 600)))
    const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' })

    const result = await resizeImage(file)

    expect(result.width).toBe(800)
    expect(result.height).toBe(600)
  })

  it('encodes the output as image/jpeg at the fixed quality', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(makeBitmap(800, 600)))
    const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' })

    const result = await resizeImage(file)

    expect(result.blob.type).toBe('image/jpeg')
    expect(toBlobMock).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', JPEG_QUALITY)
  })

  it('decodes with imageOrientation from-image', async () => {
    const bitmapMock = vi.fn().mockResolvedValue(makeBitmap(800, 600))
    vi.stubGlobal('createImageBitmap', bitmapMock)
    const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' })

    await resizeImage(file)

    expect(bitmapMock).toHaveBeenCalledWith(file, { imageOrientation: 'from-image' })
  })

  it('closes the ImageBitmap after drawing', async () => {
    const bitmap = makeBitmap(800, 600)
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap))
    const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' })

    await resizeImage(file)

    expect(bitmap.close).toHaveBeenCalledOnce()
  })

  it('throws UnsupportedImageError when the browser cannot decode the file', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('bad image')))
    const file = new File(['x'], 'not-an-image.txt', { type: 'text/plain' })

    await expect(resizeImage(file)).rejects.toBeInstanceOf(UnsupportedImageError)
  })
})
