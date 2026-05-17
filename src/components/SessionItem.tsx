import { useState, useRef, useEffect } from 'react'
import { Trash2, Check, X, Archive, RotateCcw } from 'lucide-react'
import { useStore, type Session } from '../stores/useStore'
import ContextMenu from './ContextMenu'

export default function SessionItem({ session }: { session: Session }) {
  const setActive = useStore((s) => s.setActiveSession)
  const renameSession = useStore((s) => s.renameSession)
  const deleteSession = useStore((s) => s.deleteSession)
  const archiveSession = useStore((s) => s.archiveSession)
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(session.name)
  const [showDel, setShowDel] = useState(false)
  const [cmPos, setCmPos] = useState<{ x: number; y: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  const handleRename = () => {
    const trimmed = editName.trim()
    if (trimmed && trimmed !== session.name) {
      renameSession(session.id, trimmed)
    }
    setEditing(false)
  }

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    deleteSession(session.id)
  }

  return (
    <div
      onClick={() => { if (!editing) setActive(session.id) }}
      onMouseEnter={() => setShowDel(true)}
      onMouseLeave={() => setShowDel(false)}
      onContextMenu={(e) => {
        e.preventDefault()
        setCmPos({ x: e.clientX, y: e.clientY })
      }}
      className="group flex items-center gap-1 px-4 py-2.5 cursor-pointer transition-colors"
      style={{
        borderLeft: session.active ? '3px solid var(--accent)' : '3px solid transparent',
        background: session.active ? 'var(--sidebar-active)' : 'transparent',
      }}
    >
      {cmPos && (
        <ContextMenu
          x={cmPos.x}
          y={cmPos.y}
          onClose={() => setCmPos(null)}
          items={[
            { label: session.archived ? '取消归档' : '归档', icon: session.archived ? <RotateCcw size={12} /> : <Archive size={12} />, action: () => archiveSession(session.id) },
            { label: '删除', icon: <Trash2 size={12} />, danger: true, action: () => deleteSession(session.id) },
          ]}
        />
      )}
      <div className="flex-1 min-w-0">
        {editing ? (
          <div className="flex items-center gap-1">
            <input
              ref={inputRef}
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={handleRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRename()
                if (e.key === 'Escape') { setEditName(session.name); setEditing(false) }
              }}
              onClick={(e) => e.stopPropagation()}
              className="w-full text-sm px-1 py-0.5 rounded outline-none"
              style={{
                background: 'var(--input-bg)',
                border: '1px solid var(--accent)',
                color: 'var(--text-primary)',
              }}
            />
            <button onClick={(e) => { e.stopPropagation(); handleRename() }} className="shrink-0 cursor-pointer hover:opacity-70" style={{ color: 'var(--accent)' }}>
              <Check size={14} />
            </button>
            <button onClick={(e) => { e.stopPropagation(); setEditName(session.name); setEditing(false) }} className="shrink-0 cursor-pointer hover:opacity-70" style={{ color: 'var(--text-muted)' }}>
              <X size={14} />
            </button>
          </div>
        ) : (
          <div
            className="text-sm font-medium truncate"
            style={{ color: 'var(--text-primary)' }}
            onDoubleClick={(e) => { e.stopPropagation(); setEditName(session.name); setEditing(true) }}
          >
            {session.name}
          </div>
        )}
        {session.tags && session.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {session.tags.map((tag) => (
              <span
                key={tag}
                className="text-[9px] px-1.5 py-0.5 rounded-full"
                style={{
                  background: 'var(--accent-bg)',
                  color: 'var(--accent)',
                  border: '1px solid var(--badge-border)',
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}
        {!editing && (
          <>
            <div className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>
              {session.preview}
            </div>
            <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {session.time}
            </div>
          </>
        )}
      </div>

      {/* Delete button */}
      <button
        onClick={handleDelete}
        className={`shrink-0 p-1 rounded cursor-pointer transition-all duration-150 hover:opacity-70 ${showDel ? 'opacity-100' : 'opacity-0'}`}
        style={{ color: 'var(--text-muted)' }}
        title="删除会话"
      >
        <Trash2 size={13} />
      </button>
    </div>
  )
}
