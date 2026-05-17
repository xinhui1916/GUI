import { useEffect, useCallback } from 'react'
import { Group, Panel, Separator } from 'react-resizable-panels'
import { useStore } from './stores/useStore'
import { useUiStore } from './stores/uiStore'
import { useOutputStore } from './stores/outputStore'
import { useCustomThemeStore } from './theme/customThemeStore'
import { onClaudeChunk, onClaudeDone, onClaudeError, onClaudeUsage, onToolExecution, checkClaudeInstalled } from './lib/ipc'
import { discoverExtensions } from './lib/extensionHost'
import { logError } from './lib/logger'
import Titlebar from './components/Titlebar'
import ActivityBar from './components/ActivityBar'
import StatusBar from './components/StatusBar'
import ChatPanel from './components/ChatPanel'
import RightPanel from './components/RightPanel'
import EditorPanel from './components/EditorPanel'
import CommandPalette from './components/CommandPalette'
import GlobalSearch from './components/GlobalSearch'
import SettingsDialog from './components/SettingsDialog'
import ToastContainer from './components/Toast'
import ShortcutsHelp from './components/ShortcutsHelp'
import ToolPermissionDialog from './components/ToolPermissionDialog'
import GoToFile from './components/GoToFile'

function GoToFileDialog() {
  const open = useUiStore((s) => s.goToFileOpen)
  const setOpen = useUiStore((s) => s.setGoToFileOpen)
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      style={{ background: 'rgba(0,0,0,0.4)' }}
      onClick={() => setOpen(false)}>
      <div className="w-full max-w-sm rounded-xl shadow-2xl overflow-hidden"
        style={{ background: 'var(--sidebar-bg)', border: '1px solid var(--border-color)' }}
        onClick={(e) => e.stopPropagation()}>
        <GoToFile onClose={() => setOpen(false)} />
      </div>
    </div>
  )
}

function App() {
  const sidebarOpen = useUiStore((s) => s.sidebarOpen)
  const zenMode = useUiStore((s) => s.zenMode)

  useEffect(() => {
    // Skip if a custom theme is active (already restored via onRehydrateStorage)
    if (useCustomThemeStore.getState().activeCustomThemeId) return
    const saved = localStorage.getItem('claude-desktop-theme')
    if (saved) {
      document.documentElement.setAttribute('data-theme', saved)
      useStore.getState().setTheme(saved as any)
    }
  }, [])

  // Window state memory (Tauri only)
  useEffect(() => {
    const ti = (window as any).__TAURI_INTERNALS__
    if (!ti) return

    // Restore window position
    try {
      const saved = localStorage.getItem('claude-desktop-window')
      if (saved) {
        const { x, y, width, height } = JSON.parse(saved)
        // Use invoke to call Tauri window API
        const w = (window as any).__TAURI_WINDOW__ || (window as any).__TAURI_INTERNALS__
        if (w) {
          ti.invoke('plugin:window|set_size', { width: Math.round(width), height: Math.round(height) })
          ti.invoke('plugin:window|set_position', { x: Math.round(x), y: Math.round(y) })
        }
      }
    } catch (err) { logError('App', 'restore window position failed', err) }

    // Save on beforeunload
    const save = () => {
      ti.invoke('plugin:window|get_size').then((size: any) => {
        ti.invoke('plugin:window|get_position').then((pos: any) => {
          localStorage.setItem('claude-desktop-window', JSON.stringify({
            x: pos.x, y: pos.y,
            width: size.width, height: size.height,
          }))
        })
      })
    }
    window.addEventListener('beforeunload', save)
    return () => window.removeEventListener('beforeunload', save)
  }, [])

  // System theme auto-follow
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => {
      const sf = useStore.getState().systemFollow
      if (!sf) return
      const theme = mq.matches ? 'ocean' : 'light'
      useStore.getState().setTheme(theme)
    }
    mq.addEventListener('change', handler)
    // Apply on mount if enabled
    handler()
    return () => mq.removeEventListener('change', handler)
  }, [])

  // Global keyboard shortcuts (dynamic from store)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Build the key combo string from event
      const parts: string[] = []
      if (e.ctrlKey || e.metaKey) parts.push('ctrl')
      if (e.shiftKey) parts.push('shift')
      if (e.altKey) parts.push('alt')

      const key = e.key.toLowerCase()
      if (['control', 'shift', 'alt', 'meta'].includes(key)) return
      const mappedKey = key === ',' ? ',' : key
      parts.push(mappedKey)
      const combo = parts.join('+')

      const kb = useStore.getState().keybindings
      for (const [action, binding] of Object.entries(kb)) {
        if (binding === combo) {
          e.preventDefault()
          switch (action) {
            case 'toggleSidebar': useUiStore.getState().toggleSidebar(); break
            case 'newSession': useStore.getState().createNewSession(); break
            case 'openSettings': useUiStore.getState().openSettings(); break
            case 'openCommandPalette': useUiStore.getState().setCommandPaletteOpen(true); break
            case 'toggleZenMode': useUiStore.getState().toggleZenMode(); break
            case 'goToFile': useUiStore.getState().setGoToFileOpen(true); break
            case 'formatCode':
              window.dispatchEvent(new CustomEvent('claude-format-code'))
              break
          }
          return
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Log forwarding: bridge logger events to output panel
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (!detail) return
      const channel = detail.level === 'error' ? 'system' : 'system'
      useOutputStore.getState().appendOutput(channel, `[${detail.source}] ${detail.message}`)
    }
    window.addEventListener('claude-log', handler)
    return () => window.removeEventListener('claude-log', handler)
  }, [])

  // Notification sound
  const playNotification = useCallback(() => {
    try {
      const ctx = new AudioContext()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = 880
      osc.type = 'sine'
      gain.gain.setValueAtTime(0.08, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.3)
      // Second chime
      const osc2 = ctx.createOscillator()
      const gain2 = ctx.createGain()
      osc2.connect(gain2)
      gain2.connect(ctx.destination)
      osc2.frequency.value = 1108
      osc2.type = 'sine'
      gain2.gain.setValueAtTime(0.06, ctx.currentTime + 0.15)
      gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
      osc2.start(ctx.currentTime + 0.15)
      osc2.stop(ctx.currentTime + 0.4)
    } catch (err) { logError('App', 'play notification sound failed', err) }
  }, [])

  // Tauri IPC event listeners
  useEffect(() => {
    const unlisteners: (() => void)[] = []
    let cancelled = false

    async function setup() {
      const ti = (window as any).__TAURI_INTERNALS__

      // Check Claude CLI version on startup
      const version = await checkClaudeInstalled()
      if (version) {
        useStore.getState().setClaudeVersion(version)
      }

      const u1 = await onClaudeChunk((text) => {
        useStore.getState().appendStreamChunk(text)
      })
      if (cancelled) { u1(); return }
      unlisteners.push(u1)

      const u2 = await onClaudeDone(() => {
        useStore.getState().finalizeStream()
        playNotification()
      })
      if (cancelled) { u2(); return }
      unlisteners.push(u2)

      const u3 = await onClaudeError((error) => {
        console.error('Claude error:', error)
        // Replace streaming message with error text
        const sid = useStore.getState().activeSessionId
        const mode = useStore.getState().backendMode
        const friendlyMsg = mode === 'cli'
          ? `连接失败: ${error || 'Claude CLI 未响应，请检查是否已安装 (npm install -g @anthropic-ai/claude-code)'}`
          : `连接失败: ${error || '请检查 API 配置和网络连接'}`
        useStore.getState().finalizeStream()
        if (sid && friendlyMsg) {
          useStore.setState((s) => ({
            messages: {
              ...s.messages,
              [sid]: s.messages[sid]?.map((m) =>
                m.streaming ? { ...m, content: friendlyMsg, streaming: false } : m
              ),
            },
          }))
        }
      })
      if (cancelled) { u3(); return }
      unlisteners.push(u3)

      const u4 = await onClaudeUsage((sessionId, usage) => {
        useStore.getState().setSessionUsage(sessionId, usage)
      })
      if (cancelled) { u4(); return }
      unlisteners.push(u4)

      const u5 = await onToolExecution((sessionId, toolName, toolInput, output) => {
        const text = `[${toolName}] ${JSON.stringify(toolInput)}\n${output.slice(0, 500)}${output.length > 500 ? '...' : ''}`
        useOutputStore.getState().appendOutput('tools', text)
      })
      if (cancelled) { u5(); return }
      unlisteners.push(u5)

      // Tool permission events (Tauri only)
      if (ti) {
        try {
          const tauriEvent = await import('@tauri-apps/api/event')
          const u5 = await tauriEvent.listen('tool-permission-request', (e: any) => {
            const p = e.payload
            if (p.session_id && p.tool_name && (window as any).__onToolPermissionRequest) {
              ;(window as any).__onToolPermissionRequest(p.session_id, p.tool_name, p.detail || '', p.input)
            }
          })
          if (cancelled) { u5(); return }
          unlisteners.push(u5)

          const u6 = await tauriEvent.listen('tool-permission-done', () => {
            if ((window as any).__onToolPermissionDone) {
              ;(window as any).__onToolPermissionDone()
            }
          })
          if (cancelled) { u6(); return }
          unlisteners.push(u6)
        } catch (err) { logError('App', 'tauri event setup failed', err) }
      }
    }
    setup()

    return () => {
      cancelled = true
      unlisteners.forEach(fn => fn())
    }
  }, [])

  // Initialize extension system
  useEffect(() => {
    discoverExtensions()
  }, [])

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{
      backgroundColor: 'var(--bg-primary)',
      backgroundImage: 'var(--app-bg-image, none)',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundAttachment: 'fixed',
      backdropFilter: 'var(--app-bg-blur, none)',
      position: 'relative',
    }}>
      <Titlebar />
      {/* Decorative glow border for custom themes */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          border: '2px solid var(--card-glow, transparent)',
          pointerEvents: 'none',
          zIndex: 9999,
          borderRadius: '4px',
          animation: 'holyLight 3s ease-in-out infinite',
        }}
      />
      <div className="flex flex-1 overflow-hidden">
        {!zenMode && <ActivityBar />}
        {!zenMode && (
          <div
            className="overflow-hidden transition-all duration-200 ease-in-out"
            style={{ width: sidebarOpen ? 224 : 0, minWidth: sidebarOpen ? 224 : 0, opacity: sidebarOpen ? 1 : 0 }}
          >
            <RightPanel />
          </div>
        )}
        <Group orientation="horizontal" className="flex-1 overflow-hidden">
          <Panel defaultSize={zenMode ? 100 : 50} minSize={25}>
            <ChatPanel />
          </Panel>
          {!zenMode && (
            <>
              <Separator className="group w-[5px] flex items-center justify-center cursor-col-resize" style={{ background: 'transparent' }}>
                <div className="w-[2px] h-full rounded-full transition-colors group-hover:bg-[var(--border-color)]" style={{ background: 'transparent' }} />
              </Separator>
              <Panel defaultSize={50} minSize={20} maxSize={70}>
                <EditorPanel />
              </Panel>
            </>
          )}
        </Group>
      </div>
      {!zenMode && <StatusBar />}
      <CommandPalette />
      <GlobalSearch />
      <ShortcutsHelp />
      <SettingsDialog />
      <ToolPermissionDialog />
      <GoToFileDialog />
      <ToastContainer />
    </div>
  )
}

export default App
