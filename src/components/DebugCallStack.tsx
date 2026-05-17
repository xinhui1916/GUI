import { useDebugStore } from '../stores/debugStore'

export default function DebugCallStack() {
  const sessionId = useDebugStore((s) => s.sessionId)
  const stackFrames = useDebugStore((s) => s.stackFrames)
  const activeStackFrame = useDebugStore((s) => s.activeStackFrame)
  const setActiveStackFrame = useDebugStore((s) => s.setActiveStackFrame)

  if (!sessionId) return null

  return (
    <div className="flex flex-col h-full text-xs">
      <div className="flex items-center justify-between px-2 py-1.5 font-semibold shrink-0" style={{ color: 'var(--panel-header)', borderBottom: '1px solid var(--border-color)' }}>
        <span>调用栈</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {stackFrames.length === 0 ? (
          <p className="px-2 py-3 text-center" style={{ color: 'var(--text-muted)' }}>无调用栈</p>
        ) : (
          stackFrames.map((frame, i) => {
            const isActive = frame.id === activeStackFrame
            const filename = frame.source?.path?.split('\\').pop()?.split('/').pop() || 'unknown'
            return (
              <div
                key={frame.id}
                onClick={() => setActiveStackFrame(frame.id)}
                className="flex items-center gap-1.5 px-2 py-1 cursor-pointer hover:opacity-80"
                style={{
                  background: isActive ? 'var(--accent-bg)' : 'transparent',
                  color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                }}
              >
                <span className="w-4 text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>#{i}</span>
                <span className="truncate flex-1">{frame.name}</span>
                <span className="text-[9px] font-mono truncate max-w-[120px]" style={{ color: 'var(--text-muted)' }}>
                  {filename}:{frame.line}
                </span>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
