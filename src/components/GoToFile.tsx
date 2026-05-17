import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, File, Loader2 } from 'lucide-react'
import { useStore } from '../stores/useStore'
import { listFiles, readFile } from '../lib/ipc'
import { logError } from '../lib/logger'
import { VirtualList } from './VirtualList'

const ROW_HEIGHT = 30

export default function GoToFile({ onClose }: { onClose: () => void }) {
  const workspacePath = useStore((s) => s.workspacePath)
  const openEditingFile = useStore((s) => s.openEditingFile)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState('')
  const [files, setFiles] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedIdx, setSelectedIdx] = useState(0)

  const walkDir = useCallback(async (dir: string): Promise<string[]> => {
    const EXCLUDED = new Set(['node_modules', '.git', 'target', '.next', 'dist', 'build', '.cache', '__pycache__', '.vscode', '.idea'])
    const results: string[] = []
    const stack = [dir]
    while (stack.length > 0) {
      const current = stack.pop()!
      try {
        const entries = await listFiles(current)
        for (const entry of entries) {
          if (entry.is_dir) {
            if (!EXCLUDED.has(entry.name)) stack.push(entry.path)
          } else {
            results.push(entry.path)
          }
        }
      } catch (err) { logError('GoToFile', 'walk dir failed', err) }
    }
    return results
  }, [])

  useEffect(() => {
    if (!workspacePath) return
    setLoading(true)
    walkDir(workspacePath).then((allFiles) => {
      setFiles(allFiles.sort())
      setLoading(false)
    }).catch((err) => { setLoading(false); logError('GoToFile', 'walk workspace failed', err) })
  }, [workspacePath, walkDir])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const filtered = query.trim()
    ? files.filter(f => {
        const name = f.split(/[/\\]/).pop()?.toLowerCase() || ''
        return name.includes(query.trim().toLowerCase())
      })
    : files

  const fileCount = filtered.length

  useEffect(() => {
    setSelectedIdx(0)
  }, [query])

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current || fileCount === 0) return
    const scrollTop = listRef.current.scrollTop
    const viewHeight = listRef.current.clientHeight
    const itemTop = selectedIdx * ROW_HEIGHT
    if (itemTop < scrollTop || itemTop + ROW_HEIGHT > scrollTop + viewHeight) {
      listRef.current.scrollTop = itemTop - viewHeight / 3
    }
  }, [selectedIdx, fileCount])

  const handleOpen = useCallback(async (path: string) => {
    try {
      const content = await readFile(path)
      openEditingFile({ path, content })
      onClose()
    } catch (err) { logError('GoToFile', 'open file failed', err) }
  }, [openEditingFile, onClose])

  const handleKeyDown = async (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { onClose(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, fileCount - 1)); return }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, 0)); return }
    if (e.key === 'Enter' && filtered[selectedIdx]) {
      await handleOpen(filtered[selectedIdx])
    }
  }

  if (!workspacePath) {
    return <div className="p-4 text-xs text-center" style={{ color: 'var(--text-muted)' }}>请先设置工作区</div>
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 px-3 py-2"
        style={{ borderBottom: '1px solid var(--border-color)' }}>
        <Search size={14} style={{ color: 'var(--text-muted)' }} />
        <input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="搜索文件名..."
          className="flex-1 bg-transparent border-none outline-none text-xs"
          style={{ color: 'var(--text-primary)' }} />
        {!loading && fileCount > 0 && (
          <span className="text-[10px] shrink-0" style={{ color: 'var(--text-muted)' }}>{fileCount} 文件</span>
        )}
      </div>
      <div className="max-h-80 overflow-y-auto" ref={listRef} style={{ minHeight: 100 }}>
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 size={14} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
          </div>
        ) : fileCount === 0 ? (
          <p className="text-xs text-center py-4" style={{ color: 'var(--text-muted)' }}>无匹配文件</p>
        ) : (
          <VirtualList
            items={filtered}
            itemHeight={ROW_HEIGHT}
            maxHeight={320}
            keyExtractor={(f) => f}
            renderItem={(f, i) => {
              const name = f.split(/[/\\]/).pop() || f
              const dir = f.substring(0, f.length - name.length).replace(workspacePath, '').replace(/^[/\\]/, '')
              return (
                <button key={f} onClick={() => handleOpen(f)}
                  className="w-full flex items-center gap-2 px-3 text-xs text-left cursor-pointer hover:opacity-80"
                  style={{
                    height: ROW_HEIGHT,
                    color: 'var(--text-secondary)',
                    background: selectedIdx === i ? 'var(--accent-bg)' : 'transparent',
                  }}>
                  <File size={12} className="shrink-0" style={{ color: 'var(--text-muted)' }} />
                  <span className="truncate flex-1">{name}</span>
                  {dir && <span className="text-[10px] truncate max-w-[150px]" style={{ color: 'var(--text-muted)' }}>{dir}</span>}
                </button>
              )
            }}
          />
        )}
      </div>
    </div>
  )
}
