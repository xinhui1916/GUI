import { useEffect, useRef, useState, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { SearchAddon } from '@xterm/addon-search'
import '@xterm/xterm/css/xterm.css'
import { Plus, X, ChevronDown, Columns } from 'lucide-react'
import { spawnTerminal, writeStdin, killTerminal, onTerminalOutput } from '../lib/ipc'
import { logError } from '../lib/logger'

const SHELLS = [
  { label: 'cmd.exe', value: 'cmd.exe' },
  { label: 'PowerShell', value: 'powershell.exe' },
  { label: 'PowerShell 7', value: 'pwsh.exe' },
  { label: 'Git Bash', value: 'bash.exe' },
]

const TERM_OPTS = {
  cursorBlink: true,
  cursorStyle: 'bar' as const,
  fontSize: 13,
  fontFamily: "'JetBrains Mono', 'Cascadia Code', 'Fira Code', monospace",
  theme: {
    background: '#0d1117',
    foreground: '#e1e4e8',
    cursor: '#e1e4e8',
    selectionBackground: '#3b82f644',
    black: '#484f58', red: '#ff7b72', green: '#3fb950', yellow: '#d29922',
    blue: '#58a6ff', magenta: '#bc8cff', cyan: '#39c5cf', white: '#e1e4e8',
    brightBlack: '#6e7681', brightRed: '#ffa198', brightGreen: '#56d364',
    brightYellow: '#e3b341', brightBlue: '#79c0ff', brightMagenta: '#d2a8ff',
    brightCyan: '#56d4dd', brightWhite: '#f0f6fc',
  },
  allowProposedApi: true,
}

let globalTabCounter = 0

interface TermInstance {
  term: Terminal
  fit: FitAddon
  procId: string | null
  cleanups: (() => void)[]
}

// ── Self-contained terminal group ───────────────────────────────────

function TerminalGroup() {
  const defaultShell = localStorage.getItem('claude-terminal-shell') || 'cmd.exe'
  const [tabs, setTabs] = useState(() => [
    {
      id: `term-${++globalTabCounter}`,
      shell: defaultShell,
      label: `1: ${SHELLS.find(s => s.value === defaultShell)?.label || defaultShell}`,
    },
  ])
  const [activeTabId, setActiveTabId] = useState(tabs[0].id)
  const [shellOpen, setShellOpen] = useState(false)
  const activeIdRef = useRef(activeTabId)
  activeIdRef.current = activeTabId

  const instances = useRef(new Map<string, TermInstance>())
  const mainRef = useRef<HTMLDivElement>(null)

  // Ensure activeTabId stays valid after tab removal
  useEffect(() => {
    if (tabs.length > 0 && !tabs.some(t => t.id === activeTabId)) {
      setActiveTabId(tabs[0].id)
    }
  }, [tabs, activeTabId])

  // Initialize / focus the active terminal
  useEffect(() => {
    const el = mainRef.current?.querySelector(`[data-term-id="${activeTabId}"]`) as HTMLElement | null
    if (!el) return

    let inst = instances.current.get(activeTabId)
    if (!inst) {
      const term = new Terminal(TERM_OPTS)
      const fit = new FitAddon()
      term.loadAddon(fit)
      term.loadAddon(new WebLinksAddon())
      term.loadAddon(new SearchAddon())
      inst = { term, fit, procId: null, cleanups: [] }
      instances.current.set(activeTabId, inst)

      term.open(el)
      const tab = tabs.find(t => t.id === activeTabId)
      term.write(`\r\n--- ${tab?.shell || 'cmd.exe'} ---\r\n`)

      spawnTerminal(undefined, tab?.shell || 'cmd.exe')
        .then((id) => {
          if (!inst) return
          inst.procId = id
          onTerminalOutput((pid, data) => {
            if (pid === id) term.write(data.replace(/\n/g, '\r\n'))
          }).then(u => inst?.cleanups.push(u))
          term.onData((data) => writeStdin(id, data).catch((err) => logError('TerminalPanel', 'write stdin failed', err)))
        })
        .catch((err) => {
          term.write(`\r\n\x1b[31m${err.message || 'Start failed'}\x1b[0m\r\n`)
        })

      requestAnimationFrame(() => {
        try { fit.fit() } catch (err) { logError('TerminalPanel', 'fit terminal failed', err) }
        try { term.focus() } catch (err) { logError('TerminalPanel', 'focus terminal failed', err) }
      })
    } else {
      requestAnimationFrame(() => {
        try { inst?.fit.fit() } catch (err) { logError('TerminalPanel', 'fit terminal failed', err) }
        try { inst?.term.focus() } catch (err) { logError('TerminalPanel', 'focus terminal failed', err) }
      })
    }
  }, [activeTabId, tabs])

  // Window resize → fit active terminal
  useEffect(() => {
    const onResize = () => {
      const t = instances.current.get(activeIdRef.current)
      try { t?.fit.fit() } catch (err) { logError('TerminalPanel', 'resize fit terminal failed', err) }
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // ResizeObserver → fit when container changes size
  useEffect(() => {
    if (!mainRef.current) return
    const obs = new ResizeObserver(() => {
      const t = instances.current.get(activeIdRef.current)
      try { t?.fit.fit() } catch (err) { logError('TerminalPanel', 'observer fit terminal failed', err) }
    })
    obs.observe(mainRef.current)
    return () => obs.disconnect()
  }, [])

  // Cleanup all on unmount
  useEffect(() => {
    return () => {
      instances.current.forEach((inst) => {
        if (inst.procId) killTerminal(inst.procId).catch((err) => logError('TerminalPanel', 'kill terminal on unmount failed', err))
        inst.cleanups.forEach(fn => fn())
        inst.term.dispose()
      })
      instances.current.clear()
    }
  }, [])

  const addTab = useCallback((shell?: string) => {
    const s = shell || localStorage.getItem('claude-terminal-shell') || 'cmd.exe'
    localStorage.setItem('claude-terminal-shell', s)
    const label = SHELLS.find(x => x.value === s)?.label || s
    const id = `term-${++globalTabCounter}`
    setTabs(prev => [...prev, { id, shell: s, label: `${prev.length + 1}: ${label}` }])
    setActiveTabId(id)
  }, [])

  const closeTab = useCallback((id: string) => {
    setTabs(prev => {
      if (prev.length <= 1) return prev
      return prev.filter(t => t.id !== id)
    })
    const inst = instances.current.get(id)
    if (inst) {
      if (inst.procId) killTerminal(inst.procId).catch((err) => logError('TerminalPanel', 'kill terminal on close failed', err))
      inst.cleanups.forEach(fn => fn())
      inst.term.dispose()
      instances.current.delete(id)
    }
  }, [])

  const handleShellSelect = useCallback((shell: string) => {
    setShellOpen(false)
    addTab(shell)
  }, [addTab])

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Tab bar */}
      <div
        className="flex items-center px-1 gap-0 shrink-0"
        style={{
          borderBottom: '1px solid var(--border-color)',
          background: 'var(--bg-elevated)',
          minHeight: 32,
        }}
      >
        <div className="flex items-center flex-1 overflow-x-auto no-scrollbar">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              onClick={() => setActiveTabId(tab.id)}
              className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] cursor-pointer shrink-0 select-none"
              style={{
                borderBottom: tab.id === activeTabId ? '2px solid var(--accent)' : '2px solid transparent',
                color: tab.id === activeTabId ? 'var(--text-primary)' : 'var(--text-muted)',
                background: tab.id === activeTabId ? 'var(--accent-bg)' : 'transparent',
              }}
            >
              <span className="truncate max-w-[120px]">{tab.label}</span>
              {tabs.length > 1 && (
                <button
                  onClick={(e) => { e.stopPropagation(); closeTab(tab.id) }}
                  className="p-0.5 rounded hover:opacity-70 cursor-pointer ml-0.5"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <X size={10} />
                </button>
              )}
            </div>
          ))}
        </div>

        <button
          onClick={() => addTab()}
          className="p-1 rounded cursor-pointer hover:opacity-70 shrink-0 ml-1"
          style={{ color: 'var(--text-muted)' }}
          title="新建终端"
        >
          <Plus size={13} />
        </button>

        <div className="relative shrink-0 ml-0.5">
          <button
            onClick={() => setShellOpen(o => !o)}
            className="p-1 rounded cursor-pointer hover:opacity-70"
            style={{ color: 'var(--text-muted)' }}
            title="选择 Shell 新建终端"
          >
            <ChevronDown size={11} />
          </button>
          {shellOpen && (
            <div
              className="absolute right-0 top-full z-20 mt-0.5 rounded-lg shadow-xl overflow-hidden"
              style={{ background: 'var(--sidebar-bg)', border: '1px solid var(--border-color)' }}
            >
              {SHELLS.map((s) => (
                <button
                  key={s.value}
                  onClick={() => handleShellSelect(s.value)}
                  className="block w-full text-left px-3 py-1.5 text-[11px] cursor-pointer hover:opacity-80 whitespace-nowrap"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Terminal containers */}
      <div
        ref={mainRef}
        className="flex-1 relative overflow-hidden"
        style={{ background: '#0d1117' }}
      >
        {tabs.map((tab) => (
          <div
            key={tab.id}
            data-term-id={tab.id}
            className="absolute inset-0"
            style={{ display: tab.id === activeTabId ? 'block' : 'none' }}
          />
        ))}
      </div>
    </div>
  )
}

// ── Main TerminalPanel ──────────────────────────────────────────────

export default function TerminalPanel() {
  const [splitMode, setSplitMode] = useState(false)

  return (
    <div className="flex flex-col h-full">
      {/* Global toolbar (only split toggle) */}
      <div
        className="flex items-center justify-end px-2 py-0.5 shrink-0"
        style={{
          borderBottom: '1px solid var(--border-color)',
          background: 'var(--bg-elevated)',
          minHeight: 24,
        }}
      >
        <button
          onClick={() => setSplitMode(!splitMode)}
          className="p-1 rounded cursor-pointer hover:opacity-70"
          style={{ color: splitMode ? 'var(--accent)' : 'var(--text-muted)' }}
          title={splitMode ? '关闭分屏' : '分屏'}
        >
          <Columns size={13} />
        </button>
      </div>

      {splitMode ? (
        <div className="flex flex-row flex-1 overflow-hidden">
          <div className="flex-1 flex flex-col overflow-hidden" style={{ borderRight: '1px solid var(--border-color)' }}>
            <TerminalGroup />
          </div>
          <div className="flex-1 flex flex-col overflow-hidden">
            <TerminalGroup />
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">
          <TerminalGroup />
        </div>
      )}
    </div>
  )
}
