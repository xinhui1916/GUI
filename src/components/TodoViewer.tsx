import { useState, useEffect, useCallback } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { useStore } from '../stores/useStore'
import { searchInFiles, readFile, type SearchMatch } from '../lib/ipc'
import { logError } from '../lib/logger'

const TODO_PATTERNS = ['TODO', 'FIXME', 'HACK', 'XXX', 'BUG']

export default function TodoViewer() {
  const workspacePath = useStore((s) => s.workspacePath)
  const openEditingFile = useStore((s) => s.openEditingFile)
  const [results, setResults] = useState<SearchMatch[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedPattern, setSelectedPattern] = useState<string>('TODO')
  const [done, setDone] = useState(false)

  const searchTodos = useCallback(async () => {
    if (!workspacePath) return
    setLoading(true)
    setDone(false)
    try {
      const res = await searchInFiles(workspacePath, selectedPattern)
      setResults(res.filter(r => {
        const line = r.content.toLowerCase()
        const pattern = selectedPattern.toLowerCase()
        return line.includes(pattern)
      }))
    } catch (err) {
      logError('TodoViewer', 'search todos failed', err)
      setResults([])
    }
    setLoading(false)
    setDone(true)
  }, [workspacePath, selectedPattern])

  useEffect(() => {
    if (workspacePath) searchTodos()
  }, [workspacePath, searchTodos])

  const handleOpenFile = useCallback(async (filePath: string) => {
    try {
      const content = await readFile(filePath)
      openEditingFile({ path: filePath, content })
    } catch (err) { logError('TodoViewer', 'open file failed', err) }
  }, [openEditingFile])

  if (!workspacePath) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>请先设置工作区</p>
      </div>
    )
  }

  const fileGroups = new Map<string, SearchMatch[]>()
  for (const r of results) {
    const existing = fileGroups.get(r.file) || []
    existing.push(r)
    fileGroups.set(r.file, existing)
  }

  return (
    <div className="space-y-2">
      {/* Pattern selector */}
      <div className="flex flex-wrap gap-1">
        {TODO_PATTERNS.map((p) => (
          <button key={p} onClick={() => setSelectedPattern(p)}
            className="text-[10px] px-2 py-0.5 rounded-full cursor-pointer"
            style={{
              background: selectedPattern === p ? 'var(--accent-bg)' : 'var(--bg-elevated)',
              color: selectedPattern === p ? 'var(--accent)' : 'var(--text-muted)',
              border: `1px solid ${selectedPattern === p ? 'var(--accent)' : 'var(--border-color)'}`,
            }}>
            {p}
          </button>
        ))}
      </div>

      {/* Refresh */}
      <button onClick={searchTodos} disabled={loading}
        className="w-full py-1 text-[10px] font-medium rounded cursor-pointer disabled:opacity-40"
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}>
        {loading ? <Loader2 size={11} className="animate-spin inline mr-1" /> : null}
        刷新
      </button>

      {/* Results */}
      <div className="space-y-1">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={16} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
          </div>
        ) : done && results.length === 0 ? (
          <p className="text-xs text-center py-4" style={{ color: 'var(--text-muted)' }}>未找到 {selectedPattern}</p>
        ) : (
          Array.from(fileGroups.entries()).map(([file, matches]) => (
            <div key={file} className="rounded-lg overflow-hidden"
              style={{ border: '1px solid var(--border-color)' }}>
              <div className="flex items-center gap-1.5 px-2 py-1 text-[10px]"
                style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
                <AlertTriangle size={10} style={{ color: 'var(--accent)' }} />
                <span className="truncate flex-1">{file.split(/[/\\]/).pop()}</span>
                <span>{matches.length}</span>
              </div>
              {matches.slice(0, 20).map((m, i) => (
                <button key={i} onClick={() => handleOpenFile(m.file)}
                  className="w-full flex items-start gap-1.5 px-2 py-0.5 text-[10px] text-left cursor-pointer hover:opacity-80"
                  style={{ color: 'var(--text-secondary)' }}>
                  <span className="font-mono shrink-0" style={{ color: 'var(--text-muted)' }}>{m.line}:</span>
                  <span className="truncate">{m.content.trim()}</span>
                </button>
              ))}
              {matches.length > 20 && (
                <p className="text-[9px] px-2 py-0.5" style={{ color: 'var(--text-muted)' }}>
                  ...还有 {matches.length - 20} 条
                </p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
