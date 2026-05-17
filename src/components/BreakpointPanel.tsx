import { X, Circle, CircleDot } from 'lucide-react'
import { useStore } from '../stores/useStore'
import { useDebugStore, type Breakpoint } from '../stores/debugStore'

export default function BreakpointPanel() {
  const breakpoints = useDebugStore((s) => s.breakpoints)
  const removeBreakpoint = useDebugStore((s) => s.removeBreakpoint)
  const updateBreakpoint = useDebugStore((s) => s.updateBreakpoint)
  const activeEditingFilePath = useStore((s) => s.activeEditingFilePath)

  // BPs for the active file
  const activeFileBps = breakpoints.filter(b => b.file === activeEditingFilePath)
  // BPs in other files
  const otherBps = breakpoints.filter(b => b.file !== activeEditingFilePath)

  return (
    <div className="flex flex-col h-full text-xs">
      <div className="flex items-center justify-between px-2 py-1.5 font-semibold" style={{ color: 'var(--panel-header)', borderBottom: '1px solid var(--border-color)' }}>
        <span>断点</span>
        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{breakpoints.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {breakpoints.length === 0 ? (
          <p className="px-2 py-3 text-center" style={{ color: 'var(--text-muted)' }}>在编辑器左侧边距点击以添加断点</p>
        ) : (
          <>
            {activeFileBps.map((bp) => <BpRow key={bp.id} bp={bp} onRemove={removeBreakpoint} onToggle={(e) => updateBreakpoint(bp.id, { enabled: e })} />)}
            {otherBps.map((bp) => <BpRow key={bp.id} bp={bp} onRemove={removeBreakpoint} onToggle={(e) => updateBreakpoint(bp.id, { enabled: e })} />)}
          </>
        )}
      </div>
    </div>
  )
}

function BpRow({ bp, onRemove, onToggle }: { bp: Breakpoint; onRemove: (id: string) => void; onToggle: (e: boolean) => void }) {
  const filename = bp.file.split('\\').pop()?.split('/').pop() || bp.file
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 border-b" style={{ borderColor: 'var(--border-color)' }}>
      <button onClick={() => onToggle(!bp.enabled)} className="p-0.5 cursor-pointer hover:opacity-70" style={{ color: bp.enabled ? 'var(--accent)' : 'var(--text-muted)' }}>
        {bp.enabled ? <CircleDot size={12} /> : <Circle size={12} />}
      </button>
      <span className="font-mono text-[10px] truncate flex-1" style={{ color: 'var(--text-secondary)' }}>
        {filename}:{bp.line}
      </span>
      <button onClick={() => onRemove(bp.id)} className="p-0.5 cursor-pointer hover:opacity-70" style={{ color: 'var(--text-muted)' }}>
        <X size={10} />
      </button>
    </div>
  )
}
