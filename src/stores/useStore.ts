import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { sendToClaude, cancelClaude, readWorkspaceContext, compressContext } from '../lib/ipc'
import type { BackendMode } from '../lib/ipc'
import type { Lang } from '../lib/i18n'
import { useOutputStore } from './outputStore'
import { useCustomThemeStore } from '../theme/customThemeStore'

export type Theme = 'ocean' | 'forest' | 'sunset' | 'purple' | 'cherry' | 'neon' | 'light' | 'sepia' | 'dracula' | 'nord' | 'sakura' | 'midnight' | 'solarized'

export const themeNames: Record<Theme, string> = {
  ocean: 'Ocean Blue',
  forest: 'Forest Green',
  sunset: 'Sunset Orange',
  purple: 'Royal Purple',
  cherry: 'Cherry Red',
  neon: 'Neon Cyber',
  light: 'Minimal Light',
  sepia: 'Warm Sepia',
  dracula: 'Dracula',
  nord: 'Nord',
  sakura: 'Sakura',
  midnight: 'Midnight',
  solarized: 'Solarized',
}

export interface ProjectConfig {
  model?: string
  baseUrl?: string
  apiKey?: string
  customPrompt?: string
}

export const themeAccents: Record<Theme, string> = {
  ocean: '#3b82f6',
  forest: '#10b981',
  sunset: '#f97316',
  purple: '#8b5cf6',
  cherry: '#ef4444',
  neon: '#06b6d4',
  light: '#3b82f6',
  sepia: '#d97706',
  dracula: '#bd93f9',
  nord: '#5e81ac',
  sakura: '#ec4899',
  midnight: '#6366f1',
  solarized: '#2aa198',
}

export interface ThemePalette {
  primary: string
  accent: string
  elevated: string
  border: string
  text: string
}

export const themePalettes: Record<Theme, ThemePalette> = {
  ocean:     { primary: '#0a0f1e', accent: '#3b82f6', elevated: '#1a1e26', border: '#23272e', text: '#e1e4e8' },
  forest:    { primary: '#0a140e', accent: '#10b981', elevated: '#16291e', border: '#1f3327', text: '#e1e8e3' },
  sunset:    { primary: '#1a0f0a', accent: '#f97316', elevated: '#382218', border: '#4a2e22', text: '#e8e1dc' },
  purple:    { primary: '#0f0a1a', accent: '#8b5cf6', elevated: '#221838', border: '#2e224a', text: '#e1dce8' },
  cherry:    { primary: '#1a0a0f', accent: '#ef4444', elevated: '#381822', border: '#4a2230', text: '#e8dce0' },
  neon:      { primary: '#050505', accent: '#06b6d4', elevated: '#1a1a1a', border: '#222222', text: '#e1e4e8' },
  light:     { primary: '#ffffff', accent: '#3b82f6', elevated: '#e8eaed', border: '#d1d5db', text: '#1f2937' },
  sepia:     { primary: '#f5f0e8', accent: '#d97706', elevated: '#e0d6c4', border: '#c9bea8', text: '#5c4a3a' },
  dracula:   { primary: '#1e1e2e', accent: '#bd93f9', elevated: '#2d2d48', border: '#3a3a58', text: '#e6e6f0' },
  nord:      { primary: '#2e3440', accent: '#5e81ac', elevated: '#434c5e', border: '#4c566a', text: '#e5e9f0' },
  sakura:    { primary: '#1e1218', accent: '#ec4899', elevated: '#3a2230', border: '#4c2e3e', text: '#f0e0e8' },
  midnight:  { primary: '#0a0e1a', accent: '#6366f1', elevated: '#1a2440', border: '#243050', text: '#dce0f0' },
  solarized: { primary: '#002b36', accent: '#2aa198', elevated: '#145a64', border: '#1a6a76', text: '#e0e8e6' },
}

export interface Session {
  id: string
  name: string
  preview?: string
  time: string
  active: boolean
  archived?: boolean
  usage?: { input_tokens: number; output_tokens: number }
  tags?: string[]
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  files?: string[]
  images?: string[]
  streaming?: boolean
  time?: string
  elapsed?: number
}

interface AppState {
  theme: Theme
  sessions: Session[]
  activeSessionId: string
  messages: Record<string, Message[]>
  rightTab: 'files' | 'tools' | 'info' | 'terminal' | 'git' | 'search' | 'problems' | 'output' | 'extensions' | 'debug' | 'tasks' | 'timeline' | 'scripts' | 'todos' | 'diagnostic'
  isStreaming: boolean
  workspacePath: string
  workspaceContext: string
  model: string
  customPrompt: string
  promptPresets: { name: string; prompt: string }[]
  lang: Lang
  systemFollow: boolean
  apiProvider: string
  backendMode: BackendMode
  claudeVersion: string | null
  toolsEnabled: boolean
  recentProjects: string[]
  editingFiles: { path: string; content: string }[]
  activeEditingFilePath: string | null
  editorSelection: string
  projectConfigs: Record<string, ProjectConfig>
  keybindings: Record<string, string>
  autoSave: boolean
  autoSaveDelay: number
  formatOnSave: boolean
  tabSize: number
  commitHistory: string[]

  setAutoSave: (v: boolean) => void
  setAutoSaveDelay: (delay: number) => void
  setFormatOnSave: (v: boolean) => void
  setTabSize: (size: number) => void
  addCommitMessage: (msg: string) => void
  setTheme: (theme: Theme) => void
  setKeybinding: (action: string, combo: string) => void
  resetKeybindings: () => void
  setActiveSession: (id: string) => void
  setRightTab: (tab: 'files' | 'tools' | 'info' | 'terminal' | 'git' | 'search' | 'problems' | 'output' | 'extensions' | 'debug' | 'tasks' | 'timeline' | 'scripts' | 'todos' | 'diagnostic') => void
  setWorkspacePath: (path: string) => Promise<void>
  addMessage: (sessionId: string, message: Message) => void
  addSession: (session: Session) => void
  createNewSession: () => string

  deleteSession: (id: string) => void
  archiveSession: (id: string) => void
  renameSession: (id: string, name: string) => void
  editMessage: (sessionId: string, messageId: string, content: string) => void
  deleteMessage: (sessionId: string, messageId: string) => void
  clearSession: (sessionId: string) => void
  setModel: (model: string) => void
  setCustomPrompt: (prompt: string) => void
  setSessionUsage: (sessionId: string, usage: { input_tokens: number; output_tokens: number }) => void
  addPromptPreset: (name: string, prompt: string) => void
  deletePromptPreset: (name: string) => void
  setLang: (lang: Lang) => void
  setSystemFollow: (v: boolean) => void
  setApiProvider: (provider: string) => void
  setBackendMode: (mode: BackendMode) => void
  setToolsEnabled: (v: boolean) => void
  setSessionTags: (sessionId: string, tags: string[]) => void
  regenerateMessage: (sessionId: string, messageId: string) => void
  compressSession: (sessionId: string) => Promise<void>
  addRecentProject: (path: string) => void
  clearRecentProjects: () => void
  openEditingFile: (file: { path: string; content: string }) => void
  closeEditingFile: (path: string) => void
  setActiveEditingFile: (path: string | null) => void
  setEditorSelection: (text: string) => void
  updateEditingFileContent: (path: string, content: string) => void
  setProjectConfig: (path: string, config: ProjectConfig) => void

  // Streaming / IPC
  sendUserMessage: (content: string) => void
  cancelCurrentMessage: () => void
  appendStreamChunk: (text: string) => void
  finalizeStream: () => void
}

let msgCounter = 100
let streamStartTime = 0

const defaultKeybindings: Record<string, string> = {
  toggleSidebar: 'ctrl+b',
  newSession: 'ctrl+n',
  openSettings: 'ctrl+,',
  openCommandPalette: 'ctrl+shift+p',
  toggleZenMode: 'ctrl+shift+z',
  formatCode: 'ctrl+shift+f',
  goToFile: 'ctrl+p',
}

function nextId() {
  return `msg-${++msgCounter}`
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      theme: 'ocean',
      sessions: [],
      activeSessionId: '',
      messages: {},
      rightTab: 'files',
      isStreaming: false,
      workspacePath: '',
      workspaceContext: '',
      model: 'deepseek-v4-flash',
      customPrompt: '',
      promptPresets: [],
      lang: 'zh',
      systemFollow: false,
      apiProvider: 'deepseek',
      backendMode: 'cli',
      toolsEnabled: true,
      claudeVersion: null,
      recentProjects: [],
      editingFiles: [],
      activeEditingFilePath: null,
      editorSelection: '',
      projectConfigs: {},
      keybindings: { ...defaultKeybindings },
      autoSave: false,
      autoSaveDelay: 3000,
      formatOnSave: false,
      tabSize: 2,
      commitHistory: [],

      setTheme: (theme) => {
        // If a custom theme is active, deactivate it first
        const { activeCustomThemeId, deactivateCustomTheme } = useCustomThemeStore.getState()
        if (activeCustomThemeId) deactivateCustomTheme()
        document.documentElement.setAttribute('data-theme', theme)
        localStorage.setItem('claude-desktop-theme', theme)
        set({ theme })
      },
      setActiveSession: (id) =>
        set((state) => ({
          activeSessionId: id,
          sessions: state.sessions.map((s) => ({ ...s, active: s.id === id })),
        })),
      setRightTab: (tab) => set({ rightTab: tab }),
      setKeybinding: (action, combo) => {
        set((state) => ({
          keybindings: { ...state.keybindings, [action]: combo },
        }))
      },
      resetKeybindings: () => {
        set({ keybindings: { ...defaultKeybindings } })
      },
      setAutoSave: (v) => set({ autoSave: v }),
      setAutoSaveDelay: (delay) => set({ autoSaveDelay: delay }),
      setFormatOnSave: (v) => set({ formatOnSave: v }),
      setTabSize: (size) => set({ tabSize: size }),
      addCommitMessage: (msg) => set((state) => ({
        commitHistory: [msg, ...state.commitHistory.filter(m => m !== msg)].slice(0, 20),
      })),
      setWorkspacePath: async (path) => {
        const ctx = await readWorkspaceContext(path)
        set({ workspacePath: path, workspaceContext: ctx })
        get().addRecentProject(path)
      },
      addMessage: (sessionId, message) =>
        set((state) => ({
          messages: {
            ...state.messages,
            [sessionId]: [...(state.messages[sessionId] || []), message],
          },
        })),
      addSession: (session) =>
        set((state) => ({
          sessions: [...state.sessions, session],
        })),
      createNewSession: () => {
        const id = `sess-${Date.now()}`
        const now = new Date()
        const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
        const session: Session = { id, name: '新会话', time: timeStr, active: true }
        set((state) => ({
          activeSessionId: id,
          sessions: state.sessions.map((s) => ({ ...s, active: false })).concat(session),
          messages: { ...state.messages, [id]: [] },
        }))
        return id
      },

      deleteSession: (id) => {
        set((state) => {
          const remaining = state.sessions.filter((s) => s.id !== id)
          const restMessages: Record<string, Message[]> = {}
          for (const key of Object.keys(state.messages)) {
            if (key !== id) restMessages[key] = state.messages[key]
          }
          const newActive = id === state.activeSessionId
            ? (remaining[0]?.id ?? '')
            : state.activeSessionId
          return {
            sessions: remaining.map((s) => ({ ...s, active: s.id === newActive })),
            messages: restMessages,
            activeSessionId: newActive,
          }
        })
      },

      archiveSession: (id) => {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === id ? { ...s, archived: !s.archived } : s
          ),
        }))
      },

      renameSession: (id, name) => {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === id ? { ...s, name } : s
          ),
        }))
      },

      editMessage: (sessionId, messageId, content) => {
        set((state) => ({
          messages: {
            ...state.messages,
            [sessionId]: state.messages[sessionId]?.map((m) =>
              m.id === messageId ? { ...m, content } : m
            ),
          },
        }))
      },

      deleteMessage: (sessionId, messageId) => {
        set((state) => ({
          messages: {
            ...state.messages,
            [sessionId]: state.messages[sessionId]?.filter((m) => m.id !== messageId),
          },
        }))
      },

      clearSession: (sessionId) => {
        set((state) => ({
          messages: {
            ...state.messages,
            [sessionId]: [],
          },
        }))
      },

      setModel: (model) => set({ model }),
      setCustomPrompt: (prompt) => set({ customPrompt: prompt }),

      setSessionUsage: (sessionId, usage) => {
        set((state) => ({
          sessions: state.sessions.map((s) =>
            s.id === sessionId ? { ...s, usage } : s
          ),
        }))
      },

      addPromptPreset: (name, prompt) => {
        set((state) => ({
          promptPresets: [...state.promptPresets.filter(p => p.name !== name), { name, prompt }],
        }))
      },

      deletePromptPreset: (name) => {
        set((state) => ({
          promptPresets: state.promptPresets.filter(p => p.name !== name),
        }))
      },

      setLang: (lang) => set({ lang }),

      setSystemFollow: (v) => set({ systemFollow: v }),

      setApiProvider: (provider) => {
        const presets: Record<string, { baseUrl: string; model: string }> = {
          deepseek: { baseUrl: 'https://api.deepseek.com/anthropic', model: 'deepseek-v4-flash' },
          openai: { baseUrl: 'https://api.openai.com', model: 'gpt-4o' },
          anthropic: { baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-4-6' },
          custom: { baseUrl: '', model: '' },
        }
        const p = presets[provider]
        if (p && provider !== 'custom') {
          set({ apiProvider: provider, model: p.model })
          // base URL is stored in settings.json, not in zustand — the API key is read from env at Rust side
        } else {
          set({ apiProvider: provider })
        }
      },

      setBackendMode: (mode) => set({ backendMode: mode }),
      setToolsEnabled: (v) => set({ toolsEnabled: v }),
      setClaudeVersion: (v) => set({ claudeVersion: v }),

      addRecentProject: (path) => {
        set((state) => {
          const filtered = state.recentProjects.filter(p => p !== path)
          return { recentProjects: [path, ...filtered].slice(0, 10) }
        })
      },
      clearRecentProjects: () => set({ recentProjects: [] }),

      openEditingFile: (file) => {
        set((s) => {
          const exists = s.editingFiles.find(f => f.path === file.path)
          if (exists) {
            return { activeEditingFilePath: file.path }
          }
          return {
            editingFiles: [...s.editingFiles, file],
            activeEditingFilePath: file.path,
          }
        })
      },
      closeEditingFile: (path) => {
        set((s) => {
          const idx = s.editingFiles.findIndex(f => f.path === path)
          if (idx < 0) return s
          const newFiles = s.editingFiles.filter(f => f.path !== path)
          let newActive = s.activeEditingFilePath
          if (newActive === path) {
            newActive = newFiles[Math.min(idx, newFiles.length - 1)]?.path ?? null
          }
          return { editingFiles: newFiles, activeEditingFilePath: newActive }
        })
      },
      setActiveEditingFile: (path) => set({ activeEditingFilePath: path }),
      setEditorSelection: (text) => set({ editorSelection: text }),
      updateEditingFileContent: (path, content) => {
        set((s) => ({
          editingFiles: s.editingFiles.map(f =>
            f.path === path ? { ...f, content } : f
          ),
        }))
      },

      setProjectConfig: (path, config) => {
        set((s) => ({
          projectConfigs: { ...s.projectConfigs, [path]: config },
        }))
      },

      setSessionTags: (sessionId, tags) => {
        set((s) => ({
          sessions: s.sessions.map((sess) =>
            sess.id === sessionId ? { ...sess, tags } : sess
          ),
        }))
      },

      regenerateMessage: (sessionId, messageId) => {
        const state = get()
        const msgs = state.messages[sessionId] || []
        const msgIndex = msgs.findIndex(m => m.id === messageId)
        if (msgIndex < 0) return

        // Find preceding user message
        let userIdx = -1
        for (let i = msgIndex - 1; i >= 0; i--) {
          if (msgs[i].role === 'user') {
            userIdx = i
            break
          }
        }
        if (userIdx < 0) return
        const content = msgs[userIdx].content

        // Truncate everything from the user message onward
        set((s) => ({
          messages: {
            ...s.messages,
            [sessionId]: msgs.slice(0, userIdx),
          },
        }))

        // Re-send — get() reflects the updated state immediately
        get().sendUserMessage(content)
      },

      compressSession: async (sessionId) => {
        const state = get()
        const msgs = state.messages[sessionId] || []
        if (msgs.length < 6) return

        const compressCount = Math.floor(msgs.length * 0.6)
        const toCompress = msgs.slice(0, compressCount)
        const keep = msgs.slice(compressCount)

        const compressed = await compressContext(toCompress.map(m => ({ role: m.role, content: m.content })))
        if (!compressed) return

        const summaryMsg: Message = {
          id: `summary-${Date.now()}`,
          role: 'assistant',
          content: `[上下文已压缩 — 以下为早期对话摘要]\n\n${compressed}`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        }

        set((s) => ({
          messages: {
            ...s.messages,
            [sessionId]: [summaryMsg, ...keep],
          },
        }))
      },

      // Streaming helpers
      sendUserMessage: (content: string, images?: string[]) => {
        const state = get()
        let sid = state.activeSessionId
        if (!sid || !state.messages[sid]) {
          sid = get().createNewSession()
        }

        // Auto-name session based on first message
        const session = state.sessions.find((s) => s.id === sid)
        if (session && session.name === '新会话') {
          const name = content.length > 28 ? content.substring(0, 28) + '…' : content
          set((s) => ({
            sessions: s.sessions.map((sess) =>
              sess.id === sid ? { ...sess, name } : sess
            ),
          }))
        }

        const userMsgId = nextId()
        const assistantMsgId = nextId()
        const now = new Date()
        const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`

        state.addMessage(sid, { id: userMsgId, role: 'user', content, images, time: timeStr })
        state.addMessage(sid, { id: assistantMsgId, role: 'assistant', content: '', streaming: true, time: timeStr })
        streamStartTime = Date.now()
        set({ isStreaming: true })

        // Build API content blocks when images are present
        const apiContent: any = images && images.length > 0
          ? [
              { type: 'text', text: content || '(图片上传)' },
              ...images.map(src => {
                const m = src.match(/^data:(image\/\w+);base64,(.+)$/)
                return m ? { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } } : null
              }).filter(Boolean),
            ]
          : content

        // Enrich context with editor state
        let context = state.workspaceContext
        const extraCtx: string[] = []

        // Active file content always included
        const activeFile = state.editingFiles.find(f => f.path === state.activeEditingFilePath)
        if (activeFile) {
          extraCtx.push(`当前活动文件 (${activeFile.path}):\n\`\`\`\n${activeFile.content.slice(0, 3000)}\n\`\`\``)
        }

        // Selected text in editor
        if (state.editorSelection) {
          extraCtx.push(`编辑器中选中的文本:\n\`\`\`\n${state.editorSelection}\n\`\`\``)
        }

        // Recent terminal/output entries
        const recentOutput = useOutputStore.getState().entries.slice(-10)
        if (recentOutput.length > 0) {
          const lines = recentOutput.map(e => `[${e.channel}] ${e.text}`).join('\n')
          extraCtx.push(`最近的终端/输出日志:\n\`\`\`\n${lines}\n\`\`\``)
        }

        let workspaceContext = context
        if (extraCtx.length > 0) {
          const ctxStr = extraCtx.join('\n\n')
          workspaceContext = workspaceContext
            ? `${workspaceContext}\n\n${ctxStr}`
            : ctxStr
        }

        // Send full message history for context persistence
        const pc = state.projectConfigs[state.workspacePath]
        const history = (state.messages[sid] || [])
          .filter((m) => m.id !== assistantMsgId)
          .map((m) => ({ role: m.role, content: m.images && m.images.length > 0
            ? [{ type: 'text', text: m.content }, ...m.images.map(src => {
                const match = src.match(/^data:(image\/\w+);base64,(.+)$/)
                return match ? { type: 'image', source: { type: 'base64', media_type: match[1], data: match[2] } } : null
              }).filter(Boolean)]
            : m.content
          }))

        sendToClaude(sid, apiContent, history, workspaceContext, get().model, get().customPrompt, get().backendMode, state.toolsEnabled, pc?.apiKey, pc?.baseUrl).catch((err: unknown) => {
          console.error('send_message error:', err)
          const mode = get().backendMode
          const errStr = err instanceof Error ? err.message :
                         typeof err === 'string' ? err :
                         '未知错误'
          const friendlyMsg = mode === 'cli'
            ? `连接失败：${errStr || 'Claude CLI 未响应，请检查终端中 claude --version 是否可用'}`
            : `连接失败：${errStr || '请检查 API 配置和网络连接'}`
          set((s) => ({
            isStreaming: false,
            messages: {
              ...s.messages,
              [sid]: s.messages[sid].map((m) =>
                m.id === assistantMsgId
                  ? { ...m, content: friendlyMsg, streaming: false }
                  : m
              ),
            },
          }))
        })
      },

      cancelCurrentMessage: () => {
        const sid = get().activeSessionId
        if (!sid) return
        cancelClaude(sid)
        get().finalizeStream()
      },

      appendStreamChunk: (text: string) => {
        const sid = get().activeSessionId
        set((s) => ({
          messages: {
            ...s.messages,
            [sid]: s.messages[sid]?.map((m) =>
              m.streaming ? { ...m, content: m.content + text } : m
            ),
          },
        }))
      },

      finalizeStream: () => {
        const sid = get().activeSessionId
        const elapsed = streamStartTime > 0 ? (Date.now() - streamStartTime) / 1000 : 0
        streamStartTime = 0
        set((s) => ({
          isStreaming: false,
          messages: {
            ...s.messages,
            [sid]: s.messages[sid]?.map((m) =>
              m.streaming ? { ...m, streaming: false, elapsed } : m
            ),
          },
        }))
      },
    }),
    {
      name: 'claude-desktop-store',
      partialize: (state) => ({
        sessions: state.sessions,
        messages: state.messages,
        activeSessionId: state.activeSessionId,
        theme: state.theme,
        workspacePath: state.workspacePath,
        model: state.model,
        customPrompt: state.customPrompt,
        promptPresets: state.promptPresets,
        lang: state.lang,
        systemFollow: state.systemFollow,
        apiProvider: state.apiProvider,
        backendMode: state.backendMode,
        toolsEnabled: state.toolsEnabled,
        recentProjects: state.recentProjects,
        editingFiles: state.editingFiles,
        activeEditingFilePath: state.activeEditingFilePath,
        projectConfigs: state.projectConfigs,
        keybindings: state.keybindings,
        autoSave: state.autoSave,
        autoSaveDelay: state.autoSaveDelay,
        formatOnSave: state.formatOnSave,
        tabSize: state.tabSize,
        commitHistory: state.commitHistory,
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.theme) {
          document.documentElement.setAttribute('data-theme', state.theme)
        }
        if (state?.workspacePath && !state.workspaceContext) {
          // Reload workspace context after rehydration
          readWorkspaceContext(state.workspacePath).then((ctx) => {
            useStore.setState({ workspaceContext: ctx })
          })
        }
      },
    },
  ),
)
