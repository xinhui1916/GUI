/**
 * Extension Host — manages extension lifecycle:
 *  - Discover extensions from disk
 *  - Load/sandbox each extension
 *  - Activate/deactivate on events
 */

import { createSandbox, type SandboxAPI } from './extensionSandbox'
import { useExtensionStore, type ExtensionManifest } from '../stores/extensionStore'
import { readFile, writeFile } from './ipc'

// Active sandbox instances
const sandboxes = new Map<string, ReturnType<typeof createSandbox>>()

async function discoverExtensionsDir(): Promise<string> {
  const ti = (window as any).__TAURI_INTERNALS__
  const base = ti
    ? (await import('@tauri-apps/api/path')).appDataDir()
    : '~/.claude-desktop'
  const dataDir = typeof base === 'string' ? base : await base
  return dataDir + '/extensions'
}

/**
 * Load and activate a single extension.
 */
export async function loadExtension(manifest: ExtensionManifest): Promise<void> {
  const store = useExtensionStore.getState()

  // Mark as registered
  store.registerExtension(manifest)
  if (manifest.enabled === false) return

  // Read extension code
  let code: string
  try {
    code = await readFile(manifest.path + '/' + manifest.main)
  } catch (e) {
    console.warn(`[extension-host] Failed to read ${manifest.name}:`, e)
    store.addExtensionOutput(manifest.name, `Failed to load: ${e}`)
    return
  }

  // Create sandbox API
  const api: SandboxAPI = {
    readFile: async (path) => {
      try {
        return await readFile(path)
      } catch { return '' }
    },
    writeFile: async (path, content) => {
      try {
        await writeFile(path, content)
      } catch {}
    },
    showMessage: (msg) => {
      store.addExtensionOutput(manifest.name, `[info] ${msg}`)
    },
    showError: (msg) => {
      store.addExtensionOutput(manifest.name, `[error] ${msg}`)
    },
    executeCommand: async (id, ...args) => {
      return store.executeCommand(id, ...args)
    },
    log: (text) => {
      store.addExtensionOutput(manifest.name, text)
    },
  }

  // Activate sandbox
  const sandbox = createSandbox(code, api)

  sandbox.postRequest({
    type: 'activate',
    code,
    extensionPath: manifest.path,
  })

  sandboxes.set(manifest.name, sandbox)

  // Add contributed commands to the store
  store.setExtensionEnabled(manifest.name, true)
}

/**
 * Discover extensions from the extensions directory.
 * In browser/dev mode, this loads example/sample extensions.
 */
export async function discoverExtensions(): Promise<void> {
  // In browser mode, try loading from localStorage
  const stored = localStorage.getItem('claude-extensions')
  if (stored) {
    try {
      const exts: ExtensionManifest[] = JSON.parse(stored)
      for (const ext of exts) {
        await loadExtension(ext)
      }
      return
    } catch {}
  }

  // In Tauri mode, scan the extensions directory
  const ti = (window as any).__TAURI_INTERNALS__
  if (!ti) return

  try {
    const extDir = await discoverExtensionsDir()
    const listFiles = await import('./ipc').then(m => m.listFiles)
    const entries = await listFiles(extDir).catch(() => [])

    for (const entry of entries) {
      if (entry.is_dir) {
        try {
          const manifestRaw = await readFile(entry.path + '/manifest.json')
          const manifest: ExtensionManifest = {
            ...JSON.parse(manifestRaw),
            path: entry.path,
          }
          await loadExtension(manifest)
        } catch (e) {
          console.warn(`[extension-host] Failed to load extension at ${entry.path}:`, e)
        }
      }
    }
  } catch (e) {
    console.warn('[extension-host] No extensions directory found')
  }
}

/**
 * Load a sample extension for testing.
 * This lets us verify the extension system works without needing a real extension on disk.
 */
export function loadSampleExtension(): void {
  const store = useExtensionStore.getState()

  const manifest: ExtensionManifest = {
    name: 'sample-commands',
    displayName: '示例命令',
    version: '1.0.0',
    description: '一组 Claude Code Desktop 示例扩展命令',
    main: 'extension.js',
    path: '__builtin__',
    enabled: true,
    contributes: {
      commands: [
        { command: 'sample.hello', title: 'Hello World', category: '示例' },
        { command: 'sample.echo', title: 'Echo 消息', category: '示例' },
        { command: 'sample.time', title: '显示当前时间', category: '示例' },
      ],
    },
  }

  store.registerExtension(manifest)
  store.setExtensionEnabled(manifest.name, true)

  // Register command handlers
  store.registerCommand('sample.hello', () => {
    store.addExtensionOutput('sample-commands', '你好！示例扩展运行正常 🎉')
    return 'Hello from sample extension!'
  })

  store.registerCommand('sample.echo', (...args) => {
    store.addExtensionOutput('sample-commands', `Echo: ${args.join(' ')}`)
    return args.join(' ')
  })

  store.registerCommand('sample.time', () => {
    const now = new Date().toLocaleString('zh-CN')
    store.addExtensionOutput('sample-commands', `当前时间: ${now}`)
    return now
  })

  store.addExtensionOutput('sample-commands', '内置示例扩展已加载')
  store.addExtensionOutput('sample-commands', '通过命令面板 (⌘K) 尝试：Hello World, Echo, 显示时间')
}

/**
 * Deactivate and unload an extension.
 */
export function unloadExtension(name: string): void {
  const sandbox = sandboxes.get(name)
  if (sandbox) {
    sandbox.postRequest({ type: 'deactivate' })
    sandbox.terminate()
    sandboxes.delete(name)
  }
  useExtensionStore.getState().setExtensionEnabled(name, false)
}

/**
 * Execute a command in a specific extension's sandbox.
 */
export async function executeExtensionCommand(name: string, command: string, ...args: any[]): Promise<any> {
  const sandbox = sandboxes.get(name)
  if (!sandbox) {
    // Fall back to store handler
    return useExtensionStore.getState().executeCommand(command, ...args)
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Command timeout')), 10000)

    sandbox.postRequest({
      type: 'execute-command',
      command,
      args,
    })

    // We can't easily get the result back from the sandbox this way.
    // For simplicity, use the store-based command handlers.
    clearTimeout(timeout)
    useExtensionStore.getState().executeCommand(command, ...args).then(resolve).catch(reject)
  })
}

/**
 * Get all registered commands across all active extensions.
 */
export function getAllExtensionCommands(): { id: string; title: string; category?: string }[] {
  const store = useExtensionStore.getState()
  const commands: { id: string; title: string; category?: string }[] = []

  for (const ext of store.extensions) {
    if (!store.activeExtensions.has(ext.name)) continue
    if (ext.contributes?.commands) {
      for (const cmd of ext.contributes.commands) {
        commands.push({ id: cmd.command, title: cmd.title, category: cmd.category })
      }
    }
  }

  return commands
}
