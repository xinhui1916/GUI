import { create } from 'zustand'

// ── Types ──────────────────────────────────────────────────────────

export interface ExtensionCommand {
  command: string
  title: string
  category?: string
  icon?: string
}

export interface ExtensionContributes {
  commands?: ExtensionCommand[]
  views?: { [panelId: string]: { id: string; name: string }[] }
  keybindings?: { key: string; command: string; when?: string }[]
}

export interface ExtensionManifest {
  name: string
  displayName: string
  version: string
  description?: string
  author?: string
  main: string
  contributes?: ExtensionContributes
  activationEvents?: string[]
  enabled?: boolean
  path: string
}

export interface ExtensionExports {
  activate?: (ctx: ExtensionContext) => void | Promise<void>
  deactivate?: () => void
}

export interface ExtensionContext {
  extensionPath: string
  subscriptions: { dispose: () => void }[]
  commands: {
    registerCommand: (id: string, handler: (...args: any[]) => any) => void
  }
  workspace: {
    readFile: (path: string) => Promise<string>
    writeFile: (path: string, content: string) => Promise<void>
  }
  window: {
    showInformationMessage: (msg: string) => void
    showErrorMessage: (msg: string) => void
  }
}

interface ExtensionState {
  extensions: ExtensionManifest[]
  activeExtensions: Set<string>
  commandHandlers: Map<string, (...args: any[]) => any>
  extensionOutputs: Map<string, string[]>
  extensionViews: Map<string, { id: string; name: string }[]>

  // Actions
  registerExtension: (manifest: ExtensionManifest) => void
  unregisterExtension: (name: string) => void
  setExtensionEnabled: (name: string, enabled: boolean) => void
  registerCommand: (command: string, handler: (...args: any[]) => any) => void
  executeCommand: (command: string, ...args: any[]) => Promise<any>
  addExtensionOutput: (name: string, text: string) => void
  clearExtensionOutput: (name: string) => void
  setExtensionViews: (panelId: string, views: { id: string; name: string }[]) => void
}

export const useExtensionStore = create<ExtensionState>()((set, get) => ({
  extensions: [],
  activeExtensions: new Set(),
  commandHandlers: new Map(),
  extensionOutputs: new Map(),
  extensionViews: new Map(),

  registerExtension: (manifest) => {
    set((s) => {
      const existing = s.extensions.findIndex(e => e.name === manifest.name)
      if (existing >= 0) {
        const updated = [...s.extensions]
        updated[existing] = manifest
        return { extensions: updated }
      }
      return { extensions: [...s.extensions, manifest] }
    })
  },

  unregisterExtension: (name) => {
    set((s) => ({
      extensions: s.extensions.filter(e => e.name !== name),
      activeExtensions: new Set([...s.activeExtensions].filter(n => n !== name)),
    }))
  },

  setExtensionEnabled: (name, enabled) => {
    set((s) => {
      const next = new Set(s.activeExtensions)
      if (enabled) next.add(name)
      else next.delete(name)
      return { activeExtensions: next }
    })
  },

  registerCommand: (command, handler) => {
    get().commandHandlers.set(command, handler)
  },

  executeCommand: async (command, ...args) => {
    const handler = get().commandHandlers.get(command)
    if (handler) return handler(...args)
    console.warn(`Extension command not found: ${command}`)
  },

  addExtensionOutput: (name, text) => {
    set((s) => {
      const existing = s.extensionOutputs.get(name) || []
      return { extensionOutputs: new Map(s.extensionOutputs).set(name, [...existing, text]) }
    })
  },

  clearExtensionOutput: (name) => {
    set((s) => {
      const next = new Map(s.extensionOutputs)
      next.delete(name)
      return { extensionOutputs: next }
    })
  },

  setExtensionViews: (panelId, views) => {
    set((s) => {
      const next = new Map(s.extensionViews)
      next.set(panelId, views)
      return { extensionViews: next }
    })
  },
}))
