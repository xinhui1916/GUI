import { useState, useRef, useEffect } from 'react'
import { Trash2 } from 'lucide-react'
import { useOutputStore } from '../stores/outputStore'

const CHANNELS = ['全部', '任务', 'Git', '系统'] as const
type Channel = typeof CHANNELS[number]

export default function OutputPanel() {
  const entries = useOutputStore((s) => s.entries)
  const clearOutput = useOutputStore((s) => s.clearOutput)
  const [activeChannel, setActiveChannel] = useState<Channel>('全部')
  const bottomRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)

  const filtered = activeChannel === '全部'
    ? entries
    : entries.filter(e => {
        if (activeChannel === '任务') return e.channel === 'task'
        if (activeChannel === 'Git') return e.channel === 'git'
        if (activeChannel === '系统') return e.channel === 'system'
        return true
      })

  useEffect(() => {
    if (autoScroll) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [filtered.length, autoScroll])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-1 px-2 py-1.5 text-[11px]" style={{ borderBottom: '1px solid var(--border-color)' }}>
        <span className="font-semibold" style={{ color: 'var(--panel-header)' }}>输出</span>
        <div className="flex items-center gap-0.5 ml-2">
          {CHANNELS.map((ch) => (
            <button key={ch} onClick={() => setActiveChannel(ch)}
              className="px-1.5 py-0.5 rounded cursor-pointer text-[10px]"
              style={{
                background: activeChannel === ch ? 'var(--accent-bg)' : 'transparent',
                color: activeChannel === ch ? 'var(--accent)' : 'var(--text-muted)',
              }}>
              {ch}
            </button>
          ))}
        </div>
        <button onClick={() => clearOutput()}
          className="ml-auto p-1 rounded cursor-pointer hover:opacity-70" style={{ color: 'var(--text-muted)' }}>
          <Trash2 size={12} />
        </button>
      </div>

      {/* Output */}
      <div
        className="flex-1 overflow-y-auto font-mono text-[11px] leading-relaxed p-2"
        style={{ background: 'var(--code-bg)', color: 'var(--text-primary)' }}
        onScroll={(e) => {
          const el = e.currentTarget
          setAutoScroll(el.scrollTop + el.clientHeight >= el.scrollHeight - 20)
        }}
      >
        {filtered.length === 0 ? (
          <p className="text-center py-8" style={{ color: 'var(--text-muted)' }}>暂无输出</p>
        ) : (
          filtered.map((entry) => (
            <div key={entry.id} className="flex gap-2">
              <span style={{ color: 'var(--text-muted)', opacity: 0.5 }}>{entry.time}</span>
              <span className="whitespace-pre-wrap break-all">{entry.text}</span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
