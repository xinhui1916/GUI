import { Play, Square, SkipForward, SkipBack, ArrowDown, ArrowUp, CornerDownRight } from 'lucide-react'
import { useDebugStore } from '../stores/debugStore'
import { dapSendRequest } from '../lib/ipc'

export default function DebugToolbar() {
  const sessionId = useDebugStore((s) => s.sessionId)
  const isRunning = useDebugStore((s) => s.isRunning)
  const stoppedReason = useDebugStore((s) => s.stoppedReason)

  if (!sessionId) return null

  const cmd = async (command: string, args: any = {}) => {
    try {
      await dapSendRequest(sessionId, command, args)
    } catch (e) { console.error('DAP error:', e) }
  }

  const stopped = !isRunning && stoppedReason !== ''

  return (
    <div className="flex items-center gap-1 px-2 py-1 shrink-0" style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-color)' }}>
      {stopped ? (
        <>
          <DbgBtn icon={<SkipBack size={14} />} title="继续 (F5)" onClick={() => cmd('continue')} />
          <DbgBtn icon={<SkipForward size={14} />} title="单步跳过 (F10)" onClick={() => cmd('next')} />
          <DbgBtn icon={<ArrowDown size={14} />} title="单步进入 (F11)" onClick={() => cmd('stepIn')} />
          <DbgBtn icon={<ArrowUp size={14} />} title="单步跳出 (Shift+F11)" onClick={() => cmd('stepOut')} />
          <DbgBtn icon={<CornerDownRight size={14} />} title="重启" onClick={() => cmd('restart')} />
        </>
      ) : (
        <DbgBtn icon={<Play size={14} />} title="启动" disabled />
      )}
      <DbgBtn icon={<Square size={14} />} title="停止 (Shift+F5)" onClick={() => cmd('disconnect', { terminateDebuggee: true })} />

      {stoppedReason && (
        <span className="text-[10px] ml-2 truncate" style={{ color: 'var(--accent)' }}>
          停止: {stoppedReason}
        </span>
      )}
      {isRunning && (
        <span className="text-[10px] ml-2" style={{ color: 'var(--text-muted)' }}>运行中...</span>
      )}
    </div>
  )
}

function DbgBtn({ icon, title, onClick, disabled }: { icon: React.ReactNode; title: string; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="p-1 rounded cursor-pointer hover:opacity-70 disabled:opacity-30 disabled:cursor-not-allowed"
      title={title}
      style={{ color: 'var(--text-secondary)' }}
    >
      {icon}
    </button>
  )
}
