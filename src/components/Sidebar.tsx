import { Plus, Search, MessageSquare } from 'lucide-react'
import { useStore } from '../stores/useStore'
import SessionItem from './SessionItem'

export default function Sidebar() {
  const sessions = useStore((s) => s.sessions)
  const createNewSession = useStore((s) => s.createNewSession)

  return (
    <div
      className="w-56 flex flex-col shrink-0"
      style={{ background: 'var(--sidebar-bg)', borderRight: '1px solid var(--border-color)' }}
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

      {/* Session list */}
      <div className="flex-1 overflow-y-auto">
        {sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-4 text-center">
            <MessageSquare size={32} style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
            <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
              暂无会话
            </p>
            <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>
              在下方输入消息开始对话
            </p>
          </div>
        ) : (
          sessions.map((s) => (
            <SessionItem key={s.id} session={s} />
          ))
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
            placeholder="搜索会话..."
            className="bg-transparent border-none outline-none text-xs flex-1"
            style={{ color: 'var(--text-secondary)' }}
          />
        </div>
      </div>
    </div>
  )
}
