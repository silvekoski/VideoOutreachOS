type Level = 'debug' | 'info' | 'warn' | 'error'

const processName = process.argv[1]?.endsWith('worker.ts') ? 'worker' : 'api'

function write(level: Level, msg: string, fields: Record<string, unknown> = {}): void {
  const line: Record<string, unknown> = { time: new Date().toISOString(), level, process: processName, msg }
  for (const [key, value] of Object.entries(fields)) {
    line[key] = value instanceof Error ? { name: value.name, message: value.message, stack: value.stack } : value
  }
  process.stdout.write(`${JSON.stringify(line)}\n`)
}

export const log = {
  debug: (msg: string, fields?: Record<string, unknown>) => write('debug', msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) => write('info', msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => write('warn', msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => write('error', msg, fields),
}
