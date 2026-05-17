/**
 * Client-side logger — mirrors VS Code's output/logging system.
 * All errors are logged here, viewable in the Output panel.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogEntry {
  level: LogLevel
  source: string
  message: string
  timestamp: number
}

const MAX_LOGS = 1000
const _logs: LogEntry[] = []

function _emit(entry: LogEntry) {
  _logs.push(entry)
  if (_logs.length > MAX_LOGS) _logs.shift()
  // Also dispatch a DOM event so the Output panel can pick it up
  window.dispatchEvent(new CustomEvent('claude-log', { detail: entry }))
}

/** Log a message at the given level */
export function log(level: LogLevel, source: string, message: string, error?: unknown) {
  const detail = error ? `: ${error instanceof Error ? error.message : String(error)}` : ''
  const entry: LogEntry = { level, source, message: message + detail, timestamp: Date.now() }
  _emit(entry)

  switch (level) {
    case 'error':
      console.error(`[${source}] ${message}`, error ?? '')
      break
    case 'warn':
      console.warn(`[${source}] ${message}`, error ?? '')
      break
    default:
      console.log(`[${source}] ${message}`)
  }
}

/** Shorthand for error logging */
export function logError(source: string, message: string, error?: unknown) {
  log('error', source, message, error)
}

/** Shorthand for warning logging */
export function logWarn(source: string, message: string, error?: unknown) {
  log('warn', source, message, error)
}

/** Retrieve all logs (for Output panel) */
export function getLogs(): LogEntry[] {
  return _logs.slice()
}

/** Clear all logs */
export function clearLogs() {
  _logs.length = 0
}
