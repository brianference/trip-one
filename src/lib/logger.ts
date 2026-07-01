type Level = 'info' | 'warn' | 'error'

function write(level: Level, msg: string, meta: Record<string, unknown> = {}) {
  const line = JSON.stringify({ level, msg, ts: new Date().toISOString(), ...meta })
  const stream = level === 'error' ? process.stderr : process.stdout
  stream.write(line + '\n')
}

export const logger = {
  info: (msg: string, meta?: Record<string, unknown>) => write('info', msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => write('warn', msg, meta),
  error: (msg: string, err?: unknown) =>
    write('error', msg, { error: err instanceof Error ? err.message : String(err) }),
}
