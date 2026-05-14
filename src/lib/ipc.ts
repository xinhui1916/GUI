/**
 * IPC bridge — works in both Tauri (native) and browser (dev mode) contexts.
 * In Tauri mode, uses @tauri-apps/api to invoke Rust commands.
 * In browser mode, falls back to direct Fetch API calls to DeepSeek.
 */

// ── Types ──────────────────────────────────────────────────────────

export type FileEntry = { name: string; path: string; is_dir: boolean }

type UnlistenFn = () => void

type ChunkCallback = (text: string) => void

type DoneCallback = () => void

type ErrorCallback = (error: string) => void

// ── Tauri mode state ───────────────────────────────────────────────

type TauriInvoke = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>
type TauriListen = (event: string, cb: (payload: any) => void) => Promise<UnlistenFn>

let tauriInvoke: TauriInvoke | null = null
let tauriListen: TauriListen | null = null

async function initTauri(): Promise<boolean> {
  if (tauriInvoke && tauriListen) return true
  const ti = (window as any).__TAURI_INTERNALS__
  if (!ti) return false

  try {
    // Use Tauri internals directly — no dynamic imports needed
    tauriInvoke = (cmd, args) => ti.invoke(cmd, args)

    // For events, we need @tauri-apps/api/event for proper listener management
    const tauriEvent = await import('@tauri-apps/api/event')
    tauriListen = (event, cb) =>
      tauriEvent.listen(event, (e: any) => cb(e.payload))
    return true
  } catch {
    // Fallback: basic event listening via internals if import fails
    if (ti.listen) {
      tauriListen = (event, cb) => ti.listen(event, cb)
      return true
    }
    return false
  }
}

// ── Browser-mode API config ────────────────────────────────────────

interface ApiConfig {
  apiKey: string
  baseUrl: string
  model: string
}

/** In browser mode we read the same ~/.claude/settings.json that Rust uses. */
async function loadBrowserConfig(): Promise<ApiConfig | null> {
  // Try env-inspired approach: localStorage
  const stored = localStorage.getItem('claude-api-config')
  if (stored) {
    try { return JSON.parse(stored) } catch { /* ignore */ }
  }
  return null
}

/** Save API config to localStorage (called from settings UI) */
export function saveBrowserConfig(config: ApiConfig) {
  localStorage.setItem('claude-api-config', JSON.stringify(config))
}

/** Default config — matches ~/.claude/settings.json values */
export function getDefaultConfig(): ApiConfig {
  return {
    apiKey: 'sk-6a17fa3b075d420887daea4a4c68985c',
    baseUrl: 'https://api.deepseek.com/anthropic',
    model: 'deepseek-v4-flash',
  }
}

// ── Browser-mode streaming fetch ───────────────────────────────────

type StreamCallbacks = {
  onChunk: ChunkCallback
  onDone: DoneCallback
  onError: ErrorCallback
  signal?: AbortSignal
}

async function browserSendMessage(
  message: string,
  history: { role: string; content: string }[],
  callbacks: StreamCallbacks,
): Promise<void> {
  const config = await loadBrowserConfig() ?? getDefaultConfig()

  const body = {
    model: config.model,
    system: 'You are Claude Code Desktop, a helpful AI assistant running in a desktop application. You can help with coding, file management, software engineering, research, analysis, creative tasks, and general questions. Your responses are concise, professional, and well-structured. When asked about your underlying model, honestly state that you are powered by the DeepSeek V4 Flash model.',
    messages: [...history, { role: 'user' as const, content: message }],
    stream: true,
    max_tokens: 4096,
  }

  const response = await fetch(`${config.baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
    signal: callbacks.signal,
  })

  if (!response.ok) {
    const text = await response.text().catch(() => 'unknown')
    throw new Error(`API ${response.status}: ${text}`)
  }

  const reader = response.body?.getReader()
  if (!reader) throw new Error('No response body')

  const decoder = new TextDecoder()
  let lineBuf = ''
  let eventType = ''
  let eventData = ''

  function flushEvent() {
    if (!eventData) return
    try {
      const data = JSON.parse(eventData)
      switch (eventType) {
        case 'content_block_delta': {
          const text = data.delta?.text
          if (typeof text === 'string') {
            callbacks.onChunk(text)
          }
          break
        }
        case 'error': {
          const errText = data.error?.message || data.error || eventData
          callbacks.onError(errText)
          break
        }
        case 'message_stop': {
          callbacks.onDone()
          break
        }
      }
    } catch {
      // skip unparseable data
    }
    eventType = ''
    eventData = ''
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    lineBuf += decoder.decode(value, { stream: true })

    // Process complete lines one by one (handles chunk-boundary splits)
    while (lineBuf.includes('\n')) {
      const nl = lineBuf.indexOf('\n')
      const line = lineBuf.slice(0, nl).replace(/\r$/, '')
      lineBuf = lineBuf.slice(nl + 1)

      if (line.startsWith('event: ')) {
        eventType = line.slice(7)
      } else if (line.startsWith('data: ')) {
        eventData = line.slice(6)
      } else if (line === '' && eventData) {
        // Empty line = end of SSE event block
        flushEvent()
        if (callbacks.signal?.aborted) return
      }
    }
  }

  // Stream ended — flush any remaining buffered event
  flushEvent()

  if (!callbacks.signal?.aborted) {
    callbacks.onDone()
  }
}

// ── Public API ─────────────────────────────────────────────────────

/** Browser-mode session history (mirrors Rust's SessionData.messages) */
const browserSessions = new Map<string, { history: { role: string; content: string }[] }>()

/** Track the active AbortController so cancelClaude can abort */
let abortController: AbortController | null = null

/** Per-session full-text accumulator for browser-mode streaming */
const fullTextAccum = new Map<string, string>()

export async function sendToClaude(sessionId: string, message: string, history?: { role: string; content: string }[], workspaceContext?: string): Promise<void> {
  const isTauri = await initTauri()
  if (isTauri) {
    // Pass full message history so Rust backend doesn't need to manage it
    const messages = [
      ...(history || []),
      { role: 'user' as const, content: message },
    ]
    await tauriInvoke!('send_message', { sessionId, messages, workspaceContext })
    return
  }

  // Browser fallback: direct API call with SSE
  const session = browserSessions.get(sessionId) ?? { history: history || [] }
  fullTextAccum.set(sessionId, '')

  abortController = new AbortController()
  const signal = abortController.signal

  try {
    await browserSendMessage(message, session.history, {
      onChunk: (text) => {
        fullTextAccum.set(sessionId, (fullTextAccum.get(sessionId) ?? '') + text)
        emitChunk(sessionId, text)
      },
      onDone: () => {
        const full = fullTextAccum.get(sessionId) ?? ''
        session.history.push(
          { role: 'user', content: message },
          { role: 'assistant', content: full },
        )
        browserSessions.set(sessionId, session)
        fullTextAccum.delete(sessionId)
        emitDone(sessionId)
        abortController = null
      },
      onError: (error) => {
        fullTextAccum.delete(sessionId)
        emitError(sessionId, error)
        emitDone(sessionId)
        abortController = null
      },
      signal,
    })
  } catch (err: any) {
    fullTextAccum.delete(sessionId)
    abortController = null
    throw err
  }
}

export async function cancelClaude(sessionId: string): Promise<void> {
  const isTauri = await initTauri()
  if (isTauri) {
    await tauriInvoke!('cancel_message', { sessionId })
    return
  }

  // Browser: abort the fetch
  abortController?.abort()
  abortController = null
  emitDone(sessionId)
}

// ── Event system (cross-platform) ──────────────────────────────────

type Listener = (...args: any[]) => void
const listeners = new Map<string, Set<Listener>>()

function on(event: string, cb: Listener): UnlistenFn {
  if (!listeners.has(event)) listeners.set(event, new Set())
  listeners.get(event)!.add(cb)
  return () => listeners.get(event)?.delete(cb)
}

function emit(event: string, ...args: any[]) {
  listeners.get(event)?.forEach((cb) => cb(...args))
}

function emitChunk(sessionId: string, text: string) {
  emit('claude-chunk', { session_id: sessionId, text })
}

function emitDone(sessionId: string) {
  emit('claude-done', { session_id: sessionId })
}

function emitError(sessionId: string, error: string) {
  emit('claude-error', { session_id: sessionId, error })
}

// ── Event listeners ────────────────────────────────────────────────

export async function onClaudeChunk(cb: ChunkCallback): Promise<UnlistenFn> {
  const isTauri = await initTauri()
  if (isTauri) {
    return tauriListen!('claude-chunk', (p) => {
      if (typeof p.text === 'string') cb(p.text)
    })
  }
  return on('claude-chunk', (p: any) => {
    if (typeof p.text === 'string') cb(p.text)
  })
}

export async function onClaudeDone(cb: DoneCallback): Promise<UnlistenFn> {
  const isTauri = await initTauri()
  if (isTauri) {
    return tauriListen!('claude-done', () => cb())
  }
  return on('claude-done', () => cb())
}

export async function onClaudeError(cb: ErrorCallback): Promise<UnlistenFn> {
  const isTauri = await initTauri()
  if (isTauri) {
    return tauriListen!('claude-error', (p) => {
      if (typeof p.error === 'string') cb(p.error)
    })
  }
  return on('claude-error', (p: any) => {
    if (typeof p.error === 'string') cb(p.error)
  })
}

// ── Filesystem (Tauri only) ────────────────────────────────────────

export async function listFiles(path: string): Promise<FileEntry[]> {
  const isTauri = await initTauri()
  if (!isTauri) return []
  return tauriInvoke!('list_directory', { path }) as Promise<FileEntry[]>
}

export async function readWorkspaceContext(path: string): Promise<string> {
  const isTauri = await initTauri()
  if (!isTauri) return ''
  return tauriInvoke!('read_workspace_context', { path }) as Promise<string>
}
