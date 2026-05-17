import { useState, useMemo } from 'react'
import { Plus, Search, MessageSquare, Archive, X } from 'lucide-react'
import Fuse from 'fuse.js'
import { useStore } from '../stores/useStore'
import SessionItem from './SessionItem'

export default function Sidebar() {
  const sessions = useStore((s) => s.sessions)
  const createNewSession = useStore((s) => s.createNewSession)
  const [query, setQuery] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [activeTag, setActiveTag] = useState<string | null>(null)

  const allTags = useMemo(() => {
    const tagSet = new Set<string>()
    sessions.forEach(s => s.tags?.forEach(t => tagSet.add(t)))
    return Array.from(tagSet).sort()
  }, [sessions])

  const activeSessions = useMemo(() => sessions.filter(s => !s.archived), [sessions])
  const archivedSessions = useMemo(() => sessions.filter(s => s.archived), [sessions])

  const fuse = useMemo(() => new Fuse(activeSessions, {
    keys: ['name', 'preview'],
    threshold: 0.4,
  }), [activeSessions])

  const filtered = useMemo(() => {
    let result = activeSessions
    if (activeTag) {
      result = result.filter(s => s.tags?.includes(activeTag))
    }
    if (query.trim()) {
      result = fuse.search(query).map(r => r.item)
    }
    return result
  }, [query, activeTag, activeSessions, fuse])

  return (
    <div
      className="w-56 flex flex-col h-full"
      style={{
        backgroundColor: 'var(--sidebar-bg)',
        backgroundImage: 'var(--sidebar-bg-image, none)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        borderRight: '1px solid var(--border-color)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3.5"
        style={{ borderBottom: '1px solid var(--border-color)' }}
      >
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          会话
        </h3>
        <button
          onClick={createNewSession}
          className="text-lg cursor-pointer hover:opacity-70 transition-opacity"
          style={{ color: 'var(--text-muted)' }}
        >
          <Plus size={16} />
        </button>
      </div>

      {/* Tag filter */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1 px-3 py-2" style={{ borderBottom: '1px solid var(--border-color)' }}>
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => setActiveTag(activeTag === tag ? null : tag)}
              className="text-[10px] px-2 py-0.5 rounded-full cursor-pointer transition-colors"
              style={{
                background: activeTag === tag ? 'var(--accent)' : 'var(--bg-elevated)',
                color: activeTag === tag ? '#fff' : 'var(--text-muted)',
                border: `1px solid ${activeTag === tag ? 'var(--accent)' : 'var(--border-color)'}`,
              }}
            >
              {tag}
              {activeTag === tag && <X size={10} className="inline ml-0.5" style={{ verticalAlign: 'middle' }} />}
            </button>
          ))}
        </div>
      )}

      {/* Session list */}
      <div className="flex-1 overflow-y-auto">
        {activeSessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-4 text-center">
            <MessageSquare size={32} style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
            <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
              暂无会话
            </p>
            <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>
              在下方输入消息开始对话
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-4 text-center">
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              无匹配结果
            </p>
          </div>
        ) : (
          filtered.map((s) => (
            <SessionItem key={s.id} session={s} />
          ))
        )}

        {/* Archived sessions */}
        {archivedSessions.length > 0 && (
          <div style={{ borderTop: '1px solid var(--border-color)' }}>
            <button
              onClick={() => setShowArchived(!showArchived)}
              className="flex items-center gap-2 w-full px-4 py-2 text-xs cursor-pointer transition-colors hover:opacity-80"
              style={{ color: 'var(--text-muted)' }}
            >
              <Archive size={12} />
              <span>已归档 ({archivedSessions.length})</span>
              <span className="ml-auto">{showArchived ? '▼' : '▶'}</span>
            </button>
            {showArchived && archivedSessions.map((s) => (
              <SessionItem key={s.id} session={s} />
            ))}
          </div>
        )}
      </div>

      {/* Search */}
      <div
        className="p-3"
        style={{ borderTop: '1px solid var(--border-color)' }}
      >
        <div
          className="flex items-center gap-2 rounded-md px-2.5 py-1.5"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-light)' }}
        >
          <Search size={14} style={{ color: 'var(--text-muted)' }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索会话..."
            className="bg-transparent border-none outline-none text-xs flex-1"
            style={{ color: 'var(--text-secondary)' }}
          />
        </div>
      </div>
    </div>
  )
}
