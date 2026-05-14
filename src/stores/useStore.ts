import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { sendToClaude, cancelClaude, readWorkspaceContext } from '../lib/ipc'

export type Theme = 'ocean' | 'forest' | 'sunset' | 'purple' | 'cherry' | 'neon' | 'light' | 'sepia'

export const themeNames: Record<Theme, string> = {
  ocean: 'Ocean Blue',
  forest: 'Forest Green',
  sunset: 'Sunset Orange',
  purple: 'Royal Purple',
  cherry: 'Cherry Red',
  neon: 'Neon Cyber',
  light: 'Minimal Light',
  sepia: 'Warm Sepia',
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
}

export interface Session {
  id: string
  name: string
  preview?: string
  time: string
  active: boolean
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  files?: string[]
  streaming?: boolean
}

interface AppState {
  theme: Theme
  sessions: Session[]
  activeSessionId: string
  messages: Record<string, Message[]>
  rightTab: 'files' | 'tools' | 'info'
  isStreaming: boolean
  workspacePath: string
  workspaceContext: string

  setTheme: (theme: Theme) => void
  setActiveSession: (id: string) => void
  setRightTab: (tab: 'files' | 'tools' | 'info') => void
  setWorkspacePath: (path: string) => Promise<void>
  addMessage: (sessionId: string, message: Message) => void
  addSession: (session: Session) => void
  createNewSession: () => string

  // Streaming / IPC
  sendUserMessage: (content: string) => void
  cancelCurrentMessage: () => void
  appendStreamChunk: (text: string) => void
  finalizeStream: () => void
}

let msgCounter = 100

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

      setTheme: (theme) => {
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
      setWorkspacePath: async (path) => {
        const ctx = await readWorkspaceContext(path)
        set({ workspacePath: path, workspaceContext: ctx })
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

      // Streaming helpers
      sendUserMessage: (content: string) => {
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

        state.addMessage(sid, { id: userMsgId, role: 'user', content })
        state.addMessage(sid, { id: assistantMsgId, role: 'assistant', content: '', streaming: true })
        set({ isStreaming: true })

        // Send full message history for context persistence
        const history = (state.messages[sid] || [])
          .filter((m) => m.id !== assistantMsgId)
          .map((m) => ({ role: m.role, content: m.content }))

        sendToClaude(sid, content, history, get().workspaceContext).catch((err: unknown) => {
          console.error('send_message error:', err)
          const errMsg = err instanceof Error ? err.message :
                         typeof err === 'string' ? err :
                         '连接失败，请检查 API 配置'
          set((s) => ({
            isStreaming: false,
            messages: {
              ...s.messages,
              [sid]: s.messages[sid].map((m) =>
                m.id === assistantMsgId
                  ? { ...m, content: errMsg, streaming: false }
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
        set((s) => ({
          isStreaming: false,
          messages: {
            ...s.messages,
            [sid]: s.messages[sid]?.map((m) =>
              m.streaming ? { ...m, streaming: false } : m
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
