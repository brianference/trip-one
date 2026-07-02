import { describe, it, expect, vi, afterEach } from 'vitest'
import { logger } from './logger'

describe('logger', () => {
  afterEach(() => vi.restoreAllMocks())

  it('info writes a structured line to stdout', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {})
    logger.info('hello', { foo: 'bar' })
    expect(spy).toHaveBeenCalledTimes(1)
    const line = JSON.parse((spy.mock.calls[0][0] as string).trim())
    expect(line).toMatchObject({ level: 'info', msg: 'hello', foo: 'bar' })
  })

  it('error includes the error message', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    logger.error('failed', new Error('boom'))
    const line = JSON.parse((spy.mock.calls[0][0] as string).trim())
    expect(line).toMatchObject({ level: 'error', msg: 'failed', error: 'boom' })
  })
})
