import { useState, useRef, useEffect } from 'react'
import { Trash2 } from 'lucide-react'
import { useDebugStore } from '../stores/debugStore'
import { dapSendRequest } from '../lib/ipc'
import { logError } from '../lib/logger'

export default function DebugConsole() {
  const sessionId = useDebugStore((s) => s.sessionId)
  const consoleOutput = useDebugStore((s) => s.consoleOutput)
  const clearConsole = useDebugStore((s) => s.clearConsole)
  const [input, setInput] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const [historyIdx, setHistoryIdx] = useState(-1)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [consoleOutput])

  const handleSubmit = async () => {
    if (!input.trim() || !sessionId) return
    const expr = input.trim()
    setHistory((h) => [...h, expr])
    setHistoryIdx(-1)
    setInput('')

    try {
      const result = await dapSendRequest(sessionId, 'evaluate', {
        expression: expr,
        context: 'repl',
      })
      useDebugStore.getState().addConsoleOutput(result?.result || '(无返回值)', 'output')
    } catch (err) {
      logError('DebugConsole', 'evaluate expression failed', err)
      useDebugStore.getState().addConsoleOutput('(求值错误)', 'error')
    }
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (history.length > 0) {
        const idx = historyIdx < 0 ? history.length - 1 : Math.max(0, historyIdx - 1)
        setHistoryIdx(idx)
        setInput(history[idx])
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (historyIdx >= 0) {
        const idx = historyIdx + 1
        if (idx >= history.length) {
          setHistoryIdx(-1)
          setInput('')
        } else {
          setHistoryIdx(idx)
          setInput(history[idx])
        }
      }
    }
  }

  return (
    <div className="flex flex-col h-full text-xs">
      <div className="flex items-center justify-between px-2 py-1.5 font-semibold shrink-0" style={{ color: 'var(--panel-header)', borderBottom: '1px solid var(--border-color)' }}>
        <span>调试控制台</span>
        <button onClick={clearConsole} className="p-0.5 cursor-pointer hover:opacity-70" style={{ color: 'var(--text-muted)' }}>
          <Trash2 size={10} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-1 font-mono text-[10px] leading-relaxed" style={{ background: 'var(--input-bg)' }}>
        {consoleOutput.length === 0 ? (
          <p className="px-1 py-2" style={{ color: 'var(--text-muted)' }}>调试控制台 - 输入表达式求值</p>
        ) : (
          consoleOutput.map((entry, i) => (
            <div key={i} className="px-1 py-0.5" style={{
              color: entry.category === 'error' ? 'var(--error)' : entry.category === 'stderr' ? '#f59e0b' : 'var(--text-primary)',
            }}>
              {entry.text}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
      <div className="p-1 shrink-0" style={{ borderTop: '1px solid var(--border-color)' }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="> 输入表达式..."
          className="w-full px-1.5 py-1 text-[10px] font-mono rounded outline-none"
          style={{ background: 'var(--input-bg)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}
        />
      </div>
    </div>
  )
}
