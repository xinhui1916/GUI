import { useState } from 'react'
import { Plus, X, RefreshCw } from 'lucide-react'
import { useDebugStore } from '../stores/debugStore'
import { dapSendRequest } from '../lib/ipc'
import { logError } from '../lib/logger'

export default function DebugWatch() {
  const sessionId = useDebugStore((s) => s.sessionId)
  const watchExpressions = useDebugStore((s) => s.watchExpressions)
  const addWatch = useDebugStore((s) => s.addWatch)
  const removeWatch = useDebugStore((s) => s.removeWatch)
  const updateWatchValue = useDebugStore((s) => s.updateWatchValue)
  const [input, setInput] = useState('')

  const handleAdd = () => {
    if (!input.trim()) return
    addWatch(input.trim())
    setInput('')
  }

  const evaluateAll = async () => {
    if (!sessionId) return
    for (const w of watchExpressions) {
      try {
        const result = await dapSendRequest(sessionId, 'evaluate', {
          expression: w.expression,
          context: 'watch',
        })
        updateWatchValue(w.id, result?.result || '(无法求值)')
      } catch (err) {
        logError('DebugWatch', 'evaluate watch expression failed', err)
        updateWatchValue(w.id, '(错误)')
      }
    }
  }

  return (
    <div className="flex flex-col h-full text-xs">
      <div className="flex items-center justify-between px-2 py-1.5 font-semibold shrink-0" style={{ color: 'var(--panel-header)', borderBottom: '1px solid var(--border-color)' }}>
        <span>监视</span>
        <button onClick={evaluateAll} className="p-0.5 cursor-pointer hover:opacity-70" style={{ color: 'var(--text-muted)' }}>
          <RefreshCw size={10} />
        </button>
      </div>
      <div className="px-2 py-1 flex gap-1" style={{ borderBottom: '1px solid var(--border-color)' }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="添加监视表达式..."
          className="flex-1 px-1.5 py-0.5 text-[10px] rounded outline-none"
          style={{ background: 'var(--input-bg)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}
        />
        <button onClick={handleAdd} className="p-0.5 cursor-pointer hover:opacity-70" style={{ color: 'var(--accent)' }}>
          <Plus size={10} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {watchExpressions.length === 0 ? (
          <p className="px-2 py-3 text-center" style={{ color: 'var(--text-muted)' }}>无监视表达式</p>
        ) : (
          watchExpressions.map((w) => (
            <div key={w.id} className="flex items-center gap-1 px-2 py-1" style={{ borderBottom: '1px solid var(--border-color)' }}>
              <span className="truncate max-w-[80px]" style={{ color: 'var(--text-secondary)' }}>{w.expression}</span>
              <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>=</span>
              <span className="truncate flex-1 text-right" style={{ color: 'var(--text-primary)' }}>{w.value || '(未求值)'}</span>
              <button onClick={() => removeWatch(w.id)} className="p-0.5 cursor-pointer hover:opacity-70" style={{ color: 'var(--text-muted)' }}>
                <X size={10} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
