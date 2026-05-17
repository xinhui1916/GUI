import { useState, useCallback, useRef, useMemo } from 'react'
import { Search, Loader2, File, X, ChevronRight, ChevronDown, Replace } from 'lucide-react'
import { useStore } from '../stores/useStore'
import { useToastStore } from '../stores/toastStore'
import { searchInFiles, readFile, replaceInFiles, type SearchMatch, type ReplaceResult } from '../lib/ipc'
import { logError } from '../lib/logger'

export default function FileSearch() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchMatch[]>([])
  const [searching, setSearching] = useState(false)
  const [grouped, setGrouped] = useState(false)
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set())
  const [showReplace, setShowReplace] = useState(false)
  const [replacement, setReplacement] = useState('')
  const [replacing, setReplacing] = useState(false)
  const [replacingFile, setReplacingFile] = useState<string | null>(null)
  const [filterExt, setFilterExt] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const workspacePath = useStore((s) => s.workspacePath)
  const openEditingFile = useStore((s) => s.openEditingFile)
  const addToast = useToastStore((s) => s.addToast)

  const handleSearch = useCallback(async () => {
    const q = query.trim()
    if (!q || !workspacePath) return
    setSearching(true)
    setResults([])
    try {
      const res = await searchInFiles(workspacePath, q)
      setResults(res)
      setExpandedFiles(new Set())
    } catch (e: any) {
      addToast({ type: 'error', title: '搜索失败', message: e?.message || String(e), duration: 3000 })
    }
    setSearching(false)
  }, [query, workspacePath])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSearch()
    }
    if (e.key === 'Escape') {
      setQuery('')
      setResults([])
    }
  }

  const handleOpenFile = useCallback(async (filePath: string, _line?: number) => {
    try {
      const content = await readFile(filePath)
      openEditingFile({ path: filePath, content })
    } catch (err) { logError('FileSearch', 'open file failed', err) }
  }, [openEditingFile])

  const handleReplaceAll = useCallback(async () => {
    if (!workspacePath || !query.trim() || !replacement.trim()) return
    setReplacing(true)
    try {
      const results: ReplaceResult[] = await replaceInFiles(workspacePath, query.trim(), replacement)
      const total = results.reduce((sum, r) => sum + r.count, 0)
      addToast({ type: 'success', title: '替换完成', message: `已替换 ${total} 处，涉及 ${results.length} 个文件`, duration: 3000 })
      // Re-run search to refresh results
      const res = await searchInFiles(workspacePath, query.trim())
      setResults(res)
      setExpandedFiles(new Set())
    } catch (e: any) {
      addToast({ type: 'error', title: '替换失败', message: e?.message || String(e), duration: 4000 })
    }
    setReplacing(false)
  }, [workspacePath, query, replacement, addToast])

  const handleReplaceInFile = useCallback(async (filePath: string) => {
    if (!workspacePath || !query.trim() || !replacement.trim()) return
    setReplacingFile(filePath)
    try {
      const result = await replaceInFiles(workspacePath, query.trim(), replacement)
      const fileResult = result.find(r => r.file === filePath)
      if (fileResult) {
        addToast({ type: 'success', title: '替换完成', message: `已替换 ${fileResult.count} 处`, duration: 3000 })
      }
      // Re-run search
      const res = await searchInFiles(workspacePath, query.trim())
      setResults(res)
    } catch (e: any) {
      addToast({ type: 'error', title: '替换失败', message: e?.message || String(e), duration: 4000 })
    }
    setReplacingFile(null)
  }, [workspacePath, query, replacement, addToast])

  // Filter + group results by file
  const filteredResults = useMemo(() => {
    if (!filterExt.trim()) return results
    const ext = filterExt.trim().toLowerCase().replace(/^\./, '')
    return results.filter(r => {
      const idx = r.file.lastIndexOf('.')
      return idx >= 0 && r.file.slice(idx + 1).toLowerCase() === ext
    })
  }, [results, filterExt])

  const fileGroups = new Map<string, SearchMatch[]>()
  for (const r of filteredResults) {
    const existing = fileGroups.get(r.file) || []
    existing.push(r)
    fileGroups.set(r.file, existing)
  }
  const fileEntries = Array.from(fileGroups.entries())

  const toggleFile = (path: string) => {
    setExpandedFiles(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const getFilename = (path: string) => {
    const idx = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'))
    return idx >= 0 ? path.slice(idx + 1) : path
  }

  if (!workspacePath) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-xs" style={{ color: 'var(--text-muted)' }}>
        <Search size={24} className="mb-2" style={{ opacity: 0.3 }} />
        <p>请先设置工作区</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search input */}
      <div className="flex items-center gap-1.5" style={{ border: '1px solid var(--border-color)', borderRadius: 6, background: 'var(--input-bg)' }}>
        <Search size={14} style={{ color: 'var(--text-muted)', marginLeft: 8 }} />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="搜索文件内容..."
          className="flex-1 bg-transparent border-none outline-none text-xs py-2 pr-2"
          style={{ color: 'var(--text-primary)' }}
        />
        {results.length > 0 && (
          <span className="text-[10px] shrink-0" style={{ color: 'var(--text-muted)' }}>
            {results.length} 结果
          </span>
        )}
        {results.length > 0 && (
          <button onClick={() => setShowReplace(!showReplace)}
            className="p-1 rounded cursor-pointer hover:opacity-70 shrink-0"
            style={{ color: showReplace ? 'var(--accent)' : 'var(--text-muted)' }}
            title={showReplace ? '关闭替换' : '替换'}>
            <Replace size={12} />
          </button>
        )}
        {query && (
          <button onClick={() => { setQuery(''); setResults([]); setShowReplace(false); setReplacement('') }}
            className="p-1 cursor-pointer hover:opacity-70 shrink-0" style={{ color: 'var(--text-muted)' }}>
            <X size={12} />
          </button>
        )}
      </div>

      {/* Search button */}
      <button
        onClick={handleSearch}
        disabled={searching || !query.trim()}
        className="w-full mt-2 py-1.5 text-xs font-medium rounded cursor-pointer disabled:opacity-40 transition-colors"
        style={{ background: 'var(--accent)', color: '#fff', border: 'none' }}
      >
        {searching ? (
          <span className="flex items-center justify-center gap-1.5">
            <Loader2 size={12} className="animate-spin" />
            搜索中...
          </span>
        ) : '搜索'}
      </button>

      {/* Extension filter */}
      {results.length > 0 && (
        <div className="flex items-center gap-1.5 mt-2" style={{ border: '1px solid var(--border-color)', borderRadius: 6, background: 'var(--input-bg)' }}>
          <File size={12} style={{ color: 'var(--text-muted)', marginLeft: 8 }} />
          <input value={filterExt} onChange={(e) => setFilterExt(e.target.value)}
            placeholder="过滤扩展名 (如 ts, rs)..."
            className="flex-1 bg-transparent border-none outline-none text-xs py-1.5 px-1"
            style={{ color: 'var(--text-primary)' }} />
          {filterExt && (
            <button onClick={() => setFilterExt('')} className="p-1 cursor-pointer hover:opacity-70" style={{ color: 'var(--text-muted)' }}>
              <X size={11} />
            </button>
          )}
          <span className="text-[10px] shrink-0 mr-2" style={{ color: 'var(--text-muted)' }}>
            {filteredResults.length}/{results.length}
          </span>
        </div>
      )}

      {/* Replace input */}
      {showReplace && results.length > 0 && (
        <div className="flex items-center gap-1.5 mt-2" style={{ border: '1px solid var(--border-color)', borderRadius: 6, background: 'var(--input-bg)' }}>
          <input value={replacement} onChange={(e) => setReplacement(e.target.value)}
            placeholder="替换为..."
            className="flex-1 bg-transparent border-none outline-none text-xs py-2 px-2"
            style={{ color: 'var(--text-primary)' }}
            onKeyDown={(e) => { if (e.key === 'Enter' && query.trim() && replacement.trim()) handleReplaceAll() }} />
          <button onClick={handleReplaceAll} disabled={replacing || !query.trim() || !replacement.trim()}
            className="px-2.5 py-1 mr-1 text-[10px] font-medium rounded cursor-pointer disabled:opacity-40"
            style={{ background: 'var(--accent)', color: '#fff', border: 'none' }}>
            {replacing ? '替换中...' : '全部替换'}
          </button>
        </div>
      )}

      {/* Group toggle */}
      {results.length > 1 && (
        <div className="flex items-center gap-1 mt-1">
          <button
            onClick={() => setGrouped(!grouped)}
            className="text-[10px] px-2 py-0.5 rounded cursor-pointer"
            style={{ color: grouped ? 'var(--accent)' : 'var(--text-muted)' }}
          >
            {grouped ? '列表视图' : '按文件分组'}
          </button>
          {grouped && (
            <>
              <button onClick={() => setExpandedFiles(new Set(fileEntries.map(([f]) => f)))}
                className="text-[10px] px-2 py-0.5 rounded cursor-pointer"
                style={{ color: 'var(--text-muted)' }}>展开全部</button>
              <button onClick={() => setExpandedFiles(new Set())}
                className="text-[10px] px-2 py-0.5 rounded cursor-pointer"
                style={{ color: 'var(--text-muted)' }}>折叠全部</button>
            </>
          )}
        </div>
      )}

      {/* Results */}
      <div className="flex-1 overflow-y-auto mt-2 space-y-0.5">
        {!grouped ? (
          filteredResults.map((r, i) => (
            <button
              key={`${r.file}-${r.line}-${i}`}
              onClick={() => handleOpenFile(r.file, r.line)}
              className="w-full flex items-start gap-1.5 px-2 py-1 rounded text-[11px] text-left cursor-pointer hover:opacity-80"
              style={{ color: 'var(--text-secondary)' }}
            >
              <span className="text-[10px] font-mono shrink-0 pt-0.5" style={{ color: 'var(--text-muted)' }}>{r.line}</span>
              <span className="truncate flex-1">{r.content || '<empty>'}</span>
              <span className="text-[10px] shrink-0 max-w-[120px] truncate" style={{ color: 'var(--text-muted)' }}>
                {getFilename(r.file)}
              </span>
            </button>
          ))
        ) : (
          fileEntries.map(([file, matches]) => {
            const isExpanded = expandedFiles.has(file)
            return (
              <div key={file}>
                <button
                  onClick={() => toggleFile(file)}
                  className="w-full flex items-center gap-1 px-2 py-1 rounded text-[11px] cursor-pointer hover:opacity-80"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {isExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                  <File size={11} className="shrink-0" />
                  <span className="truncate flex-1">{getFilename(file)}</span>
                  <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{matches.length}</span>
                  {showReplace && replacement.trim() && (
                    <button onClick={(e) => { e.stopPropagation(); handleReplaceInFile(file) }}
                      disabled={replacingFile === file}
                      className="px-1.5 py-0.5 text-[9px] rounded cursor-pointer disabled:opacity-40 ml-1 font-medium"
                      style={{ background: 'var(--accent)', color: '#fff', border: 'none' }}>
                      {replacingFile === file ? '...' : '替换'}
                    </button>
                  )}
                </button>
                {isExpanded && matches.map((r, i) => (
                  <button
                    key={i}
                    onClick={() => handleOpenFile(r.file, r.line)}
                    className="w-full flex items-start gap-1.5 pl-7 pr-2 py-0.5 rounded text-[10px] text-left cursor-pointer hover:opacity-80"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <span className="font-mono shrink-0">{r.line}:</span>
                    <span className="truncate">{r.content || '<empty>'}</span>
                  </button>
                ))}
              </div>
            )
          })
        )}
        {!searching && query && results.length === 0 && (
          <p className="text-xs text-center py-8" style={{ color: 'var(--text-muted)' }}>无匹配结果</p>
        )}
        {!searching && query && results.length > 0 && filteredResults.length === 0 && (
          <p className="text-xs text-center py-8" style={{ color: 'var(--text-muted)' }}>筛选后无匹配结果</p>
        )}
      </div>
    </div>
  )
}
