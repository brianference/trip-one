import '@testing-library/jest-dom'
import { afterEach } from 'vitest'
import { __resetTripWriteQueues } from './lib/api/tripWriteQueue'

// The trip write queue is a module-level singleton; reset it between tests so
// pending/in-flight state from one case can't leak into the next.
afterEach(() => {
  __resetTripWriteQueues()
})
