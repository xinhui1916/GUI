import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import Fuse from 'fuse.js'
import { useStore, type Theme, themeNames } from '../stores/useStore'
import { useUiStore } from '../stores/uiStore'

interface Command {
  id: string
  label: string
  description: string
  category: string
  action: () => void
}

export default function CommandPalette() {
  const open = useUiStore((s) => s.commandPaletteOpen)
  const setOpen = useUiStore((s) => s.setCommandPaletteOpen)
  const [query, setQuery] = useState('')
  const [selectedIdx, setSelectedIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const setTheme = useStore((s) => s.setTheme)
  const createNewSession = useStore((s) => s.createNewSession)
  const sessions = useStore((s) => s.sessions)
  const setActiveSession = useStore((s) => s.setActiveSession)
  const setRightTab = useStore((s) => s.setRightTab)
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)
  const openSettings = useUiStore((s) => s.openSettings)
  const activeSessionId = useStore((s) => s.activeSessionId)

  const commands: Command[] = useMemo(() => [
    { id: 'new-session', label: '新建会话', description: '创建一个新的对话', category: '会话', action: () => { createNewSession() } },
    { id: 'toggle-sidebar', label: '切换侧边栏', description: '显示/隐藏左侧会话列表', category: '界面', action: () => { toggleSidebar() } },
    { id: 'open-files', label: '打开文件浏览器', description: '打开右侧文件面板', category: '界面', action: () => { setRightTab('files') } },
    { id: 'open-tools', label: '查看工具列表', description: '查看可用工具', category: '界面', action: () => { setRightTab('tools') } },
    { id: 'open-info', label: '查看会话信息', description: '查看模型、消息数、工作区', category: '界面', action: () => { setRightTab('info') } },
    { id: 'open-settings', label: '打开设置', description: 'API 配置、主题、关于', category: '界面', action: () => { openSettings() } },
    ...(['ocean', 'forest', 'sunset', 'purple', 'cherry', 'neon', 'light', 'sepia'] as Theme[]).map((t) => ({
      id: `theme-${t}`,
      label: `主题: ${themeNames[t]}`,
      description: '切换颜色主题',
      category: '主题',
      action: () => { setTheme(t) },
    })),
    ...sessions.filter(s => s.id !== activeSessionId).slice(0, 10).map((s) => ({
      id: `session-${s.id}`,
      label: `切换会话: ${s.name}`,
      description: s.preview || s.time,
      category: '会话',
      action: () => { setActiveSession(s.id) },
    })),
  ], [sessions, activeSessionId, createNewSession, setTheme, setActiveSession, setRightTab, toggleSidebar, openSettings])

  const fuse = useMemo(() => new Fuse(commands, {
    keys: ['label', 'description', 'category'],
    threshold: 0.4,
  }), [commands])

  const results = useMemo(() => {
    if (!query.trim()) return commands
    return fuse.search(query).map(r => r.item)
  }, [query, commands, fuse])

  // Keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        useUiStore.getState().setCommandPaletteOpen(true)
      }
      if (e.key === 'Escape') useUiStore.getState().setCommandPaletteOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return
    const el = listRef.current.children[selectedIdx] as HTMLElement
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIdx])

  const executeSelected = useCallback(() => {
    if (results[selectedIdx]) {
      results[selectedIdx].action()
      setOpen(false)
      setQuery('')
    }
  }, [results, selectedIdx])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, results.length - 1)); break
      case 'ArrowUp': e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, 0)); break
      case 'Enter': e.preventDefault(); executeSelected(); break
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={() => setOpen(false)}
      onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
    >
      <div
        className="w-full max-w-lg rounded-xl shadow-2xl overflow-hidden"
        style={{
          background: 'var(--sidebar-bg)',
          border: '1px solid var(--border-color)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center px-4" style={{ borderBottom: '1px solid var(--border-color)' }}>
          <svg className="w-4 h-4 shrink-0" style={{ color: 'var(--text-muted)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIdx(0) }}
            onKeyDown={handleKeyDown}
            placeholder="输入命令或搜索会话..."
            className="w-full px-3 py-3.5 text-sm bg-transparent border-none outline-none"
            style={{ color: 'var(--text-primary)' }}
          />
          <kbd className="text-[10px] px-1.5 py-0.5 rounded shrink-0" style={{ background: 'var(--badge-bg)', color: 'var(--text-muted)', border: '1px solid var(--border-color)' }}>esc</kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-80 overflow-y-auto py-2" style={{ scrollbarWidth: 'thin' }}>
          {results.length === 0 ? (
            <p className="text-xs text-center py-8" style={{ color: 'var(--text-muted)' }}>无匹配结果</p>
          ) : (
            results.map((cmd, idx) => (
              <button
                key={cmd.id}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors cursor-pointer"
                style={{
                  background: idx === selectedIdx ? 'var(--accent-bg)' : 'transparent',
                  borderLeft: idx === selectedIdx ? '2px solid var(--accent)' : '2px solid transparent',
                }}
                onMouseEnter={() => setSelectedIdx(idx)}
                onClick={() => { cmd.action(); setOpen(false); setQuery('') }}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{cmd.label}</div>
                  <div className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>{cmd.description}</div>
                </div>
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded shrink-0"
                  style={{ background: 'var(--badge-bg)', color: 'var(--badge-text)', border: '1px solid var(--badge-border)' }}
                >
                  {cmd.category}
                </span>
              </button>
            ))
          )}
        </div>

        {/* Footer shortcuts */}
        <div
          className="flex items-center gap-3 px-4 py-2 text-[10px]"
          style={{
            borderTop: '1px solid var(--border-color)',
            color: 'var(--text-muted)',
          }}
        >
          <span><kbd className="px-1 py-0.5 rounded" style={{ background: 'var(--badge-bg)', border: '1px solid var(--border-color)' }}>↵</kbd> 执行</span>
          <span><kbd className="px-1 py-0.5 rounded" style={{ background: 'var(--badge-bg)', border: '1px solid var(--border-color)' }}>↑↓</kbd> 导航</span>
          <span><kbd className="px-1 py-0.5 rounded" style={{ background: 'var(--badge-bg)', border: '1px solid var(--border-color)' }}>esc</kbd> 关闭</span>
          <span className="ml-auto"><kbd className="px-1 py-0.5 rounded" style={{ background: 'var(--badge-bg)', border: '1px solid var(--border-color)' }}>⌘B</kbd> 侧边栏</span>
          <span><kbd className="px-1 py-0.5 rounded" style={{ background: 'var(--badge-bg)', border: '1px solid var(--border-color)' }}>⌘N</kbd> 新会话</span>
          <span><kbd className="px-1 py-0.5 rounded" style={{ background: 'var(--badge-bg)', border: '1px solid var(--border-color)' }}>⌘,</kbd> 设置</span>
        </div>
      </div>
    </div>
  )
}
