import { useState, useEffect, useMemo } from 'react'
import { History, RefreshCw, FileCode, FileJson, FileText, Image, Terminal } from 'lucide-react'
import { useStore } from '../stores/useStore'
import { useToastStore } from '../stores/toastStore'
import { logError } from '../lib/logger'

interface FileEntry {
  name: string
  path: string
  modified_ago: number
}

const FILE_TYPE_MAP: Record<string, { icon: any; color: string }> = {
  ts: { icon: FileCode, color: '#3178c6' },
  tsx: { icon: FileCode, color: '#3178c6' },
  js: { icon: FileCode, color: '#f7df1e' },
  jsx: { icon: FileCode, color: '#f7df1e' },
  json: { icon: FileJson, color: '#89e051' },
  css: { icon: FileCode, color: '#42a5f5' },
  rs: { icon: Terminal, color: '#dea584' },
  py: { icon: FileCode, color: '#3572a5' },
  md: { icon: FileText, color: '#9e9e9e' },
  png: { icon: Image, color: '#81b622' },
  jpg: { icon: Image, color: '#81b622' },
  svg: { icon: Image, color: '#ffb13b' },
  html: { icon: FileCode, color: '#e34f26' },
}

function getFileIcon(name: string, size?: number) {
  const dot = name.lastIndexOf('.')
  const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : ''
  const info = FILE_TYPE_MAP[ext]
  const s = size || 11
  if (info) {
    const IconCmp = info.icon
    return <IconCmp size={s} style={{ color: info.color }} />
  }
  return <FileCode size={s} style={{ color: 'var(--text-muted)' }} />
}

function formatTime(secs: number): string {
  if (secs < 60) return '刚才'
  if (secs < 3600) return `${Math.floor(secs / 60)} 分钟前`
  if (secs < 86400) return `${Math.floor(secs / 3600)} 小时前`
  if (secs < 604800) return `${Math.floor(secs / 86400)} 天前`
  return `${Math.floor(secs / 86400)} 天前`
}

function getTimeGroup(secs: number): string {
  if (secs < 3600) return '最近一小时'
  if (secs < 86400) return '今天'
  if (secs < 172800) return '昨天'
  if (secs < 604800) return '本周'
  if (secs < 2592000) return '本月'
  return '更早'
}

function getTimeGroupWeight(secs: number): number {
  if (secs < 3600) return 0
  if (secs < 86400) return 1
  if (secs < 172800) return 2
  if (secs < 604800) return 3
  if (secs < 2592000) return 4
  return 5
}

// Activity bar width: more recent = wider bar
function getActivityBar(secs: number): number {
  if (secs < 300) return 100  // 5 min
  if (secs < 3600) return 80   // 1 hour
  if (secs < 86400) return 60  // 1 day
  if (secs < 604800) return 40 // 1 week
  return 20
}

function getActivityColor(secs: number): string {
  if (secs < 300) return 'var(--accent)'
  if (secs < 3600) return '#10b981'
  if (secs < 86400) return '#f59e0b'
  return 'var(--text-muted)'
}

export default function TimelinePanel() {
  const workspacePath = useStore((s) => s.workspacePath)
  const openFile = useStore((s) => s.openEditingFile)
  const addToast = useToastStore((s) => s.addToast)
  const [files, setFiles] = useState<FileEntry[]>([])
  const [loading, setLoading] = useState(false)

  const loadHistory = async () => {
    if (!workspacePath) return
    setLoading(true)
    try {
      const { getFileHistory } = await import('../lib/ipc')
      const entries = await getFileHistory(workspacePath, 50)
      setFiles(entries)
    } catch (err) {
      logError('TimelinePanel', 'load file history failed', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!workspacePath) return
    loadHistory()
  }, [workspacePath])

  const handleOpen = async (file: FileEntry) => {
    try {
      const { readFile } = await import('../lib/ipc')
      const content = await readFile(file.path)
      openFile({ path: file.path, content })
    } catch (err) { logError('TimelinePanel', 'open file failed', err) }
    addToast({ type: 'info', title: '已打开文件', message: file.name, duration: 2000 })
  }

  // Group files by time
  const groupedFiles = useMemo(() => {
    const groups = new Map<string, FileEntry[]>()
    for (const file of files) {
      const group = getTimeGroup(file.modified_ago)
      const existing = groups.get(group) || []
      existing.push(file)
      groups.set(group, existing)
    }
    // Sort groups by time weight
    const sorted = Array.from(groups.entries()).sort((a, b) => {
      return getTimeGroupWeight(a[1][0].modified_ago) - getTimeGroupWeight(b[1][0].modified_ago)
    })
    return sorted
  }, [files])

  return (
    <div className="flex flex-col h-full text-xs">
      <div className="flex items-center justify-between px-2 py-1.5 font-semibold shrink-0" style={{ color: 'var(--panel-header)', borderBottom: '1px solid var(--border-color)' }}>
        <span className="flex items-center gap-1.5">
          <History size={12} style={{ color: 'var(--accent)' }} />
          文件历史
        </span>
        {workspacePath && (
          <button onClick={loadHistory} disabled={loading} className="p-0.5 cursor-pointer hover:opacity-70" style={{ color: 'var(--text-muted)' }}>
            <RefreshCw size={10} className={loading ? 'animate-spin' : ''} />
          </button>
        )}
      </div>

      {!workspacePath ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>请先设置工作区</p>
        </div>
      ) : files.length === 0 && !loading ? (
        <div className="flex-1 flex flex-col items-center justify-center" style={{ color: 'var(--text-muted)' }}>
          <History size={28} style={{ opacity: 0.2 }} />
          <p className="text-xs mt-2">没有最近修改的文件</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto py-1">
          {loading && (
            <div className="flex items-center justify-center py-4">
              <RefreshCw size={12} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
            </div>
          )}

          {/* Visual timeline */}
          {groupedFiles.map(([group, groupFiles]) => (
            <div key={group}>
              {/* Group header */}
              <div className="flex items-center gap-2 px-3 py-1.5" style={{ background: 'var(--bg-elevated)' }}>
                <div className="w-[9px] h-[9px] rounded-full shrink-0" style={{
                  background: group === '最近一小时' ? 'var(--accent)' :
                    group === '今天' ? '#10b981' :
                    group === '昨天' ? '#f59e0b' :
                    group === '本周' ? '#8b5cf6' : 'var(--text-muted)',
                  opacity: 0.8,
                }} />
                <span className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>{group}</span>
                <span className="text-[9px] ml-auto" style={{ color: 'var(--text-muted)', opacity: 0.5 }}>{groupFiles.length}</span>
              </div>

              {/* Files in group */}
              {groupFiles.map((file, i) => {
                const barWidth = getActivityBar(file.modified_ago)
                const barColor = getActivityColor(file.modified_ago)
                return (
                  <div
                    key={`${file.path}-${i}`}
                    onClick={() => handleOpen(file)}
                    className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:opacity-80 transition-all group"
                    style={{
                      borderLeft: '2px solid transparent',
                    }}
                  >
                    {/* Timeline connector */}
                    <div className="relative flex items-center justify-center w-[9px] shrink-0">
                      <div className="w-[1px] h-full absolute top-0" style={{ background: 'var(--border-color)' }} />
                    </div>

                    {/* Icon */}
                    <span className="shrink-0 w-4 flex justify-center">
                      {getFileIcon(file.name)}
                    </span>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-[11px]" style={{ color: 'var(--text-primary)' }}>{file.name}</span>
                        {/* Activity bar */}
                        <div className="h-1.5 rounded-full shrink-0 transition-all" style={{
                          width: barWidth,
                          background: barColor,
                          opacity: 0.4,
                        }} />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-mono truncate" style={{ color: 'var(--text-muted)', opacity: 0.7 }}>{file.path}</span>
                      </div>
                    </div>

                    {/* Relative time badge */}
                    <span className="text-[9px] shrink-0 px-1.5 py-0.5 rounded" style={{
                      color: barColor,
                      background: `${barColor}15`,
                    }}>
                      {formatTime(file.modified_ago)}
                    </span>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
