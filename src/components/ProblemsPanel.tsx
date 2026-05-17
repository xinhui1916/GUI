import { useState, useEffect, useCallback, type JSX } from 'react'
import { AlertCircle, AlertTriangle, Info, ChevronRight, ChevronDown, File } from 'lucide-react'
import * as monaco from 'monaco-editor'

interface Problem {
  file: string
  line: number
  column: number
  message: string
  severity: 'error' | 'warning' | 'info'
}

function getFilename(path: string): string {
  const idx = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'))
  return idx >= 0 ? path.slice(idx + 1) : path
}

function toSeverity(s: monaco.MarkerSeverity): 'error' | 'warning' | 'info' {
  if (s === 8) return 'error' // MarkerSeverity.Error
  if (s === 4) return 'warning' // MarkerSeverity.Warning
  return 'info'
}

const severityIcon: Record<string, JSX.Element> = {
  error: <AlertCircle size={13} style={{ color: '#ef4444' }} />,
  warning: <AlertTriangle size={13} style={{ color: '#f59e0b' }} />,
  info: <Info size={13} style={{ color: '#3b82f6' }} />,
}

export default function ProblemsPanel() {
  const [problems, setProblems] = useState<Problem[]>([])
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<'all' | 'error' | 'warning'>('all')

  useEffect(() => {
    function refresh() {
      const markers = monaco.editor.getModelMarkers({})
      const mapped: Problem[] = markers.map(m => ({
        file: m.resource.path,
        line: m.startLineNumber,
        column: m.startColumn,
        message: m.message,
        severity: toSeverity(m.severity),
      }))
      setProblems(mapped)
    }

    // Listen for marker changes
    const disposable = monaco.editor.onDidChangeMarkers(() => {
      refresh()
    })

    // Initial fetch after a short delay (Monaco may not be fully loaded yet)
    const timer = setTimeout(refresh, 500)

    return () => {
      disposable.dispose()
      clearTimeout(timer)
    }
  }, [])

  const toggleFile = useCallback((path: string) => {
    setExpandedFiles(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  const filtered = problems.filter(p => {
    if (filter === 'error') return p.severity === 'error'
    if (filter === 'warning') return p.severity === 'warning'
    return true
  })

  const fileGroups = new Map<string, Problem[]>()
  for (const p of filtered) {
    const existing = fileGroups.get(p.file) || []
    existing.push(p)
    fileGroups.set(p.file, existing)
  }

  const errorCount = problems.filter(p => p.severity === 'error').length
  const warningCount = problems.filter(p => p.severity === 'warning').length

  return (
    <div className="flex flex-col h-full">
      {/* Summary bar */}
      <div className="flex items-center gap-2 px-2 py-1.5 text-[11px]" style={{ borderBottom: '1px solid var(--border-color)' }}>
        <span className="text-[11px] font-semibold" style={{ color: 'var(--panel-header)' }}>问题</span>
        <div className="ml-auto flex items-center gap-1">
          <button onClick={() => setFilter('all')}
            className="px-1.5 py-0.5 rounded cursor-pointer text-[10px]"
            style={{ background: filter === 'all' ? 'var(--accent-bg)' : 'transparent', color: filter === 'all' ? 'var(--accent)' : 'var(--text-muted)' }}>
            全部 {problems.length}
          </button>
          <button onClick={() => setFilter('error')}
            className="px-1.5 py-0.5 rounded cursor-pointer text-[10px]"
            style={{ background: filter === 'error' ? 'rgba(239,68,68,0.1)' : 'transparent', color: filter === 'error' ? '#ef4444' : 'var(--text-muted)' }}>
            <AlertCircle size={10} className="inline mr-0.5" />{errorCount}
          </button>
          <button onClick={() => setFilter('warning')}
            className="px-1.5 py-0.5 rounded cursor-pointer text-[10px]"
            style={{ background: filter === 'warning' ? 'rgba(245,158,11,0.1)' : 'transparent', color: filter === 'warning' ? '#f59e0b' : 'var(--text-muted)' }}>
            <AlertTriangle size={10} className="inline mr-0.5" />{warningCount}
          </button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto py-1">
        {filtered.length === 0 ? (
          <p className="text-[11px] text-center py-8" style={{ color: 'var(--text-muted)' }}>
            {problems.length === 0 ? '暂无诊断信息' : '无匹配结果'}
          </p>
        ) : (
          Array.from(fileGroups.entries()).map(([file, entries]) => {
            const isExpanded = expandedFiles.has(file)
            const fn = getFilename(file)
            return (
              <div key={file}>
                <button
                  onClick={() => toggleFile(file)}
                  className="w-full flex items-center gap-1 px-2 py-1 text-[11px] cursor-pointer hover:opacity-80"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {isExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                  <File size={11} />
                  <span className="truncate flex-1">{fn}</span>
                  <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{entries.length}</span>
                </button>
                {isExpanded && entries.map((p, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-1.5 pl-7 pr-2 py-0.5 text-[11px] cursor-default"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {severityIcon[p.severity]}
                    <span className="text-[10px] font-mono shrink-0 pt-0.5" style={{ color: 'var(--text-muted)' }}>{p.line}:{p.column}</span>
                    <span className="truncate flex-1">{p.message}</span>
                  </div>
                ))}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
