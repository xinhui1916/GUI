/**
 * IPC bridge — works in both Tauri (native) and browser (dev mode) contexts.
 * In Tauri mode, uses @tauri-apps/api to invoke Rust commands.
 * In browser mode, falls back to direct Fetch API calls to DeepSeek.
 */

// ── Types ──────────────────────────────────────────────────────────

export type FileEntry = { name: string; path: string; is_dir: boolean }
export type BackendMode = 'api' | 'cli'

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

/** Default config — base URL and model only (API key must be set via settings.json or env) */
export function getDefaultConfig(): ApiConfig {
  return {
    apiKey: '',
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

/** Fetch with exponential backoff retry (transient errors only) */
async function fetchWithRetry(url: string, options: RequestInit & { signal?: AbortSignal }, maxRetries = 2): Promise<Response> {
  let lastErr: Error | null = null
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, options)
      if (res.ok || attempt >= maxRetries) return res
      // Only retry on server errors (5xx)
      if (res.status < 500) return res
      lastErr = new Error(`API ${res.status}`)
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err))
      // Don't retry if aborted
      if (options.signal?.aborted) throw lastErr
      if (attempt >= maxRetries) throw lastErr
    }
    // Exponential backoff: 1s, 2s
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 1000 * Math.pow(2, attempt))
      // Clear timer if aborted
      const onAbort = () => { clearTimeout(timer); resolve(undefined) }
      options.signal?.addEventListener('abort', onAbort, { once: true })
    })
    if (options.signal?.aborted) throw lastErr || new DOMException('Aborted', 'AbortError')
  }
  throw lastErr || new Error('Request failed')
}

async function browserSendMessage(
  message: string,
  history: { role: string; content: string | any[] }[],
  model: string,
  customPrompt: string | undefined,
  callbacks: StreamCallbacks,
): Promise<void> {
  const config = await loadBrowserConfig() ?? getDefaultConfig()
  const system = customPrompt
    ? `You are Claude Code Desktop, a helpful AI assistant running in a desktop application. You can help with coding, file management, software engineering, research, analysis, creative tasks, and general questions. Your responses are concise, professional, and well-structured. When asked about your underlying model, honestly state that you are powered by the DeepSeek V4 Flash model.\n\n## Custom Instructions\n${customPrompt}`
    : 'You are Claude Code Desktop, a helpful AI assistant running in a desktop application. You can help with coding, file management, software engineering, research, analysis, creative tasks, and general questions. Your responses are concise, professional, and well-structured. When asked about your underlying model, honestly state that you are powered by the DeepSeek V4 Flash model.'

  const body = {
    model,
    system,
    messages: [...history, { role: 'user' as const, content: message }],
    stream: true,
    max_tokens: 4096,
  }

  const response = await fetchWithRetry(`${config.baseUrl}/v1/messages`, {
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
        case 'message_delta': {
          if (data.usage && typeof data.usage.input_tokens === 'number') {
            emit('claude-usage', { session_id: '', usage: data.usage })
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
const browserSessions = new Map<string, { history: { role: string; content: string | any[] }[] }>()

/** Track the active AbortController so cancelClaude can abort */
let abortController: AbortController | null = null

/** Per-session full-text accumulator for browser-mode streaming */
const fullTextAccum = new Map<string, string>()

export async function sendToClaude(sessionId: string, message: string | any[], history?: { role: string; content: string | any[] }[], workspaceContext?: string, model?: string, customPrompt?: string, backendMode?: BackendMode, toolsEnabled?: boolean, projectApiKey?: string, projectBaseUrl?: string): Promise<void> {
  const isTauri = await initTauri()
  if (isTauri) {
    if (toolsEnabled || backendMode === 'api') {
      // Use API path with full tool loop support
      const messages = [
        ...(history || []),
        { role: 'user' as const, content: message },
      ]
      await tauriInvoke!('send_message', { sessionId, messages, workspaceContext, model, customPrompt, projectApiKey, projectBaseUrl })
      return
    }
    if (backendMode === 'cli') {
      await tauriInvoke!('send_message_cli', { sessionId, message, history: history || [], workspaceContext, model, customPrompt })
      return
    }
    return // shouldn't reach here
  }

  // Browser fallback: direct API call with SSE
  const config = await loadBrowserConfig() ?? getDefaultConfig()
  const effectiveModel = model || config.model

  const session = browserSessions.get(sessionId) ?? { history: history || [] }
  fullTextAccum.set(sessionId, '')

  abortController = new AbortController()
  const signal = abortController.signal

  try {
    const msg = Array.isArray(message) ? JSON.stringify(message) : message
    await browserSendMessage(msg, session.history, effectiveModel, customPrompt, {
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

export type UsageCallback = (sessionId: string, usage: { input_tokens: number; output_tokens: number }) => void

export async function onClaudeUsage(cb: UsageCallback): Promise<UnlistenFn> {
  const isTauri = await initTauri()
  if (isTauri) {
    return tauriListen!('claude-usage', (p) => {
      if (p.usage && typeof p.usage.input_tokens === 'number') {
        cb(p.session_id, p.usage)
      }
    })
  }
  return on('claude-usage', (p: any) => {
    if (p.usage && typeof p.usage.input_tokens === 'number') {
      cb(p.session_id, p.usage)
    }
  })
}

export async function onToolExecution(cb: (sessionId: string, toolName: string, toolInput: any, output: string) => void): Promise<UnlistenFn> {
  const isTauri = await initTauri()
  if (isTauri) {
    return tauriListen!('tool-execution', (p) => {
      if (typeof p.tool_name === 'string') {
        cb(p.session_id, p.tool_name, p.tool_input, p.output)
      }
    })
  }
  return on('tool-execution', (p: any) => {
    if (typeof p.tool_name === 'string') {
      cb(p.session_id, p.tool_name, p.tool_input, p.output)
    }
  })
}

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

export async function refreshWorkspaceContext(path: string): Promise<string> {
  const isTauri = await initTauri()
  if (!isTauri) return ''
  return tauriInvoke!('refresh_workspace_context', { path }) as Promise<string>
}

// ── Context compression (Tauri only) ───────────────────────────────────

export async function compressContext(messages: { role: string; content: string }[]): Promise<string | null> {
  const isTauri = await initTauri()
  if (!isTauri) return null
  return tauriInvoke!('compress_context', { messages }) as Promise<string>
}

// ── Claude CLI check (Tauri only) ─────────────────────────────────────

export async function checkClaudeInstalled(): Promise<string | null> {
  const isTauri = await initTauri()
  if (!isTauri) return null
  try {
    return await tauriInvoke!('check_claude_installed') as Promise<string>
  } catch {
    return null
  }
}

// ── Git status (Tauri only) ────────────────────────────────────────────

export interface GitChange {
  path: string
  status: string
}

export interface GitStatus {
  branch: string
  changes: GitChange[]
}

export async function getGitStatus(path: string): Promise<GitStatus | null> {
  const isTauri = await initTauri()
  if (!isTauri) return null
  return tauriInvoke!('git_status', { path }) as Promise<GitStatus>
}

export async function gitStage(path: string, filePath: string): Promise<string> {
  const isTauri = await initTauri()
  if (!isTauri) throw new Error('Git not available in browser mode')
  return tauriInvoke!('git_stage', { path, filePath }) as Promise<string>
}

export async function gitUnstage(path: string, filePath: string): Promise<string> {
  const isTauri = await initTauri()
  if (!isTauri) throw new Error('Git not available in browser mode')
  return tauriInvoke!('git_unstage', { path, filePath }) as Promise<string>
}

export async function gitCommit(path: string, message: string): Promise<string> {
  const isTauri = await initTauri()
  if (!isTauri) throw new Error('Git not available in browser mode')
  return tauriInvoke!('git_commit', { path, message }) as Promise<string>
}

export async function gitDiff(path: string, filePath: string, staged?: boolean): Promise<string> {
  const isTauri = await initTauri()
  if (!isTauri) throw new Error('Git not available in browser mode')
  return tauriInvoke!('git_diff', { path, filePath, staged: !!staged }) as Promise<string>
}

export async function gitPush(path: string): Promise<string> {
  const isTauri = await initTauri()
  if (!isTauri) throw new Error('Git not available in browser mode')
  return tauriInvoke!('git_push', { path }) as Promise<string>
}

// ── Git: Branch management ──────────────────────────────────────────

export interface GitBranch {
  name: string
  current: boolean
}

export async function gitBranches(path: string): Promise<GitBranch[]> {
  const isTauri = await initTauri()
  if (!isTauri) return []
  return tauriInvoke!('git_branches', { path }) as Promise<GitBranch[]>
}

export async function gitCreateBranch(path: string, name: string): Promise<string> {
  const isTauri = await initTauri()
  if (!isTauri) throw new Error('Git not available in browser mode')
  return tauriInvoke!('git_create_branch', { path, name }) as Promise<string>
}

export async function gitSwitchBranch(path: string, name: string): Promise<string> {
  const isTauri = await initTauri()
  if (!isTauri) throw new Error('Git not available in browser mode')
  return tauriInvoke!('git_switch_branch', { path, name }) as Promise<string>
}

export async function gitDeleteBranch(path: string, name: string): Promise<string> {
  const isTauri = await initTauri()
  if (!isTauri) throw new Error('Git not available in browser mode')
  return tauriInvoke!('git_delete_branch', { path, name }) as Promise<string>
}

// ── Git: Stash ──────────────────────────────────────────────────────

export interface GitStashEntry {
  index: number
  description: string
}

export async function gitStashPush(path: string, message?: string): Promise<string> {
  const isTauri = await initTauri()
  if (!isTauri) throw new Error('Git not available in browser mode')
  return tauriInvoke!('git_stash_push', { path, message: message || '' }) as Promise<string>
}

export async function gitStashPop(path: string): Promise<string> {
  const isTauri = await initTauri()
  if (!isTauri) throw new Error('Git not available in browser mode')
  return tauriInvoke!('git_stash_pop', { path }) as Promise<string>
}

export async function gitStashList(path: string): Promise<GitStashEntry[]> {
  const isTauri = await initTauri()
  if (!isTauri) return []
  return tauriInvoke!('git_stash_list', { path }) as Promise<GitStashEntry[]>
}

export async function gitStashShow(path: string, index: number): Promise<string> {
  const isTauri = await initTauri()
  if (!isTauri) throw new Error('Git not available in browser mode')
  return tauriInvoke!('git_stash_show', { path, index }) as Promise<string>
}

export async function gitStashDrop(path: string, index: number): Promise<string> {
  const isTauri = await initTauri()
  if (!isTauri) throw new Error('Git not available in browser mode')
  return tauriInvoke!('git_stash_drop', { path, index }) as Promise<string>
}

// ── Git: Blame ──────────────────────────────────────────────────────

export interface GitBlameEntry {
  commit: string
  author: string
  date: string
  line: number
  content: string
}

export async function gitBlame(path: string, filePath: string): Promise<GitBlameEntry[]> {
  const isTauri = await initTauri()
  if (!isTauri) return []
  return tauriInvoke!('git_blame', { path, filePath }) as Promise<GitBlameEntry[]>
}

// ── Git: Discard ───────────────────────────────────────────────────────

export async function gitDiscard(path: string, filePath: string): Promise<string> {
  const isTauri = await initTauri()
  if (!isTauri) throw new Error('Git not available in browser mode')
  return tauriInvoke!('git_discard', { path, filePath }) as Promise<string>
}

// ── Git: Stage hunk ──────────────────────────────────────────────────

export async function gitStageHunk(path: string, patch: string): Promise<string> {
  const isTauri = await initTauri()
  if (!isTauri) throw new Error('Git not available in browser mode')
  return tauriInvoke!('git_stage_hunk', { path, patch }) as Promise<string>
}

// ── Git: Pull / Fetch / Log / Remote ───────────────────────────────

export async function gitPull(path: string): Promise<string> {
  const isTauri = await initTauri()
  if (!isTauri) throw new Error('Git not available in browser mode')
  return tauriInvoke!('git_pull', { path }) as Promise<string>
}

export async function gitFetch(path: string): Promise<string> {
  const isTauri = await initTauri()
  if (!isTauri) throw new Error('Git not available in browser mode')
  return tauriInvoke!('git_fetch', { path }) as Promise<string>
}

export interface GitLogEntry {
  hash: string
  message: string
  author: string
  date: string
}

export interface GitLogGraphEntry extends GitLogEntry {
  graph: string
}

export async function gitLog(path: string, maxCount?: number): Promise<GitLogEntry[]> {
  const isTauri = await initTauri()
  if (!isTauri) return []
  return tauriInvoke!('git_log', { path, maxCount }) as Promise<GitLogEntry[]>
}

export async function gitLogGraph(path: string, maxCount?: number): Promise<GitLogGraphEntry[]> {
  const isTauri = await initTauri()
  if (!isTauri) return []
  return tauriInvoke!('git_log_graph', { path, maxCount }) as Promise<GitLogGraphEntry[]>
}

export interface GitRemote {
  name: string
  url: string
}

export async function gitRemoteList(path: string): Promise<GitRemote[]> {
  const isTauri = await initTauri()
  if (!isTauri) return []
  return tauriInvoke!('git_remote_list', { path }) as Promise<GitRemote[]>
}

export async function gitRemoteAdd(path: string, name: string, url: string): Promise<string> {
  const isTauri = await initTauri()
  if (!isTauri) throw new Error('Git not available in browser mode')
  return tauriInvoke!('git_remote_add', { path, name, url }) as Promise<string>
}

export async function gitRemoteRemove(path: string, name: string): Promise<string> {
  const isTauri = await initTauri()
  if (!isTauri) throw new Error('Git not available in browser mode')
  return tauriInvoke!('git_remote_remove', { path, name }) as Promise<string>
}

// ── Open in editor (Tauri only) ─────────────────────────────────────

export async function openInEditor(filePath: string): Promise<void> {
  const isTauri = await initTauri()
  if (!isTauri) return
  await tauriInvoke!('open_in_editor', { path: filePath })
}

// ── Terminal (Tauri only) ─────────────────────────────────────────────

export async function spawnTerminal(path?: string, shell?: string): Promise<string> {
  const isTauri = await initTauri()
  if (!isTauri) throw new Error('Terminal not available in browser mode')
  const args: Record<string, unknown> = {}
  if (path) args.path = path
  if (shell) args.shell = shell
  return tauriInvoke!('spawn_terminal', args) as Promise<string>
}

export async function readFile(path: string): Promise<string> {
  const isTauri = await initTauri()
  if (!isTauri) throw new Error('File reading not available in browser mode')
  return tauriInvoke!('read_file', { path }) as Promise<string>
}

export async function readFileBase64(path: string): Promise<string> {
  const isTauri = await initTauri()
  if (!isTauri) throw new Error('File reading not available in browser mode')
  return tauriInvoke!('read_file_base64', { path }) as Promise<string>
}

export async function writeFile(path: string, content: string): Promise<void> {
  const isTauri = await initTauri()
  if (!isTauri) throw new Error('File writing not available in browser mode')
  await tauriInvoke!('write_file', { path, content })
}

export async function createFile(path: string): Promise<void> {
  const isTauri = await initTauri()
  if (!isTauri) throw new Error('File operations not available in browser mode')
  await tauriInvoke!('create_file', { path })
}

export async function createDirectory(path: string): Promise<void> {
  const isTauri = await initTauri()
  if (!isTauri) throw new Error('File operations not available in browser mode')
  await tauriInvoke!('create_directory', { path })
}

export async function renamePath(oldPath: string, newPath: string): Promise<void> {
  const isTauri = await initTauri()
  if (!isTauri) throw new Error('File operations not available in browser mode')
  await tauriInvoke!('rename_path', { oldPath, newPath })
}

export async function deletePath(path: string): Promise<void> {
  const isTauri = await initTauri()
  if (!isTauri) throw new Error('File operations not available in browser mode')
  await tauriInvoke!('delete_path', { path })
}

export async function runTask(path: string, command: string): Promise<string> {
  const isTauri = await initTauri()
  if (!isTauri) throw new Error('Task runner not available in browser mode')
  return tauriInvoke!('run_task', { path, command }) as Promise<string>
}

// ── File search ────────────────────────────────────────────────────────

export interface SearchMatch {
  file: string
  line: number
  column: number
  content: string
}

export async function searchInFiles(path: string, query: string): Promise<SearchMatch[]> {
  const isTauri = await initTauri()
  if (!isTauri) return []
  return tauriInvoke!('search_in_files', { path, query }) as Promise<SearchMatch[]>
}

export interface ReplaceResult {
  file: string
  count: number
}

export async function replaceInFiles(path: string, query: string, replacement: string): Promise<ReplaceResult[]> {
  const isTauri = await initTauri()
  if (!isTauri) return []
  return tauriInvoke!('replace_in_files', { path, query, replacement }) as Promise<ReplaceResult[]>
}

export async function writeStdin(terminalId: string, input: string): Promise<void> {
  const isTauri = await initTauri()
  if (!isTauri) return
  await tauriInvoke!('write_stdin', { terminalId, input })
}

export async function killTerminal(terminalId: string): Promise<void> {
  const isTauri = await initTauri()
  if (!isTauri) return
  await tauriInvoke!('kill_terminal', { terminalId })
}

// ── Code formatting ──────────────────────────────────────────────────

export async function formatCode(path: string, content: string): Promise<string> {
  const isTauri = await initTauri()
  if (!isTauri) throw new Error('Formatting not available in browser mode')
  return tauriInvoke!('format_code', { path, content }) as Promise<string>
}

// ── File history ────────────────────────────────────────────────────────

export async function getFileHistory(path: string, maxCount?: number): Promise<{ name: string; path: string; modified_ago: number }[]> {
  const isTauri = await initTauri()
  if (!isTauri) return []
  return tauriInvoke!('get_file_history', { path, maxCount }) as Promise<any[]>
}

// ── Snippets ─────────────────────────────────────────────────────────

export async function readSnippets(): Promise<string> {
  const isTauri = await initTauri()
  if (!isTauri) return '[]'
  return tauriInvoke!('read_snippets') as Promise<string>
}

export async function writeSnippets(content: string): Promise<void> {
  const isTauri = await initTauri()
  if (!isTauri) return
  await tauriInvoke!('write_snippets', { content })
}

export async function onTerminalOutput(cb: (terminalId: string, data: string) => void): Promise<UnlistenFn> {
  const isTauri = await initTauri()
  if (!isTauri) return () => {}
  return tauriListen!('terminal-output', (p) => {
    if (typeof p.terminal_id === 'string' && typeof p.data === 'string') {
      cb(p.terminal_id, p.data)
    }
  })
}

// ── LSP Integration ───────────────────────────────────────────────────

export interface LspServerInfo {
  language: string
  available: boolean
}

export async function lspStartServer(language: string, workspace: string): Promise<string> {
  const isTauri = await initTauri()
  if (!isTauri) throw new Error('LSP requires Tauri')
  return tauriInvoke!('lsp_start_server', { language, workspace }) as Promise<string>
}

export async function lspStopServer(serverId: string): Promise<void> {
  const isTauri = await initTauri()
  if (!isTauri) return
  await tauriInvoke!('lsp_stop_server', { serverId })
}

export async function lspRequest(serverId: string, method: string, params: any): Promise<any> {
  const isTauri = await initTauri()
  if (!isTauri) throw new Error('LSP requires Tauri')
  return tauriInvoke!('lsp_request', { serverId, method, params })
}

export async function lspNotification(serverId: string, method: string, params: any): Promise<void> {
  const isTauri = await initTauri()
  if (!isTauri) return
  await tauriInvoke!('lsp_notification', { serverId, method, params })
}

export async function lspCheckServers(): Promise<LspServerInfo[]> {
  const isTauri = await initTauri()
  if (!isTauri) return []
  return tauriInvoke!('lsp_check_servers') as Promise<LspServerInfo[]>
}

export type LspDiagnosticsCallback = (params: { uri: string; diagnostics: any[] }) => void

export async function onLspDiagnostics(cb: LspDiagnosticsCallback): Promise<UnlistenFn> {
  const isTauri = await initTauri()
  if (!isTauri) return () => {}
  return tauriListen!('lsp-diagnostics', (p: any) => {
    if (p && p.uri) {
      cb(p)
    }
  })
}

// ── DAP Integration ───────────────────────────────────────────────────

export async function dapStartSession(sessionId: string, command: string, args: string[], cwd?: string): Promise<void> {
  const isTauri = await initTauri()
  if (!isTauri) return
  await tauriInvoke!('dap_start_session', { sessionId, command, args, cwd })
}

export async function dapStopSession(sessionId: string): Promise<void> {
  const isTauri = await initTauri()
  if (!isTauri) return
  await tauriInvoke!('dap_stop_session', { sessionId })
}

export async function dapSendRequest(sessionId: string, command: string, args: any): Promise<any> {
  const isTauri = await initTauri()
  if (!isTauri) throw new Error('DAP requires Tauri')
  return tauriInvoke!('dap_send_request', { sessionId, command, args })
}

export async function dapSendRequestRaw(sessionId: string, command: string, args: any): Promise<number> {
  const isTauri = await initTauri()
  if (!isTauri) throw new Error('DAP requires Tauri')
  return tauriInvoke!('dap_send_request_raw', { sessionId, command, args }) as Promise<number>
}

export async function onDapEvent(cb: (event: string, sessionId: string, body: any) => void): Promise<UnlistenFn> {
  const isTauri = await initTauri()
  if (!isTauri) return () => {}
  return tauriListen!('dap-event', (p: any) => {
    if (p && p.event && p.session_id) {
      cb(p.event, p.session_id, p.body)
    }
  })
}

// ── File watcher ───────────────────────────────────────────────────────────

export async function startFileWatcher(path: string): Promise<void> {
  const isTauri = await initTauri()
  if (!isTauri) return
  await tauriInvoke!('start_file_watcher', { path })
}

export async function stopFileWatcher(path: string): Promise<void> {
  const isTauri = await initTauri()
  if (!isTauri) return
  await tauriInvoke!('stop_file_watcher', { path })
}

export type FileChangeCallback = (paths: string[]) => void

export async function onFileChanged(cb: FileChangeCallback): Promise<UnlistenFn> {
  const isTauri = await initTauri()
  if (!isTauri) return () => {}
  return tauriListen!('file-changed', (p: any) => {
    if (p && Array.isArray(p.paths)) {
      cb(p.paths)
    }
  })
}

// ── Extension Marketplace ────────────────────────────────────────────────

export async function installExtension(vsixUrl: string, extensionName: string): Promise<any> {
  const isTauri = await initTauri()
  if (!isTauri) throw new Error('扩展安装需要 Tauri')
  // Try browser fetch first (handles proxy/VPN better), fall back to Rust download
  try {
    const res = await fetch(vsixUrl, { signal: AbortSignal.timeout(60_000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const blob = await res.blob()
    const reader = new FileReader()
    const base64 = await new Promise<string>((resolve, reject) => {
      reader.onload = () => resolve((reader.result as string).split(',')[1])
      reader.onerror = () => reject(new Error('Base64 编码失败'))
      reader.readAsDataURL(blob)
    })
    return tauriInvoke!('install_extension_from_data', { data: base64, extensionName })
  } catch (e: any) {
    console.warn('Browser fetch failed, trying Rust backend:', e.message)
    return tauriInvoke!('install_extension', { vsixUrl, extensionName })
  }
}

// ── Diagnostic (WinAICheck) ──────────────────────────────────────────────

export interface DiagnosticScanResult {
  id: string
  name: string
  category: string
  status: string
  message: string
  detail?: string
  version?: string
  path?: string
  error_type?: string
}

export interface DiagnosticBreakdown {
  category: string
  passed: number
  total: number
  weight: number
  weightedScore: number
}

export interface DiagnosticScore {
  score: number
  grade: string
  label: string
  breakdown: DiagnosticBreakdown[]
}

export interface DiagnosticReport {
  version: string
  timestamp: string
  score: DiagnosticScore
  results: DiagnosticScanResult[]
}

export interface DiagnosticBasicCheck {
  id: string
  name: string
  category: string
  status: string
  message: string
  detail?: string
  version?: string
}

export interface DiagnosticResponse {
  ok: boolean
  report?: DiagnosticReport
  basic?: DiagnosticBasicCheck[]
  error?: string
  winaicheck_available: boolean
}

export async function runDiagnostic(): Promise<DiagnosticResponse> {
  const isTauri = await initTauri()
  if (!isTauri) return { ok: false, error: '诊断功能需要 Tauri 环境', winaicheck_available: false }
  return tauriInvoke!('run_diagnostic') as Promise<DiagnosticResponse>
}
