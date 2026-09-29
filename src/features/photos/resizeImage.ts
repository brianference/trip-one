/** Longest edge (px) an uploaded photo is resized down to before it leaves the browser. */
export const MAX_EDGE_PX = 1600
/** JPEG re-encode quality (0-1) used for every resized photo. */
export const JPEG_QUALITY = 0.82

/** Thrown when the browser cannot decode a file as an image. */
export class UnsupportedImageError extends Error {
  /**
   * @param cause - The underlying decode failure, if any, kept for logging
   */
  constructor(cause?: unknown) {
    super('This file could not be read as an image.')
    this.name = 'UnsupportedImageError'
    if (cause !== undefined) this.cause = cause
  }
}

/** A photo resized and re-encoded for upload, plus the pixel dimensions it was resized to. */
export interface ResizedImage {
  blob: Blob
  width: number
  height: number
}

/**
 * Draws a canvas to a JPEG blob via the callback-based `toBlob`, wrapped as a
 * promise. A `null` blob (canvas has no data, e.g. zero-size) is reported as
 * an unsupported image rather than resolving to nothing.
 * @param canvas - The canvas holding the resized image
 * @param quality - JPEG encode quality (0-1)
 */
function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new UnsupportedImageError())
      },
      'image/jpeg',
      quality,
    )
  })
}

/**
 * Resizes an image file so its long edge is at most `maxEdge` and re-encodes
 * it as JPEG. Decoding with `imageOrientation: 'from-image'` bakes any EXIF
 * rotation into the pixels before the canvas draws them, and re-encoding
 * through a canvas strips all other metadata (including GPS) along with it,
 * since a canvas carries no metadata forward.
 * @param file - The source image, in any format the browser can decode
 * @param maxEdge - Longest allowed output edge, in pixels
 * @returns The resized JPEG blob and the pixel dimensions it was resized to
 * @throws {UnsupportedImageError} If the browser cannot decode `file`
 */
export async function resizeImage(file: File, maxEdge: number = MAX_EDGE_PX): Promise<ResizedImage> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch (err) {
    throw new UnsupportedImageError(err)
  }

  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new UnsupportedImageError()
    ctx.drawImage(bitmap, 0, 0, width, height)

    const blob = await canvasToJpegBlob(canvas, JPEG_QUALITY)
    return { blob, width, height }
  } finally {
    bitmap.close()
  }
}
