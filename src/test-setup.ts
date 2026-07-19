import '@testing-library/jest-dom'
import { afterEach, vi } from 'vitest'
import { configure } from '@testing-library/react'
import { __resetTripWriteQueues } from './lib/api/tripWriteQueue'

// Testing Library defaults `waitFor` to 1s, which is comfortable locally and
// too tight on a cold CI runner — TripShell's "loading, then loaded" case
// failed in CI while passing every local run. The assertions are unchanged;
// this only widens how long they may take to become true.
configure({ asyncUtilTimeout: 5000 })

// The trip write queue is a module-level singleton; reset it between tests so
// pending/in-flight state from one case can't leak into the next.
afterEach(() => {
  __resetTripWriteQueues()
  // Several suites stub global fetch and don't unstub it; a leaked stub makes
  // the next suite's failure depend on file order.
  vi.unstubAllGlobals()
})
