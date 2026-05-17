import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import Fuse from 'fuse.js'
import { useStore } from '../stores/useStore'

interface SearchResult {
  sessionId: string
  sessionName: string
  role: string
  content: string
}

export default function GlobalSearch() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIdx, setSelectedIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const sessions = useStore((s) => s.sessions)
  const messages = useStore((s) => s.messages)
  const setActiveSession = useStore((s) => s.setActiveSession)

  // Build search index from all messages across all sessions
  const searchData: SearchResult[] = useMemo(() => {
    const results: SearchResult[] = []
    for (const session of sessions) {
      const sessionMessages = messages[session.id] || []
      for (const msg of sessionMessages) {
        results.push({
          sessionId: session.id,
          sessionName: session.name,
          role: msg.role,
          content: msg.content,
        })
      }
    }
    return results
  }, [sessions, messages])

  const fuse = useMemo(() => new Fuse(searchData, {
    keys: [
      { name: 'content', weight: 3 },
      { name: 'sessionName', weight: 0.5 },
    ],
    threshold: 0.4,
  }), [searchData])

  const results = useMemo(() => {
    if (!query.trim()) return []
    return fuse.search(query).map(r => r.item)
  }, [query, fuse])

  // Keyboard shortcut: Cmd+Shift+F
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'f') {
        e.preventDefault()
        setOpen((prev) => {
          if (!prev) { setQuery(''); setSelectedIdx(0) }
          return !prev
        })
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  useEffect(() => {
    if (!listRef.current) return
    const el = listRef.current.children[selectedIdx] as HTMLElement
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIdx])

  const executeSelected = useCallback(() => {
    if (results[selectedIdx]) {
      setActiveSession(results[selectedIdx].sessionId)
      setOpen(false)
      setQuery('')
    }
  }, [results, selectedIdx, setActiveSession])

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
    >
      <div
        className="w-full max-w-xl rounded-xl shadow-2xl overflow-hidden"
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
            placeholder="搜索所有会话的消息..."
            className="w-full px-3 py-3.5 text-sm bg-transparent border-none outline-none"
            style={{ color: 'var(--text-primary)' }}
          />
          <kbd className="text-[10px] px-1.5 py-0.5 rounded shrink-0" style={{ background: 'var(--badge-bg)', color: 'var(--text-muted)', border: '1px solid var(--border-color)' }}>esc</kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-96 overflow-y-auto py-2" style={{ scrollbarWidth: 'thin' }}>
          {!query.trim() ? (
            <p className="text-xs text-center py-8" style={{ color: 'var(--text-muted)' }}>输入关键字搜索所有消息</p>
          ) : results.length === 0 ? (
            <p className="text-xs text-center py-8" style={{ color: 'var(--text-muted)' }}>无匹配结果</p>
          ) : (
            results.map((r, idx) => (
              <button
                key={`${r.sessionId}-${idx}`}
                className="w-full flex items-start gap-3 px-4 py-2.5 text-left transition-colors cursor-pointer"
                style={{
                  background: idx === selectedIdx ? 'var(--accent-bg)' : 'transparent',
                  borderLeft: idx === selectedIdx ? '2px solid var(--accent)' : '2px solid transparent',
                }}
                onMouseEnter={() => setSelectedIdx(idx)}
                onClick={() => { setActiveSession(r.sessionId); setOpen(false); setQuery('') }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[10px] font-medium uppercase" style={{ color: r.role === 'user' ? 'var(--accent)' : 'var(--badge-text)' }}>
                      {r.role === 'user' ? 'You' : 'Claude'}
                    </span>
                    <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      {r.sessionName}
                    </span>
                  </div>
                  <div className="text-xs leading-relaxed line-clamp-2" style={{ color: 'var(--text-primary)' }}>
                    {r.content || '(empty)'}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center gap-3 px-4 py-2 text-[10px]"
          style={{
            borderTop: '1px solid var(--border-color)',
            color: 'var(--text-muted)',
          }}
        >
          <span><kbd className="px-1 py-0.5 rounded" style={{ background: 'var(--badge-bg)', border: '1px solid var(--border-color)' }}>↵</kbd> 跳转到会话</span>
          <span><kbd className="px-1 py-0.5 rounded" style={{ background: 'var(--badge-bg)', border: '1px solid var(--border-color)' }}>↑↓</kbd> 导航</span>
          <span><kbd className="px-1 py-0.5 rounded" style={{ background: 'var(--badge-bg)', border: '1px solid var(--border-color)' }}>esc</kbd> 关闭</span>
        </div>
      </div>
    </div>
  )
}
