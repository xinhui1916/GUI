import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { ChevronRight, ChevronDown, File, Folder, FolderOpen, Search, X, RefreshCw, Loader2, FileCode, FileJson, FileText, Image, Terminal, Settings, Lock, Globe, FileTypeIcon, Braces, Palette } from 'lucide-react'
import { useStore } from '../stores/useStore'
import { useToastStore } from '../stores/toastStore'
import { listFiles, readFile, getGitStatus, startFileWatcher, stopFileWatcher, onFileChanged } from '../lib/ipc'
import { logError } from '../lib/logger'

// ── File type icon mapping ────────────────────────────────────────────

interface FileTypeInfo {
  icon: any
  color: string
}

const FILE_TYPE_MAP: Record<string, FileTypeInfo> = {
  ts: { icon: FileCode, color: '#3178c6' },
  tsx: { icon: FileCode, color: '#3178c6' },
  js: { icon: FileCode, color: '#f7df1e' },
  jsx: { icon: FileCode, color: '#f7df1e' },
  mjs: { icon: FileCode, color: '#f7df1e' },
  cjs: { icon: FileCode, color: '#f7df1e' },
  json: { icon: FileJson, color: '#89e051' },
  jsonc: { icon: FileJson, color: '#89e051' },
  css: { icon: FileTypeIcon, color: '#42a5f5' },
  scss: { icon: FileTypeIcon, color: '#c6538c' },
  less: { icon: FileTypeIcon, color: '#1d7db7' },
  html: { icon: Globe, color: '#e34f26' },
  htm: { icon: Globe, color: '#e34f26' },
  md: { icon: FileText, color: '#9e9e9e' },
  mdx: { icon: FileText, color: '#9e9e9e' },
  rs: { icon: Terminal, color: '#dea584' },
  py: { icon: FileCode, color: '#3572a5' },
  rb: { icon: FileCode, color: '#cc342d' },
  go: { icon: Terminal, color: '#00add8' },
  java: { icon: FileCode, color: '#b07219' },
  c: { icon: FileCode, color: '#555555' },
  cpp: { icon: FileCode, color: '#f34b7d' },
  h: { icon: FileCode, color: '#555555' },
  toml: { icon: Settings, color: '#9e9e9e' },
  yml: { icon: Settings, color: '#9e9e9e' },
  yaml: { icon: Settings, color: '#9e9e9e' },
  png: { icon: Image, color: '#81b622' },
  jpg: { icon: Image, color: '#81b622' },
  jpeg: { icon: Image, color: '#81b622' },
  gif: { icon: Image, color: '#81b622' },
  svg: { icon: Image, color: '#ffb13b' },
  ico: { icon: Image, color: '#81b622' },
  lock: { icon: Lock, color: '#9e9e9e' },
  zip: { icon: FileCode, color: '#9e9e9e' },
  tar: { icon: FileCode, color: '#9e9e9e' },
  gz: { icon: FileCode, color: '#9e9e9e' },
  pdf: { icon: FileText, color: '#ec1c24' },
  sh: { icon: Terminal, color: '#89e051' },
  bat: { icon: Terminal, color: '#c1f12e' },
  ps1: { icon: Terminal, color: '#012456' },
  sql: { icon: FileCode, color: '#e38c00' },
  graphql: { icon: Braces, color: '#e535ab' },
  svelte: { icon: FileCode, color: '#ff3e00' },
  vue: { icon: FileCode, color: '#4fc08d' },
  swift: { icon: FileCode, color: '#f05138' },
  kt: { icon: FileCode, color: '#a97bff' },
  dart: { icon: Terminal, color: '#00b4ab' },
  wasm: { icon: Terminal, color: '#654ff0' },
  xml: { icon: FileCode, color: '#9e9e9e' },
  plist: { icon: FileCode, color: '#9e9e9e' },
}

function getFileTypeInfo(filename: string): FileTypeInfo | null {
  const dot = filename.lastIndexOf('.')
  if (dot < 0) return null
  const ext = filename.slice(dot + 1).toLowerCase()
  return FILE_TYPE_MAP[ext] || null
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

// ── Types ─────────────────────────────────────────────────────────────

interface FileEntry {
  name: string
  path: string
  is_dir: boolean
}

interface GitFileStatus {
  modified: Set<string>
  added: Set<string>
  deleted: Set<string>
  untracked: Set<string>
}

function getStatusColor(
  filePath: string,
  workspacePath: string,
  gitStatus: GitFileStatus | null,
): string | null {
  if (!gitStatus) return null
  const rel = filePath.replace(workspacePath, '').replace(/^[/\\]/, '')
  if (gitStatus.modified.has(rel)) return 'var(--accent)'
  if (gitStatus.added.has(rel)) return '#10b981'
  if (gitStatus.deleted.has(rel)) return '#ef4444'
  if (gitStatus.untracked.has(rel)) return '#f59e0b'
  return null
}

interface TreeNode {
  name: string
  path: string
  is_dir: boolean
  children: TreeNode[]
  depth: number
}

type SortMode = 'name' | 'type'

function buildTree(entries: FileEntry[], workspacePath: string, sortMode: SortMode): TreeNode[] {
  const root: TreeNode[] = []
  const map = new Map<string, TreeNode>()

  for (const entry of entries) {
    const rel = entry.path.replace(workspacePath, '').replace(/^[/\\]/, '')
    const parts = rel.split(/[/\\]/)
    let currentPath = workspacePath
    let parentList = root

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const isLast = i === parts.length - 1
      const childPath = currentPath + '\\' + part

      let node = map.get(childPath)
      if (!node) {
        node = {
          name: part,
          path: childPath,
          is_dir: !isLast || entry.is_dir,
          children: [],
          depth: i,
        }
        map.set(childPath, node)
        parentList.push(node)
      }
      if (isLast && !entry.is_dir) {
        node.is_dir = false
      }
      parentList = node.children
      currentPath = childPath
    }
  }

  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1
      if (sortMode === 'type') {
        const extA = a.name.lastIndexOf('.') >= 0 ? a.name.slice(a.name.lastIndexOf('.') + 1) : ''
        const extB = b.name.lastIndexOf('.') >= 0 ? b.name.slice(b.name.lastIndexOf('.') + 1) : ''
        if (extA !== extB) return extA.localeCompare(extB)
      }
      return a.name.localeCompare(b.name)
    })
    for (const node of nodes) {
      if (node.children.length > 0) sortNodes(node.children)
    }
  }
  sortNodes(root)
  return root
}

// ── FileTreeNode ──────────────────────────────────────────────────────

function FileIcon({ name, isDir, expanded, size }: { name: string; isDir: boolean; expanded: boolean; size?: number }) {
  const s = size || 12
  if (isDir) {
    const IconCmp = expanded ? FolderOpen : Folder
    return <IconCmp size={s} className="shrink-0" style={{ color: 'var(--accent)' }} />
  }
  const info = getFileTypeInfo(name)
  if (info) {
    const IconCmp = info.icon
    return <IconCmp size={s} className="shrink-0" style={{ color: info.color }} />
  }
  // Hidden files (starting with .) get muted color
  if (name.startsWith('.')) {
    return <File size={s} className="shrink-0" style={{ color: 'var(--text-muted)', opacity: 0.5 }} />
  }
  return <File size={s} className="shrink-0" style={{ color: 'var(--text-muted)' }} />
}

function FileTreeNode({
  node,
  workspacePath,
  gitStatus,
  filter,
  showHidden,
  expandedSet,
  toggleExpand,
  onOpen,
}: {
  node: TreeNode
  workspacePath: string
  gitStatus: GitFileStatus | null
  filter: string
  showHidden: boolean
  expandedSet: Set<string>
  toggleExpand: (path: string) => void
  onOpen: (path: string) => void
}) {
  const isExpanded = expandedSet.has(node.path)
  const statusColor = node.is_dir ? null : getStatusColor(node.path, workspacePath, gitStatus)

  // Hidden file filter
  if (!showHidden && !filter && node.name.startsWith('.') && !node.is_dir) return null
  if (!showHidden && !filter && node.name.startsWith('.') && node.is_dir && node.depth === 0) return null

  // Filter matching
  const filterMatch = filter ? node.name.toLowerCase().includes(filter.toLowerCase()) : true
  const hasFilterMatch = useMemo(() => {
    if (!filter || filterMatch) return true
    if (!node.is_dir) return false
    return hasChildMatching(node, filter)
  }, [node, filter, filterMatch])

  if (filter && !hasFilterMatch) return null

  return (
    <div>
      <button
        onClick={() => {
          if (node.is_dir) {
            toggleExpand(node.path)
          } else {
            onOpen(node.path)
          }
        }}
        className="w-full flex items-center gap-1 px-1 py-[3px] text-[11px] text-left cursor-pointer rounded hover:opacity-80 group"
        style={{
          color: 'var(--text-secondary)',
          paddingLeft: 4 + node.depth * 14,
          background: statusColor ? 'var(--accent-bg)' : 'transparent',
        }}
        title={node.path}
      >
        {node.is_dir ? (
          <>
            {isExpanded
              ? <ChevronDown size={9} className="shrink-0" style={{ color: 'var(--text-muted)', opacity: 0.6 }} />
              : <ChevronRight size={9} className="shrink-0" style={{ color: 'var(--text-muted)', opacity: 0.6 }} />}
            <FileIcon name={node.name} isDir expanded={isExpanded} />
          </>
        ) : (
          <>
            <span className="w-[9px] shrink-0" />
            <FileIcon name={node.name} isDir={false} />
          </>
        )}
        <span className="truncate flex-1 ml-1" style={{ color: statusColor || 'var(--text-secondary)' }}>{node.name}</span>
        {statusColor && (
          <span className="w-[6px] h-[6px] rounded-full shrink-0 mr-0.5" style={{ background: statusColor }} />
        )}
      </button>
      {node.is_dir && isExpanded && (
        <div>
          {node.children.length === 0 ? (
            <div className="text-[10px] px-2 py-0.5" style={{ paddingLeft: 16 + node.depth * 14, color: 'var(--text-muted)' }}>
              (空)
            </div>
          ) : (
            node.children.map((child) => (
              <FileTreeNode
                key={child.path}
                node={child}
                workspacePath={workspacePath}
                gitStatus={gitStatus}
                filter={filter}
                showHidden={showHidden}
                expandedSet={expandedSet}
                toggleExpand={toggleExpand}
                onOpen={onOpen}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}

function hasChildMatching(node: TreeNode, filter: string): boolean {
  if (node.name.toLowerCase().includes(filter.toLowerCase())) return true
  if (node.is_dir) {
    for (const child of node.children) {
      if (hasChildMatching(child, filter)) return true
    }
  }
  return false
}

// ── Main FileExplorer ─────────────────────────────────────────────────

export default function FileExplorer() {
  const workspacePath = useStore((s) => s.workspacePath)
  const openEditingFile = useStore((s) => s.openEditingFile)
  const addToast = useToastStore((s) => s.addToast)

  const [entries, setEntries] = useState<FileEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('')
  const [expandedSet, setExpandedSet] = useState<Set<string>>(new Set())
  const [gitStatus, setGitStatus] = useState<GitFileStatus | null>(null)
  const [showHidden, setShowHidden] = useState(false)
  const [sortMode, setSortMode] = useState<SortMode>('name')
  const refreshVersion = useRef(0)
  const watcherStarted = useRef(false)
  const pendingRefresh = useRef<ReturnType<typeof setTimeout> | null>(null)
  const unlistenFileChange = useRef<(() => void) | null>(null)

  const refreshFiles = useCallback(async () => {
    if (!workspacePath) return
    const version = ++refreshVersion.current
    setLoading(true)
    const EXCLUDED = new Set(['node_modules', '.git', 'target', '.next', 'dist', 'build', '.cache', '__pycache__', '.vscode', '.idea'])
    try {
      const allEntries: FileEntry[] = []
      const stack = [workspacePath]
      while (stack.length > 0) {
        const current = stack.pop()!
        const files = await listFiles(current)
        for (const entry of files) {
          allEntries.push(entry)
          if (entry.is_dir && !EXCLUDED.has(entry.name)) {
            stack.push(entry.path)
          }
        }
      }
      // Dedup: only update if still the latest invocation
      if (version === refreshVersion.current) {
        setEntries(allEntries)
      }
    } catch (err) { logError('FileExplorer', 'walk directory failed', err) }
    if (version === refreshVersion.current) {
      setLoading(false)
    }
  }, [workspacePath])

  const refreshGitStatus = useCallback(async () => {
    if (!workspacePath) return
    try {
      const status = await getGitStatus(workspacePath)
      if (status) {
        const modified = new Set<string>()
        const added = new Set<string>()
        const deleted = new Set<string>()
        const untracked = new Set<string>()
        for (const c of status.changes) {
          const st = c.status.trim()
          if (st === 'M') modified.add(c.path)
          else if (st === 'A') added.add(c.path)
          else if (st === 'D') deleted.add(c.path)
          else if (st === '??') untracked.add(c.path)
        }
        setGitStatus({ modified, added, deleted, untracked })
      }
    } catch (err) { logError('FileExplorer', 'get git status failed', err) }
  }, [workspacePath])

  useEffect(() => {
    if (!workspacePath) return

    refreshFiles()
    refreshGitStatus()

    // Start file watcher for auto-refresh
    watcherStarted.current = false
    unlistenFileChange.current = null

    async function setupWatcher() {
      if (watcherStarted.current) return
      try {
        await startFileWatcher(workspacePath)
        watcherStarted.current = true

        const unlisten = await onFileChanged(() => {
          if (pendingRefresh.current) clearTimeout(pendingRefresh.current)
          pendingRefresh.current = setTimeout(() => {
            refreshFiles()
            refreshGitStatus()
          }, 500)
        })
        unlistenFileChange.current = unlisten
      } catch {
        // watcher not critical — fall back to manual refresh
      }
    }

    setupWatcher()

    return () => {
      // Cleanup watcher
      if (unlistenFileChange.current) {
        unlistenFileChange.current()
        unlistenFileChange.current = null
      }
      watcherStarted.current = false
      stopFileWatcher(workspacePath).catch(() => {})
      if (pendingRefresh.current) {
        clearTimeout(pendingRefresh.current)
        pendingRefresh.current = null
      }
    }
  }, [workspacePath, refreshFiles, refreshGitStatus])

  const tree = useMemo(() => buildTree(entries, workspacePath, sortMode), [entries, workspacePath, sortMode])

  // Filter auto-expand
  useEffect(() => {
    if (filter.trim()) {
      const all = new Set<string>()
      const collect = (nodes: TreeNode[]) => {
        for (const node of nodes) {
          if (node.is_dir && hasChildMatching(node, filter)) {
            all.add(node.path)
            collect(node.children)
          }
        }
      }
      collect(tree)
      setExpandedSet(all)
    }
  }, [filter, tree])

  const toggleExpand = useCallback((path: string) => {
    setExpandedSet((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  const handleOpen = useCallback(async (path: string) => {
    try {
      const content = await readFile(path)
      openEditingFile({ path, content })
    } catch (err) {
      logError('FileExplorer', 'open file failed', err)
      addToast({ type: 'error', title: '打开文件失败', message: path, duration: 2000 })
    }
  }, [openEditingFile, addToast])

  if (!workspacePath) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-xs" style={{ color: 'var(--text-muted)' }}>
        <FolderOpen size={24} className="mb-2" style={{ opacity: 0.3 }} />
        <p>请先设置工作区</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-1 mb-1.5">
        <div className="flex items-center flex-1 gap-1 px-2 py-1 rounded"
          style={{ border: '1px solid var(--border-color)', background: 'var(--input-bg)' }}>
          <Search size={11} style={{ color: 'var(--text-muted)' }} />
          <input value={filter} onChange={(e) => setFilter(e.target.value)}
            placeholder="筛选文件..."
            className="flex-1 bg-transparent border-none outline-none text-[11px]"
            style={{ color: 'var(--text-primary)' }} />
          {filter && (
            <button onClick={() => setFilter('')} className="p-0.5 cursor-pointer hover:opacity-70"
              style={{ color: 'var(--text-muted)' }}>
              <X size={10} />
            </button>
          )}
        </div>
        <button onClick={() => setShowHidden(!showHidden)}
          className="p-1.5 rounded cursor-pointer hover:opacity-70"
          style={{ color: showHidden ? 'var(--accent)' : 'var(--text-muted)', opacity: showHidden ? 1 : 0.5 }}
          title={showHidden ? '隐藏隐藏文件' : '显示隐藏文件'}>
          <FileCode size={11} />
        </button>
        <button onClick={() => { refreshFiles(); refreshGitStatus() }}
          className="p-1.5 rounded cursor-pointer hover:opacity-70"
          style={{ color: 'var(--text-muted)' }} title="刷新">
          <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Sort bar */}
      <div className="flex items-center gap-2 px-1 mb-1">
        <button onClick={() => setSortMode('name')}
          className="text-[9px] px-1.5 py-0.5 rounded cursor-pointer"
          style={{
            color: sortMode === 'name' ? 'var(--accent)' : 'var(--text-muted)',
            background: sortMode === 'name' ? 'var(--accent-bg)' : 'transparent',
          }}>名称</button>
        <button onClick={() => setSortMode('type')}
          className="text-[9px] px-1.5 py-0.5 rounded cursor-pointer"
          style={{
            color: sortMode === 'type' ? 'var(--accent)' : 'var(--text-muted)',
            background: sortMode === 'type' ? 'var(--accent-bg)' : 'transparent',
          }}>类型</button>
        <div className="flex-1" />
      </div>

      {/* File tree */}
      <div className="flex-1 overflow-y-auto" style={{ scrollBehavior: 'smooth' }}>
        {loading && entries.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={14} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
          </div>
        ) : tree.length === 0 ? (
          <p className="text-xs text-center py-8" style={{ color: 'var(--text-muted)' }}>空目录</p>
        ) : (
          tree.map((node) => (
            <FileTreeNode
              key={node.path}
              node={node}
              workspacePath={workspacePath}
              gitStatus={gitStatus}
              filter={filter}
              showHidden={showHidden}
              expandedSet={expandedSet}
              toggleExpand={toggleExpand}
              onOpen={handleOpen}
            />
          ))
        )}
      </div>

      {/* Status bar */}
      {entries.length > 0 && (
        <div className="flex items-center gap-2 px-1 pt-1.5 mt-1 text-[9px]" style={{ borderTop: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
          <span>{entries.filter(e => !e.is_dir).length} 文件</span>
          {gitStatus && (
            <div className="flex items-center gap-1.5 ml-1">
              {gitStatus.modified.size > 0 && <span style={{ color: 'var(--accent)' }}>● {gitStatus.modified.size}</span>}
              {gitStatus.added.size > 0 && <span style={{ color: '#10b981' }}>● {gitStatus.added.size}</span>}
              {gitStatus.deleted.size > 0 && <span style={{ color: '#ef4444' }}>● {gitStatus.deleted.size}</span>}
              {gitStatus.untracked.size > 0 && <span style={{ color: '#f59e0b' }}>● {gitStatus.untracked.size}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
