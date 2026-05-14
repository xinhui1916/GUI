import { useEffect, useState, type ChangeEvent } from 'react'
import { ChevronRight, ChevronDown, File, Folder, FolderOpen, FolderKanban } from 'lucide-react'
import { useStore } from '../stores/useStore'
import { listFiles, type FileEntry } from '../lib/ipc'

const tabs = [
  { id: 'files' as const, label: '文件' },
  { id: 'tools' as const, label: '工具' },
  { id: 'info' as const, label: '信息' },
]

const tools = [
  { name: 'Edit', desc: '创建或修改文件' },
  { name: 'Grep', desc: '搜索项目代码' },
  { name: 'Bash', desc: '执行 shell 命令' },
  { name: 'WebFetch', desc: '抓取网页内容' },
]

function FileRow({ entry, depth }: { entry: FileEntry; depth: number }) {
  const [expanded, setExpanded] = useState(false)
  const [children, setChildren] = useState<FileEntry[] | null>(null)
  const [loading, setLoading] = useState(false)

  const toggle = async () => {
    if (!entry.is_dir) return
    setExpanded(!expanded)
    if (children === null) {
      setLoading(true)
      const kids = await listFiles(entry.path).catch(() => [])
      setChildren(kids)
      setLoading(false)
    }
  }

  return (
    <div>
      <div
        onClick={toggle}
        className="flex items-center gap-1.5 py-1 px-2 rounded cursor-pointer text-xs transition-colors hover:opacity-80"
        style={{ paddingLeft: 8 + depth * 16, color: 'var(--text-secondary)' }}
      >
        {entry.is_dir ? (
          <>
            {loading ? (
              <span className="text-[10px] w-4 text-center" style={{ color: 'var(--text-muted)' }}>...</span>
            ) : expanded ? (
              <ChevronDown size={14} className="shrink-0" />
            ) : (
              <ChevronRight size={14} className="shrink-0" />
            )}
            {expanded ? <FolderOpen size={14} className="shrink-0" /> : <Folder size={14} className="shrink-0" />}
          </>
        ) : (
          <>
            <span className="w-4" />
            <File size={14} className="shrink-0" />
          </>
        )}
        <span className="truncate" style={{ color: 'var(--text-primary)' }}>{entry.name}</span>
      </div>
      {expanded && children?.map((child, i) => (
        <FileRow key={i} entry={child} depth={depth + 1} />
      ))}
    </div>
  )
}

function WorkspaceSettings() {
  const workspacePath = useStore((s) => s.workspacePath)
  const setWorkspacePath = useStore((s) => s.setWorkspacePath)
  const [input, setInput] = useState(workspacePath)
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const handleSet = async () => {
    const trimmed = input.trim()
    if (!trimmed) return
    setStatus('loading')
    setErrorMsg('')
    try {
      await setWorkspacePath(trimmed)
      setStatus('done')
    } catch (e: any) {
      setStatus('error')
      setErrorMsg(typeof e === 'string' ? e : e?.message || '设置失败')
    }
  }

  const handleClear = () => {
    setInput('')
    setWorkspacePath('')
    setStatus('idle')
    setErrorMsg('')
  }

  const handleInput = (e: ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value)
    if (status === 'done' || status === 'error') setStatus('idle')
  }

  return (
    <div className="space-y-2">
      <input
        type="text"
        value={input}
        onChange={handleInput}
        placeholder="粘贴项目目录路径..."
        className="w-full px-2 py-1.5 text-xs rounded border"
        style={{
          background: 'var(--input-bg)',
          border: '1px solid var(--border-color)',
          color: 'var(--text-primary)',
          outline: 'none',
        }}
      />
      <div className="flex gap-2">
        <button
          onClick={handleSet}
          disabled={status === 'loading' || !input.trim()}
          className="flex-1 py-1.5 text-xs font-medium rounded cursor-pointer transition-colors disabled:opacity-40"
          style={{
            background: 'var(--accent)',
            color: '#fff',
            border: 'none',
          }}
        >
          {status === 'loading' ? '读取中...' : '设置工作区'}
        </button>
        {workspacePath && (
          <button
            onClick={handleClear}
            className="px-3 py-1.5 text-xs rounded cursor-pointer transition-colors"
            style={{
              background: 'transparent',
              border: '1px solid var(--border-color)',
              color: 'var(--text-secondary)',
            }}
          >
            清除
          </button>
        )}
      </div>
      {status === 'done' && workspacePath && (
        <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--accent)' }}>
          <span>●</span>
          <span className="truncate flex-1">{workspacePath}</span>
        </div>
      )}
      {status === 'error' && (
        <p className="text-xs" style={{ color: 'var(--danger, #ef4444)' }}>{errorMsg}</p>
      )}
    </div>
  )
}

export default function RightPanel() {
  const rightTab = useStore((s) => s.rightTab)
  const setRightTab = useStore((s) => s.setRightTab)
  const msgCount = useStore((s) => s.messages[s.activeSessionId]?.length ?? 0)
  const workspacePath = useStore((s) => s.workspacePath)
  const [rootFiles, setRootFiles] = useState<FileEntry[]>([])
  const [rootPath, setRootPath] = useState('')

  useEffect(() => {
    const dir = workspacePath || 'C:\\Users\\Administrator\\Desktop\\claude-desktop'
    setRootPath(dir)
    listFiles(dir).then(setRootFiles).catch(() => setRootFiles([]))
  }, [workspacePath])

  return (
    <div
      className="w-72 flex flex-col shrink-0"
      style={{ background: 'var(--sidebar-bg)', borderLeft: '1px solid var(--border-color)' }}
    >
      {/* Tabs */}
      <div className="flex" style={{ borderBottom: '1px solid var(--border-color)' }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setRightTab(tab.id)}
            className="flex-1 py-2.5 text-xs font-medium cursor-pointer transition-colors"
            style={{
              color: rightTab === tab.id ? 'var(--tab-active)' : 'var(--tab-inactive)',
              borderBottom: rightTab === tab.id ? '2px solid var(--accent)' : '2px solid transparent',
              background: rightTab === tab.id ? 'var(--accent-bg)' : 'transparent',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {rightTab === 'files' && (
          <div>
            <div className="mb-3 px-1">
              <h4 className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--panel-header)' }}>
                项目文件
              </h4>
              {rootPath && (
                <p className="text-[10px] mb-2 truncate" style={{ color: 'var(--text-muted)' }}>{rootPath}</p>
              )}
            </div>
            {rootFiles.length > 0 ? (
              rootFiles.map((entry, i) => (
                <FileRow key={i} entry={entry} depth={0} />
              ))
            ) : (
              <p className="text-xs text-center py-8" style={{ color: 'var(--text-muted)' }}>
                正在加载文件...
              </p>
            )}
          </div>
        )}

        {rightTab === 'tools' && (
          <div>
            <h4 className="text-[11px] font-semibold uppercase tracking-wide mb-2 px-1" style={{ color: 'var(--panel-header)' }}>
              可用工具
            </h4>
            {tools.map((tool) => (
              <div
                key={tool.name}
                className="p-2.5 rounded-lg mb-1.5 text-xs"
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)',
                }}
              >
                <div className="font-medium mb-0.5">{tool.name}</div>
                <div style={{ color: 'var(--text-muted)' }}>{tool.desc}</div>
              </div>
            ))}
          </div>
        )}

        {rightTab === 'info' && (
          <div>
            <h4 className="text-[11px] font-semibold uppercase tracking-wide mb-2 px-1" style={{ color: 'var(--panel-header)' }}>
              会话信息
            </h4>
            <div className="text-xs space-y-2 px-1" style={{ color: 'var(--text-secondary)' }}>
              <div>
                <span className="font-medium" style={{ color: 'var(--text-primary)' }}>模型:</span>
                <br />DeepSeek V4 Flash
              </div>
              <div>
                <span className="font-medium" style={{ color: 'var(--text-primary)' }}>消息数:</span>
                <br />{msgCount} 条
              </div>
            </div>

            <hr className="my-3" style={{ borderColor: 'var(--border-color)' }} />

            <div className="px-1">
              <h4 className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--panel-header)' }}>
                <FolderKanban size={12} className="inline mr-1" style={{ color: 'var(--accent)' }} />
                工作区
              </h4>
              <WorkspaceSettings />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
