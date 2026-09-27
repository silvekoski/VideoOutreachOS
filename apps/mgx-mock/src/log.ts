type Level = 'info' | 'warn' | 'error'

function write(level: Level, msg: string, fields: Record<string, unknown> = {}): void {
  const line: Record<string, unknown> = { time: new Date().toISOString(), level, process: 'mgx-mock', msg }
  for (const [key, value] of Object.entries(fields)) {
    line[key] = value instanceof Error ? { name: value.name, message: value.message, stack: value.stack } : value
  }
  process.stdout.write(`${JSON.stringify(line)}\n`)
}

export const log = {
  info: (msg: string, fields?: Record<string, unknown>) => write('info', msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => write('warn', msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => write('error', msg, fields),
}
