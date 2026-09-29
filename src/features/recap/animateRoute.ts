/**
 * Pure math for the recap walkthrough map's traveled-line animation: an
 * easing curve, per-leg point interpolation, and the per-speed leg
 * duration. Deliberately has no DOM, Leaflet, or timer code so it can be
 * unit-tested without mocking `requestAnimationFrame` or Leaflet — `RecapMap`
 * is the only caller and owns all of the animation's side effects.
 */

/** A point the animation can interpolate between (shares its shape with `RecapStop['lat'|'lng']`). */
export interface LatLngPoint {
  lat: number
  lng: number
}

/** Leg duration in milliseconds for the "slow" playback speed. Matches Tokyo One's walkthrough map. */
const SLOW_LEG_MS = 4000

/** Leg duration in milliseconds for the "normal" playback speed. Matches Tokyo One's walkthrough map. */
const NORMAL_LEG_MS = 2500

/** Leg duration in milliseconds for the "fast" playback speed. Matches Tokyo One's walkthrough map. */
const FAST_LEG_MS = 1200

/**
 * How many interpolated sub-points make up one leg's traveled line. A higher
 * count draws a smoother-looking line as the leg grows; `RecapMap`'s
 * animation loop reveals these points one (or more) at a time on each
 * `requestAnimationFrame` tick. Matches Tokyo One's walkthrough map.
 */
export const SUBSEGMENTS_PER_LEG = 60

/** The three selectable walkthrough playback speeds. */
export type WalkthroughSpeed = 'slow' | 'normal' | 'fast'

/**
 * Ease-in-out cubic curve for the traveled-line animation: starts and ends
 * slowly, moves fastest through the middle of a leg. Defined for `t` in
 * `[0, 1]`; callers are responsible for clamping progress into that range
 * before calling this (it does not clamp internally).
 *
 * @param t - progress fraction through a leg, 0 (start) to 1 (end)
 * @returns eased progress fraction, sharing t's 0 and 1 endpoints
 */
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

/**
 * Linearly interpolated points along one leg — a straight line from `a` to
 * `b` — used to draw the traveled polyline's sub-points as a leg's line
 * grows. Always includes both endpoints exactly, so a caller revealing up to
 * a given index can rely on the final point being exactly `b` (no
 * accumulated floating-point drift from repeated easing).
 *
 * @param a - leg start point
 * @param b - leg end point
 * @param steps - number of segments to split the leg into (must be >= 1)
 * @returns `steps + 1` points, starting at `a` and ending at `b`
 */
export function interpolateLeg(a: LatLngPoint, b: LatLngPoint, steps: number): LatLngPoint[] {
  const segmentCount = Math.max(1, Math.floor(steps))
  const points: LatLngPoint[] = []
  for (let i = 0; i <= segmentCount; i += 1) {
    const t = i / segmentCount
    points.push({ lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t })
  }
  return points
}

/**
 * How long one leg's traveled-line animation takes, in milliseconds, for a
 * given playback speed. Matches Tokyo One's walkthrough map timings.
 *
 * @param speed - the selected playback speed
 */
export function legDurationMs(speed: WalkthroughSpeed): number {
  switch (speed) {
    case 'slow':
      return SLOW_LEG_MS
    case 'fast':
      return FAST_LEG_MS
    case 'normal':
      return NORMAL_LEG_MS
  }
}
