import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface StackFrame {
  id: number
  name: string
  line: number
  column: number
  source?: { path: string }
}

export interface Variable {
  name: string
  value: string
  type?: string
  variablesReference: number
  indexedVariables?: number
  namedVariables?: number
  children?: Variable[]
}

export interface Breakpoint {
  id: string
  file: string
  line: number
  enabled: boolean
  condition?: string
  hitCondition?: string
}

export interface WatchExpr {
  id: string
  expression: string
  value?: string
}

export interface LaunchConfig {
  name: string
  type: string
  request: 'launch' | 'attach'
  program?: string
  args?: string
  cwd?: string
  runtimeExecutable?: string
  stopOnEntry?: boolean
  [key: string]: any
}

interface DebugState {
  // Session
  sessionId: string | null
  isRunning: boolean
  stoppedReason: string
  debugPid: number | null

  // Debug info
  threads: { id: number; name: string }[]
  activeThreadId: number | null
  stackFrames: StackFrame[]
  activeStackFrame: number | null
  variables: Record<string, Variable[]>
  expandedVariables: Set<string>

  // Breakpoints & watch
  breakpoints: Breakpoint[]
  watchExpressions: WatchExpr[]
  launchConfigs: LaunchConfig[]

  // Console
  consoleOutput: { text: string; category: string }[]

  // Actions
  setSessionId: (id: string | null) => void
  setRunning: (running: boolean) => void
  setStoppedReason: (reason: string) => void
  setThreads: (threads: { id: number; name: string }[]) => void
  setActiveThread: (id: number | null) => void
  setStackFrames: (frames: StackFrame[]) => void
  setActiveStackFrame: (id: number | null) => void
  setVariables: (key: string, vars: Variable[]) => void
  toggleVariable: (key: string) => void
  addBreakpoint: (bp: Breakpoint) => void
  removeBreakpoint: (id: string) => void
  updateBreakpoint: (id: string, bp: Partial<Breakpoint>) => void
  setBreakpoints: (bps: Breakpoint[]) => void
  addWatch: (expr: string) => void
  removeWatch: (id: string) => void
  updateWatchValue: (id: string, value: string) => void
  addConsoleOutput: (text: string, category: string) => void
  clearConsole: () => void
  addLaunchConfig: (config: LaunchConfig) => void
  removeLaunchConfig: (name: string) => void
  reset: () => void
}

export const useDebugStore = create<DebugState>()(
  persist(
    (set) => ({
      sessionId: null,
      isRunning: false,
      stoppedReason: '',
      debugPid: null,
      threads: [],
      activeThreadId: null,
      stackFrames: [],
      activeStackFrame: null,
      variables: {},
      expandedVariables: new Set(),
      breakpoints: [],
      watchExpressions: [],
      launchConfigs: [],
      consoleOutput: [],

      setSessionId: (id) => set({ sessionId: id }),
      setRunning: (running) => set({ isRunning: running }),
      setStoppedReason: (reason) => set({ stoppedReason: reason }),
      setThreads: (threads) => set({ threads }),
      setActiveThread: (id) => set({ activeThreadId: id }),
      setStackFrames: (frames) => set({ stackFrames: frames }),
      setActiveStackFrame: (id) => set({ activeStackFrame: id }),
      setVariables: (key, vars) => set((s) => ({ variables: { ...s.variables, [key]: vars } })),
      toggleVariable: (key) => set((s) => {
        const next = new Set(s.expandedVariables)
        if (next.has(key)) { next.delete(key) } else { next.add(key) }
        return { expandedVariables: next }
      }),
      addBreakpoint: (bp) => set((s) => ({ breakpoints: [...s.breakpoints, bp] })),
      removeBreakpoint: (id) => set((s) => ({ breakpoints: s.breakpoints.filter(b => b.id !== id) })),
      updateBreakpoint: (id, bp) => set((s) => ({
        breakpoints: s.breakpoints.map(b => b.id === id ? { ...b, ...bp } : b),
      })),
      setBreakpoints: (bps) => set({ breakpoints: bps }),
      addWatch: (expr) => set((s) => ({
        watchExpressions: [...s.watchExpressions, { id: `w${Date.now()}`, expression: expr }],
      })),
      removeWatch: (id) => set((s) => ({
        watchExpressions: s.watchExpressions.filter(w => w.id !== id),
      })),
      updateWatchValue: (id, value) => set((s) => ({
        watchExpressions: s.watchExpressions.map(w => w.id === id ? { ...w, value } : w),
      })),
      addConsoleOutput: (text, category) => set((s) => ({
        consoleOutput: [...s.consoleOutput, { text, category }],
      })),
      clearConsole: () => set({ consoleOutput: [] }),
      addLaunchConfig: (config) => set((s) => ({
        launchConfigs: [...s.launchConfigs, config],
      })),
      removeLaunchConfig: (name) => set((s) => ({
        launchConfigs: s.launchConfigs.filter(c => c.name !== name),
      })),
      reset: () => set({
        sessionId: null,
        isRunning: false,
        stoppedReason: '',
        threads: [],
        activeThreadId: null,
        stackFrames: [],
        activeStackFrame: null,
        variables: {},
        expandedVariables: new Set(),
        consoleOutput: [],
      }),
    }),
    {
      name: 'claude-desktop-debug',
      partialize: (s) => ({ breakpoints: s.breakpoints, watchExpressions: s.watchExpressions, launchConfigs: s.launchConfigs }),
    }
  )
)
