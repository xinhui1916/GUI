import { useState, useMemo, type ChangeEvent } from 'react'
import {
  FolderKanban, Clock, Search, FileCode, Play, AlertTriangle, Files, Activity,
  MessageSquare, Plus, Archive,
} from 'lucide-react'
import { useStore } from '../stores/useStore'
import { useToastStore } from '../stores/toastStore'
import Fuse from 'fuse.js'
import TerminalPanel from './TerminalPanel'
import FileSearch from './FileSearch'
import ProblemsPanel from './ProblemsPanel'
import OutputPanel from './OutputPanel'
import SnippetsPanel from './SnippetsPanel'
import ExtensionManager from './ExtensionManager'
import DebugToolbar from './DebugToolbar'
import { useDebugEvents } from '../hooks/useDebugEvents'
import DebugVariables from './DebugVariables'
import DebugWatch from './DebugWatch'
import DebugCallStack from './DebugCallStack'
import BreakpointPanel from './BreakpointPanel'
import DebugConsole from './DebugConsole'
import LaunchConfigEditor from './LaunchConfigEditor'
import TasksPanel from './TasksPanel'
import TimelinePanel from './TimelinePanel'
import NpmScriptsPanel from './NpmScriptsPanel'
import TodoViewer from './TodoViewer'
import FileExplorer from './FileExplorer'
import DiagnosticPanel from './DiagnosticPanel'
import SessionItem from './SessionItem'

const tabs = [
  { id: 'sessions' as const, label: '会话' },
  { id: 'files' as const, label: '文件' },
  { id: 'search' as const, label: '搜索' },
  { id: 'tools' as const, label: '工具' },
  { id: 'extensions' as const, label: '扩展' },
  { id: 'debug' as const, label: '调试' },
  { id: 'info' as const, label: '信息' },
  { id: 'problems' as const, label: '问题' },
  { id: 'output' as const, label: '输出' },
  { id: 'terminal' as const, label: '终端' },
  { id: 'tasks' as const, label: '任务' },
  { id: 'timeline' as const, label: '时间线' },
  { id: 'scripts' as const, label: '脚本' },
  { id: 'todos' as const, label: '待办' },
  { id: 'diagnostic' as const, label: '诊断' },
]

const tools = [
  { name: 'Bash', desc: '执行 shell 命令' },
  { name: 'Read', desc: '读取文件内容' },
  { name: 'Write', desc: '创建或修改文件' },
  { name: 'Edit', desc: '精准编辑文件' },
  { name: 'Glob', desc: '搜索匹配的文件' },
  { name: 'Grep', desc: '搜索文件内容' },
  { name: 'WebFetch', desc: '抓取网页内容' },
  { name: 'WebSearch', desc: '搜索网络信息' },
]

// ── WorkspaceSettings ───────────────────────────────────────────────

function WorkspaceSettings() {
  const workspacePath = useStore((s) => s.workspacePath)
  const setWorkspacePath = useStore((s) => s.setWorkspacePath)
  const addToast = useToastStore((s) => s.addToast)
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
      addToast({ type: 'success', title: '工作区已设置', message: trimmed, duration: 3000 })
    } catch (e: any) {
      setStatus('error')
      const msg = typeof e === 'string' ? e : e?.message || '设置失败'
      setErrorMsg(msg)
      addToast({ type: 'error', title: '工作区设置失败', message: msg, duration: 4000 })
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
          style={{ background: 'var(--accent)', color: '#fff', border: 'none' }}
        >
          {status === 'loading' ? '读取中...' : '设置工作区'}
        </button>
        {workspacePath && (
          <button
            onClick={handleClear}
            className="px-3 py-1.5 text-xs rounded cursor-pointer transition-colors"
            style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}
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

// ── RecentProjects ───────────────────────────────────────────────────

function RecentProjects() {
  const recentProjects = useStore((s) => s.recentProjects)
  const setWorkspacePath = useStore((s) => s.setWorkspacePath)
  const addToast = useToastStore((s) => s.addToast)

  if (recentProjects.length === 0) return null

  return (
    <div className="mt-3">
      <h4 className="text-[11px] font-semibold uppercase tracking-wide mb-2 px-1" style={{ color: 'var(--panel-header)' }}>
        <Clock size={12} className="inline mr-1" style={{ color: 'var(--accent)' }} />
        最近项目
      </h4>
      <div className="space-y-0.5">
        {recentProjects.map((p) => (
          <button
            key={p}
            onClick={() => { setWorkspacePath(p); addToast({ type: 'info', title: '已切换工作区', message: p, duration: 2000 }) }}
            className="w-full flex items-center gap-2 px-2 py-1.5 text-[11px] rounded cursor-pointer transition-colors hover:opacity-80 text-left"
            style={{ color: 'var(--text-secondary)' }}
          >
            <FolderKanban size={12} className="shrink-0" style={{ color: 'var(--text-muted)' }} />
            <span className="truncate flex-1">{p.split('\\').pop() || p}</span>
            <span className="text-[10px] truncate max-w-[100px]" style={{ color: 'var(--text-muted)' }}>{p}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── DebugPanel ────────────────────────────────────────────────────────

function DebugPanel() {
  const [debugTab, setDebugTab] = useState<'variables' | 'watch' | 'callstack' | 'breakpoints' | 'console' | 'launch'>('launch')
  useDebugEvents()

  return (
    <div className="h-full flex flex-col">
      <DebugToolbar />
      <div className="flex shrink-0" style={{ borderBottom: '1px solid var(--border-color)' }}>
        {[
          { id: 'launch' as const, label: '启动' },
          { id: 'variables' as const, label: '变量' },
          { id: 'watch' as const, label: '监视' },
          { id: 'callstack' as const, label: '堆栈' },
          { id: 'breakpoints' as const, label: '断点' },
          { id: 'console' as const, label: '控制台' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setDebugTab(tab.id)}
            className="flex-1 py-1.5 text-[10px] font-medium cursor-pointer transition-colors"
            style={{
              color: debugTab === tab.id ? 'var(--tab-active)' : 'var(--tab-inactive)',
              borderBottom: debugTab === tab.id ? '2px solid var(--accent)' : '2px solid transparent',
              background: debugTab === tab.id ? 'var(--accent-bg)' : 'transparent',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-hidden">
        {debugTab === 'launch' && <LaunchConfigEditor />}
        {debugTab === 'variables' && <DebugVariables />}
        {debugTab === 'watch' && <DebugWatch />}
        {debugTab === 'callstack' && <DebugCallStack />}
        {debugTab === 'breakpoints' && <BreakpointPanel />}
        {debugTab === 'console' && <DebugConsole />}
      </div>
    </div>
  )
}

// ── Sessions List (was Sidebar) ──────────────────────────────────────────

function SessionsList() {
  const sessions = useStore((s) => s.sessions)
  const createNewSession = useStore((s) => s.createNewSession)
  const [query, setQuery] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [activeTag, setActiveTag] = useState<string | null>(null)

  const allTags = useMemo(() => {
    const tagSet = new Set<string>()
    sessions.forEach(s => s.tags?.forEach(t => tagSet.add(t)))
    return Array.from(tagSet).sort()
  }, [sessions])

  const activeSessions = useMemo(() => sessions.filter(s => !s.archived), [sessions])
  const archivedSessions = useMemo(() => sessions.filter(s => s.archived), [sessions])

  const fuse = useMemo(() => new Fuse(activeSessions, {
    keys: ['name', 'preview'],
    threshold: 0.4,
  }), [activeSessions])

  const filtered = useMemo(() => {
    let result = activeSessions
    if (activeTag) result = result.filter(s => s.tags?.includes(activeTag!))
    if (query.trim()) result = fuse.search(query).map(r => r.item)
    return result
  }, [query, activeTag, activeSessions, fuse])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--panel-header)' }}>
          <MessageSquare size={12} className="inline mr-1" style={{ color: 'var(--accent)' }} />
          会话
        </h4>
        <button onClick={createNewSession} className="cursor-pointer hover:opacity-70" style={{ color: 'var(--text-muted)' }}>
          <Plus size={14} />
        </button>
      </div>

      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {allTags.map((tag) => (
            <button key={tag} onClick={() => setActiveTag(activeTag === tag ? null : tag)}
              className="text-[10px] px-2 py-0.5 rounded-full cursor-pointer transition-colors"
              style={{
                background: activeTag === tag ? 'var(--accent)' : 'var(--bg-elevated)',
                color: activeTag === tag ? '#fff' : 'var(--text-muted)',
                border: `1px solid ${activeTag === tag ? 'var(--accent)' : 'var(--border-color)'}`,
              }}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-0.5">
        {filtered.length === 0 ? (
          <p className="text-xs text-center py-8" style={{ color: 'var(--text-muted)' }}>
            {query ? '无匹配结果' : '暂无会话'}
          </p>
        ) : (
          filtered.map((s) => <SessionItem key={s.id} session={s} />)
        )}
        {archivedSessions.length > 0 && (
          <>
            <hr className="my-2" style={{ borderColor: 'var(--border-color)' }} />
            <button onClick={() => setShowArchived(!showArchived)}
              className="flex items-center gap-2 w-full px-2 py-1.5 text-xs cursor-pointer hover:opacity-80"
              style={{ color: 'var(--text-muted)' }}
            >
              <Archive size={12} />
              <span>已归档 ({archivedSessions.length})</span>
              <span className="ml-auto">{showArchived ? '▼' : '▶'}</span>
            </button>
            {showArchived && archivedSessions.map((s) => <SessionItem key={s.id} session={s} />)}
          </>
        )}
      </div>

      {/* Search */}
      <div className="mt-2 pt-2" style={{ borderTop: '1px solid var(--border-color)' }}>
        <div className="flex items-center gap-2 rounded-md px-2.5 py-1.5" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-light)' }}>
          <Search size={13} style={{ color: 'var(--text-muted)' }} />
          <input value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索会话..."
            className="bg-transparent border-none outline-none text-xs flex-1"
            style={{ color: 'var(--text-secondary)' }}
          />
        </div>
      </div>
    </div>
  )
}

// ── RightPanel ──────────────────────────────────────────────────────

export default function RightPanel() {
  const rightTab = useStore((s) => s.rightTab)
  const setRightTab = useStore((s) => s.setRightTab)
  const activeSessionId = useStore((s) => s.activeSessionId)
  const msgCount = useStore((s) => s.messages[activeSessionId]?.length ?? 0)
  const sessions = useStore((s) => s.sessions)
  const activeSession = sessions.find(s => s.id === activeSessionId)
  const usage = activeSession?.usage

  return (
    <div
      className="w-full flex flex-col h-full"
      style={{
        backgroundColor: 'var(--sidebar-bg)',
        backgroundImage: 'var(--sidebar-bg-image, none)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        borderRight: '1px solid var(--border-color)',
      }}
    >
      {/* Tabs */}
      <div className="flex overflow-x-auto no-scrollbar" style={{ borderBottom: '1px solid var(--border-color)' }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setRightTab(tab.id)}
            className="py-3 px-2 text-xs font-medium cursor-pointer transition-colors whitespace-nowrap shrink-0"
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
        {rightTab === 'sessions' && (
          <SessionsList />
        )}

        {rightTab === 'files' && (
          <div>
            <h4 className="text-[11px] font-semibold uppercase tracking-wide mb-2 px-1" style={{ color: 'var(--panel-header)' }}>
              <Files size={12} className="inline mr-1" style={{ color: 'var(--accent)' }} />
              文件浏览器
            </h4>
            <FileExplorer />
          </div>
        )}

        {rightTab === 'search' && (
          <div>
            <h4 className="text-[11px] font-semibold uppercase tracking-wide mb-2 px-1" style={{ color: 'var(--panel-header)' }}>
              <Search size={12} className="inline mr-1" style={{ color: 'var(--accent)' }} />
              文件搜索
            </h4>
            <FileSearch />
          </div>
        )}

        {rightTab === 'problems' && (
          <ProblemsPanel />
        )}

        {rightTab === 'output' && (
          <OutputPanel />
        )}

        {rightTab === 'tools' && (
          <div>
            <h4 className="text-[11px] font-semibold uppercase tracking-wide mb-2 px-1" style={{ color: 'var(--panel-header)' }}>
              可用工具
            </h4>
            {tools.map((tool) => (
              <div
                key={tool.name}
                className="p-3 rounded-lg mb-2 text-xs"
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
              >
                <div className="font-medium mb-0.5">{tool.name}</div>
                <div style={{ color: 'var(--text-muted)' }}>{tool.desc}</div>
              </div>
            ))}

            <hr className="my-3" style={{ borderColor: 'var(--border-color)' }} />

            <h4 className="text-[11px] font-semibold uppercase tracking-wide mb-2 px-1" style={{ color: 'var(--panel-header)' }}>
              <FileCode size={12} className="inline mr-1" style={{ color: 'var(--accent)' }} />
              代码片段 (Snippets)
            </h4>
            <SnippetsPanel />
          </div>
        )}

        {rightTab === 'debug' && (
          <DebugPanel />
        )}

        {rightTab === 'extensions' && (
          <ExtensionManager />
        )}

        {rightTab === 'tasks' && (
          <TasksPanel />
        )}

        {rightTab === 'timeline' && (
          <TimelinePanel />
        )}

        {rightTab === 'scripts' && (
          <div>
            <h4 className="text-[11px] font-semibold uppercase tracking-wide mb-2 px-1" style={{ color: 'var(--panel-header)' }}>
              <Play size={12} className="inline mr-1" style={{ color: 'var(--accent)' }} />
              npm 脚本
            </h4>
            <NpmScriptsPanel />
          </div>
        )}

        {rightTab === 'todos' && (
          <div>
            <h4 className="text-[11px] font-semibold uppercase tracking-wide mb-2 px-1" style={{ color: 'var(--panel-header)' }}>
              <AlertTriangle size={12} className="inline mr-1" style={{ color: 'var(--accent)' }} />
              待办事项
            </h4>
            <TodoViewer />
          </div>
        )}

        {rightTab === 'diagnostic' && (
          <div className="h-full flex flex-col">
            <DiagnosticPanel />
          </div>
        )}

        {rightTab === 'terminal' && (
          <div className="h-full flex flex-col">
            <TerminalPanel />
          </div>
        )}

        {rightTab === 'info' && (
          <div>
            <h4 className="text-[11px] font-semibold uppercase tracking-wide mb-2 px-1" style={{ color: 'var(--panel-header)' }}>
              会话信息
            </h4>
            <div className="text-xs space-y-2 px-1" style={{ color: 'var(--text-secondary)' }}>
              <div>
                <span className="font-medium" style={{ color: 'var(--text-primary)' }}>消息数:</span>
                <br />{msgCount} 条
              </div>
              {activeSession?.time && (() => {
                const now = new Date()
                const [h, m] = activeSession.time!.split(':').map(Number)
                const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m)
                const elapsed = Math.floor((now.getTime() - start.getTime()) / 1000)
                if (elapsed > 0 && elapsed < 86400) {
                  const mins = Math.floor(elapsed / 60)
                  const secs = elapsed % 60
                  return (
                    <div>
                      <span className="font-medium" style={{ color: 'var(--text-primary)' }}>会话时长:</span>
                      <br />
                      <span className="text-[11px]">{mins}m {secs}s</span>
                    </div>
                  )
                }
                return null
              })()}
              {usage && (
                <div>
                  <span className="font-medium" style={{ color: 'var(--text-primary)' }}>Token 用量:</span>
                  <br />
                  <span className="text-[11px]">
                    输入: <strong style={{ color: 'var(--text-primary)' }}>{usage.input_tokens.toLocaleString()}</strong>
                    {' · '}输出: <strong style={{ color: 'var(--text-primary)' }}>{usage.output_tokens.toLocaleString()}</strong>
                    {' · '}总计: <strong style={{ color: 'var(--accent)' }}>{(usage.input_tokens + usage.output_tokens).toLocaleString()}</strong>
                  </span>
                  <br />
                  <span className="text-[11px]">
                    估算费用: <strong style={{ color: 'var(--text-primary)' }}>${((usage.input_tokens / 1_000_000) * 0.15 + (usage.output_tokens / 1_000_000) * 0.60).toFixed(6)}</strong>
                  </span>
                </div>
              )}
            </div>

            <hr className="my-3" style={{ borderColor: 'var(--border-color)' }} />

            <div className="px-1">
              <h4 className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--panel-header)' }}>
                <FolderKanban size={12} className="inline mr-1" style={{ color: 'var(--accent)' }} />
                工作区
              </h4>
              <WorkspaceSettings />
              <RecentProjects />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
