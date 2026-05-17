import { useState, useEffect, useCallback } from 'react'
import { GitBranch, File, Plus, Minus, RefreshCw, GitCommit, Upload, Diff, ChevronDown, Trash2, Eye, Download, Clock, GitPullRequest } from 'lucide-react'
import { useStore } from '../stores/useStore'
import { useToastStore } from '../stores/toastStore'
import {
  getGitStatus, gitStage, gitUnstage, gitCommit, gitDiff, gitPush,
  gitBranches, gitCreateBranch, gitSwitchBranch, gitDeleteBranch,
  gitStashPush, gitStashPop, gitStashList, gitStashShow, gitStashDrop,
  gitBlame, gitStageHunk, gitDiscard,
  gitPull, gitFetch, gitLog, gitLogGraph, gitRemoteList, gitRemoteAdd, gitRemoteRemove,
  type GitStatus, type GitBranch as GitBranchT, type GitStashEntry, type GitBlameEntry,
  type GitLogEntry, type GitLogGraphEntry, type GitRemote,
} from '../lib/ipc'

export default function GitPanel() {
  const workspacePath = useStore((s) => s.workspacePath)
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [commitMsg, setCommitMsg] = useState('')
  const [committing, setCommitting] = useState(false)
  const [showCommitHistory, setShowCommitHistory] = useState(false)
  const commitHistory = useStore((s) => s.commitHistory)
  const addCommitMessage = useStore((s) => s.addCommitMessage)
  const [pushing, setPushing] = useState(false)
  const [diffContent, setDiffContent] = useState<string | null>(null)
  const [diffFile, setDiffFile] = useState<string | null>(null)
  const addToast = useToastStore((s) => s.addToast)

  // Branch management state
  const [showBranchPanel, setShowBranchPanel] = useState(false)
  const [branches, setBranches] = useState<GitBranchT[]>([])
  const [newBranchName, setNewBranchName] = useState('')

  // Stash state
  const [stashes, setStashes] = useState<GitStashEntry[]>([])
  const [showStashPanel, setShowStashPanel] = useState(false)
  const [stashMsg, setStashMsg] = useState('')
  const [stashDiff, setStashDiff] = useState<string | null>(null)

  // Blame state
  const [blameTarget, setBlameTarget] = useState<string | null>(null)
  const [blameEntries, setBlameEntries] = useState<GitBlameEntry[]>([])

  // Pull/fetch state
  const [pulling, setPulling] = useState(false)
  const [fetching, setFetching] = useState(false)

  // Log state
  const [logEntries, setLogEntries] = useState<GitLogGraphEntry[]>([])
  const [showLog, setShowLog] = useState(false)

  // Remote state
  const [remotes, setRemotes] = useState<GitRemote[]>([])
  const [showRemotePanel, setShowRemotePanel] = useState(false)
  const [newRemoteName, setNewRemoteName] = useState('')
  const [newRemoteUrl, setNewRemoteUrl] = useState('')

  const fetchStatus = useCallback(async () => {
    if (!workspacePath) return
    setLoading(true)
    setError('')
    try {
      const result = await getGitStatus(workspacePath)
      setStatus(result)
    } catch (e: any) {
      setError(e?.message || 'Failed to get git status')
    }
    setLoading(false)
  }, [workspacePath])

  const fetchBranches = useCallback(async () => {
    if (!workspacePath) return
    const list = await gitBranches(workspacePath)
    setBranches(list)
  }, [workspacePath])

  const fetchStashes = useCallback(async () => {
    if (!workspacePath) return
    const list = await gitStashList(workspacePath)
    setStashes(list)
  }, [workspacePath])

  useEffect(() => {
    if (workspacePath) { fetchStatus(); fetchStashes() }
  }, [workspacePath, fetchStatus, fetchStashes])

  const handleStage = async (filePath: string) => {
    try {
      await gitStage(workspacePath, filePath)
      fetchStatus()
    } catch (e: any) {
      addToast({ type: 'error', title: '暂存失败', message: e?.message || String(e), duration: 3000 })
    }
  }

  const handleUnstage = async (filePath: string) => {
    try {
      await gitUnstage(workspacePath, filePath)
      fetchStatus()
    } catch (e: any) {
      addToast({ type: 'error', title: '取消暂存失败', message: e?.message || String(e), duration: 3000 })
    }
  }

  const handleCommit = async () => {
    const msg = commitMsg.trim()
    if (!msg) return
    setCommitting(true)
    try {
      const result = await gitCommit(workspacePath, msg)
      addToast({ type: 'success', title: '提交成功', message: result, duration: 3000 })
      addCommitMessage(msg)
      setCommitMsg('')
      fetchStatus()
    } catch (e: any) {
      addToast({ type: 'error', title: '提交失败', message: e?.message || String(e), duration: 4000 })
    }
    setCommitting(false)
  }

  const handlePush = async () => {
    setPushing(true)
    try {
      const result = await gitPush(workspacePath)
      addToast({ type: 'success', title: '推送成功', message: result || '(done)', duration: 3000 })
    } catch (e: any) {
      addToast({ type: 'error', title: '推送失败', message: e?.message || String(e), duration: 4000 })
    }
    setPushing(false)
  }

  const handleDiff = async (filePath: string, staged: boolean) => {
    try {
      const diff = await gitDiff(workspacePath, filePath, staged)
      setDiffContent(diff)
      setDiffFile(filePath)
    } catch (e: any) {
      addToast({ type: 'error', title: '获取 diff 失败', message: e?.message || String(e), duration: 3000 })
    }
  }

  // ── Branch handlers ─────────────────────────────────────────────

  const handleBranchSwitch = async (name: string) => {
    try {
      await gitSwitchBranch(workspacePath, name)
      addToast({ type: 'success', title: '切换分支', message: name, duration: 2000 })
      setShowBranchPanel(false)
      fetchStatus()
      fetchBranches()
    } catch (e: any) {
      addToast({ type: 'error', title: '切换失败', message: e?.message || String(e), duration: 3000 })
    }
  }

  const handleBranchCreate = async () => {
    const n = newBranchName.trim()
    if (!n) return
    try {
      await gitCreateBranch(workspacePath, n)
      addToast({ type: 'success', title: '创建分支', message: n, duration: 2000 })
      setNewBranchName('')
      fetchBranches()
    } catch (e: any) {
      addToast({ type: 'error', title: '创建失败', message: e?.message || String(e), duration: 3000 })
    }
  }

  const handleBranchDelete = async (name: string) => {
    if (!confirm(`确定要删除分支 '${name}' 吗？`)) return
    try {
      await gitDeleteBranch(workspacePath, name)
      addToast({ type: 'success', title: '删除分支', message: name, duration: 2000 })
      fetchBranches()
    } catch (e: any) {
      addToast({ type: 'error', title: '删除失败', message: e?.message || String(e), duration: 3000 })
    }
  }

  const toggleBranchPanel = () => {
    if (!showBranchPanel) fetchBranches()
    setShowBranchPanel(!showBranchPanel)
  }

  // ── Stash handlers ──────────────────────────────────────────────

  const handleStashPush = async () => {
    try {
      await gitStashPush(workspacePath, stashMsg)
      addToast({ type: 'success', title: 'Stash 成功', duration: 2000 })
      setStashMsg('')
      fetchStashes()
      fetchStatus()
    } catch (e: any) {
      addToast({ type: 'error', title: 'Stash 失败', message: e?.message || String(e), duration: 3000 })
    }
  }

  const handleStashPop = async () => {
    try {
      await gitStashPop(workspacePath)
      addToast({ type: 'success', title: 'Stash pop 成功', duration: 2000 })
      fetchStashes()
      fetchStatus()
    } catch (e: any) {
      addToast({ type: 'error', title: 'Pop 失败', message: e?.message || String(e), duration: 3000 })
    }
  }

  const handleStashShow = async (index: number) => {
    try {
      const diff = await gitStashShow(workspacePath, index)
      setStashDiff(diff)
    } catch (e: any) {
      addToast({ type: 'error', title: '查看 stash 失败', message: e?.message || String(e), duration: 3000 })
    }
  }

  const handleStashDrop = async (index: number) => {
    if (!confirm(`确定要删除 stash@{${index}} 吗？`)) return
    try {
      await gitStashDrop(workspacePath, index)
      addToast({ type: 'success', title: `Stash @{${index}} 已删除`, duration: 2000 })
      fetchStashes()
    } catch (e: any) {
      addToast({ type: 'error', title: '删除失败', message: e?.message || String(e), duration: 3000 })
    }
  }

  // ── Blame handlers ──────────────────────────────────────────────

  const handleBlame = async (filePath: string) => {
    try {
      const entries = await gitBlame(workspacePath, filePath)
      setBlameEntries(entries)
      setBlameTarget(filePath)
    } catch (e: any) {
      addToast({ type: 'error', title: 'Blame 失败', message: e?.message || String(e), duration: 3000 })
    }
  }

  // ── Discard handler ──────────────────────────────────────────

  const [discarding, setDiscarding] = useState<string | null>(null)

  const handleDiscard = async (filePath: string) => {
    if (!confirm(`确定要放弃文件 ${filePath} 的更改吗？此操作不可撤销。`)) return
    setDiscarding(filePath)
    try {
      await gitDiscard(workspacePath, filePath)
      addToast({ type: 'success', title: '已放弃更改', message: filePath, duration: 2000 })
      fetchStatus()
    } catch (e: any) {
      addToast({ type: 'error', title: '放弃更改失败', message: e?.message || String(e), duration: 3000 })
    }
    setDiscarding(null)
  }

  // ── Stage hunk handler ───────────────────────────────────────

  const [stagingHunk, setStagingHunk] = useState(false)

  const handleStageHunk = async (patch: string) => {
    setStagingHunk(true)
    try {
      await gitStageHunk(workspacePath, patch)
      addToast({ type: 'success', title: 'Hunk 已暂存', duration: 2000 })
      // Refresh status and diff
      fetchStatus()
      setDiffContent(null)
      setDiffFile(null)
    } catch (e: any) {
      addToast({ type: 'error', title: '暂存 hunk 失败', message: e?.message || String(e), duration: 3000 })
    }
    setStagingHunk(false)
  }

  // ── Pull/Fetch/Log/Remote handlers ────────────────────────────

  const handlePull = async () => {
    setPulling(true)
    try {
      const result = await gitPull(workspacePath)
      addToast({ type: 'success', title: '拉取成功', message: result || '(done)', duration: 3000 })
      fetchStatus()
    } catch (e: any) {
      addToast({ type: 'error', title: '拉取失败', message: e?.message || String(e), duration: 4000 })
    }
    setPulling(false)
  }

  const handleFetch = async () => {
    setFetching(true)
    try {
      await gitFetch(workspacePath)
      addToast({ type: 'success', title: 'Fetch 成功', duration: 2000 })
    } catch (e: any) {
      addToast({ type: 'error', title: 'Fetch 失败', message: e?.message || String(e), duration: 3000 })
    }
    setFetching(false)
  }

  const handleShowLog = async () => {
    if (showLog) { setShowLog(false); return }
    try {
      const entries = await gitLogGraph(workspacePath, 50)
      setLogEntries(entries)
      setShowLog(true)
    } catch (e: any) {
      addToast({ type: 'error', title: '获取提交历史失败', message: e?.message || String(e), duration: 3000 })
    }
  }

  const handleShowRemotes = async () => {
    if (showRemotePanel) { setShowRemotePanel(false); return }
    try {
      const list = await gitRemoteList(workspacePath)
      setRemotes(list)
      setShowRemotePanel(true)
    } catch (e: any) {
      addToast({ type: 'error', title: '获取远程仓库失败', message: e?.message || String(e), duration: 3000 })
    }
  }

  const handleRemoteAdd = async () => {
    if (!newRemoteName.trim() || !newRemoteUrl.trim()) return
    try {
      await gitRemoteAdd(workspacePath, newRemoteName.trim(), newRemoteUrl.trim())
      addToast({ type: 'success', title: '远程仓库已添加', duration: 2000 })
      setNewRemoteName('')
      setNewRemoteUrl('')
      const list = await gitRemoteList(workspacePath)
      setRemotes(list)
    } catch (e: any) {
      addToast({ type: 'error', title: '添加失败', message: e?.message || String(e), duration: 3000 })
    }
  }

  const handleRemoteRemove = async (name: string) => {
    try {
      await gitRemoteRemove(workspacePath, name)
      addToast({ type: 'success', title: `远程仓库 '${name}' 已删除`, duration: 2000 })
      const list = await gitRemoteList(workspacePath)
      setRemotes(list)
    } catch (e: any) {
      addToast({ type: 'error', title: '删除失败', message: e?.message || String(e), duration: 3000 })
    }
  }

  if (!workspacePath) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>请先设置工作区</p>
      </div>
    )
  }

  const stagedChanges = status?.changes.filter(c => c.status === 'M ' || c.status === 'A ' || c.status === 'D ') || []
  const unstagedChanges = status?.changes.filter(c => c.status === ' M' || c.status === '??' || c.status === ' D' || c.status === ' A') || []
  const allChanges = status?.changes || []

  return (
    <div className="space-y-2">
      {/* ── Branch + toolbar ── */}
      <div className="flex items-center justify-between px-1">
        <div className="relative">
          <button
            onClick={toggleBranchPanel}
            className="flex items-center gap-1 text-xs font-medium cursor-pointer hover:opacity-80"
            style={{ color: 'var(--text-primary)' }}
          >
            <GitBranch size={13} style={{ color: 'var(--accent)' }} />
            {status?.branch || '—'}
            <ChevronDown size={10} style={{ color: 'var(--text-muted)' }} />
          </button>
          {showBranchPanel && (
            <div
              className="absolute left-0 top-6 z-30 w-56 rounded-lg shadow-xl overflow-hidden"
              style={{ background: 'var(--sidebar-bg)', border: '1px solid var(--border-color)' }}
            >
              <div className="max-h-48 overflow-y-auto">
                {branches.map((b) => (
                  <div key={b.name} className="flex items-center gap-1 px-2 py-1.5 text-xs group"
                    style={{ color: b.current ? 'var(--accent)' : 'var(--text-secondary)' }}>
                    <button
                      onClick={() => handleBranchSwitch(b.name)}
                      className="flex-1 text-left truncate cursor-pointer hover:opacity-80"
                    >
                      {b.current ? '* ' : '  '}{b.name}
                    </button>
                    {!b.current && (
                      <button onClick={() => handleBranchDelete(b.name)}
                        className="p-0.5 rounded cursor-pointer opacity-0 group-hover:opacity-100 hover:opacity-70"
                        style={{ color: 'var(--text-muted)' }}>
                        <Trash2 size={10} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex gap-1 p-2" style={{ borderTop: '1px solid var(--border-color)' }}>
                <input value={newBranchName} onChange={(e) => setNewBranchName(e.target.value)}
                  placeholder="新分支名..."
                  className="flex-1 px-2 py-1 text-[10px] rounded outline-none"
                  style={{ background: 'var(--input-bg)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleBranchCreate() }} />
                <button onClick={handleBranchCreate}
                  className="px-2 py-1 text-[10px] font-medium rounded cursor-pointer"
                  style={{ background: 'var(--accent)', color: '#fff', border: 'none' }}>
                  <Plus size={10} />
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setShowStashPanel(!showStashPanel)}
            className="p-1 rounded cursor-pointer hover:opacity-70" style={{ color: showStashPanel ? 'var(--accent)' : 'var(--text-muted)' }}
            title="Stash">
            <Eye size={12} />
          </button>
          <button onClick={handleShowLog}
            className="p-1 rounded cursor-pointer hover:opacity-70" style={{ color: showLog ? 'var(--accent)' : 'var(--text-muted)' }}
            title="提交历史">
            <Clock size={12} />
          </button>
          <button onClick={handleShowRemotes}
            className="p-1 rounded cursor-pointer hover:opacity-70" style={{ color: showRemotePanel ? 'var(--accent)' : 'var(--text-muted)' }}
            title="远程仓库">
            <GitPullRequest size={12} />
          </button>
          <button onClick={handleFetch} disabled={fetching}
            className="p-1 rounded cursor-pointer hover:opacity-70" style={{ color: 'var(--text-muted)' }} title="Fetch">
            <RefreshCw size={12} className={fetching ? 'animate-spin' : ''} />
          </button>
          <button onClick={handlePull} disabled={pulling}
            className="p-1 rounded cursor-pointer hover:opacity-70" style={{ color: 'var(--text-muted)' }} title="拉取">
            <Download size={12} className={pulling ? 'animate-spin' : ''} />
          </button>
          <button onClick={handlePush} disabled={pushing}
            className="p-1 rounded cursor-pointer hover:opacity-70" style={{ color: 'var(--text-muted)' }} title="推送">
            <Upload size={12} className={pushing ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => { fetchStatus(); fetchStashes() }} className="p-1 rounded cursor-pointer hover:opacity-70"
            style={{ color: 'var(--text-muted)' }} title="刷新">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {error && <p className="text-xs px-1" style={{ color: '#ef4444' }}>{error}</p>}

      {/* ── Stash panel ── */}
      {showStashPanel && (
        <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border-color)' }}>
          <div className="flex gap-1 p-1.5" style={{ background: 'var(--bg-elevated)' }}>
            <input value={stashMsg} onChange={(e) => setStashMsg(e.target.value)}
              placeholder="Stash 信息 (可选)"
              className="flex-1 px-2 py-1 text-[10px] rounded outline-none"
              style={{ background: 'var(--input-bg)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleStashPush() }} />
            <button onClick={handleStashPush}
              className="px-2 py-1 text-[10px] font-medium rounded cursor-pointer"
              style={{ background: 'var(--accent)', color: '#fff', border: 'none' }}>
              Stash
            </button>
            <button onClick={handleStashPop}
              className="px-2 py-1 text-[10px] font-medium rounded cursor-pointer"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}>
              Pop
            </button>
          </div>
          {stashes.length === 0 ? (
            <p className="text-[10px] p-2 text-center" style={{ color: 'var(--text-muted)' }}>无 stash</p>
          ) : (
            stashes.map((s) => (
              <div key={s.index} className="flex items-center gap-1.5 px-2 py-1 text-[10px] group"
                style={{ color: 'var(--text-secondary)' }}>
                <span className="flex-1 truncate">stash@{'{'}{s.index}{'}'}: {s.description}</span>
                <button onClick={() => handleStashShow(s.index)}
                  className="p-0.5 rounded cursor-pointer opacity-0 group-hover:opacity-100 hover:opacity-70"
                  style={{ color: 'var(--text-muted)' }} title="查看"><Diff size={10} /></button>
                <button onClick={() => handleStashDrop(s.index)}
                  className="p-0.5 rounded cursor-pointer opacity-0 group-hover:opacity-100 hover:opacity-70"
                  style={{ color: 'var(--text-muted)' }} title="删除"><Trash2 size={10} /></button>
              </div>
            ))
          )}
          {stashDiff && (
            <div className="border-t" style={{ borderColor: 'var(--border-color)' }}>
              <div className="flex items-center justify-between px-2 py-0.5" style={{ background: 'var(--bg-elevated)' }}>
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Stash Diff</span>
                <button onClick={() => setStashDiff(null)}
                  className="p-0.5 rounded cursor-pointer hover:opacity-70" style={{ color: 'var(--text-muted)' }}>✕</button>
              </div>
              <pre className="text-[10px] p-2 overflow-x-auto max-h-[150px] overflow-y-auto leading-relaxed"
                style={{ background: 'var(--code-bg)', color: 'var(--text-primary)' }}>
                {stashDiff.split('\n').map((line, i) => {
                  let color = 'var(--text-primary)'
                  if (line.startsWith('+')) color = '#10b981'
                  else if (line.startsWith('-')) color = '#ef4444'
                  else if (line.startsWith('@@')) color = '#3b82f6'
                  return <div key={i} style={{ color }}>{line}</div>
                })}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* ── Log viewer with graph ── */}
      {showLog && (
        <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border-color)' }}>
          <div className="flex items-center justify-between px-2 py-1" style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-color)' }}>
            <span className="text-[10px] font-semibold" style={{ color: 'var(--panel-header)' }}>提交历史</span>
            <button onClick={() => setShowLog(false)} className="p-0.5 rounded cursor-pointer hover:opacity-70" style={{ color: 'var(--text-muted)' }}>✕</button>
          </div>
          {logEntries.length === 0 ? (
            <p className="text-[10px] p-2 text-center" style={{ color: 'var(--text-muted)' }}>无提交记录</p>
          ) : (
            <div className="max-h-64 overflow-y-auto text-[10px]" style={{ background: 'var(--code-bg)' }}>
              {logEntries.map((e, i) => {
                // Assign a deterministic color based on commit hash
                const hue = parseInt(e.hash.slice(0, 6), 16) % 360
                const dotColor = `hsl(${hue}, 65%, 55%)`
                return (
                  <div key={i} className="flex items-start gap-1 px-1 py-0.5 hover:opacity-80 group" style={{ color: 'var(--text-secondary)' }}>
                    {/* Graph column */}
                    <div className="shrink-0 font-mono text-[9px] leading-[18px] whitespace-pre" style={{ color: 'var(--text-muted)', opacity: 0.5 }}>
                      {renderGraph(e.graph, dotColor)}
                    </div>
                    {/* Dot */}
                    <span className="shrink-0 mt-[5px]" style={{ color: dotColor }}>●</span>
                    {/* Hash */}
                    <span className="shrink-0 font-mono opacity-60 w-[52px] truncate" style={{ color: 'var(--text-muted)' }}>{e.hash.slice(0, 7)}</span>
                    {/* Message */}
                    <span className="flex-1 truncate">{e.message}</span>
                    {/* Author */}
                    <span className="shrink-0 opacity-50 hidden sm:inline max-w-[60px] truncate">{e.author}</span>
                    {/* Date */}
                    <span className="shrink-0 opacity-40 text-[9px] w-[40px] text-right">{e.date}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Remote management ── */}
      {showRemotePanel && (
        <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border-color)' }}>
          <div className="flex items-center justify-between px-2 py-1" style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-color)' }}>
            <span className="text-[10px] font-semibold" style={{ color: 'var(--panel-header)' }}>远程仓库</span>
            <button onClick={() => setShowRemotePanel(false)} className="p-0.5 rounded cursor-pointer hover:opacity-70" style={{ color: 'var(--text-muted)' }}>✕</button>
          </div>
          <div className="p-1.5 space-y-1">
            {remotes.length === 0 && (
              <p className="text-[10px] text-center py-2" style={{ color: 'var(--text-muted)' }}>无远程仓库</p>
            )}
            {remotes.map((r, i) => (
              <div key={i} className="flex items-center gap-1.5 px-2 py-1 text-[10px] group rounded"
                style={{ color: 'var(--text-secondary)' }}>
                <span className="font-medium shrink-0" style={{ color: 'var(--accent)' }}>{r.name}</span>
                <span className="flex-1 truncate opacity-70">{r.url}</span>
                <button onClick={() => handleRemoteRemove(r.name)}
                  className="p-0.5 rounded cursor-pointer opacity-0 group-hover:opacity-100 hover:opacity-70"
                  style={{ color: 'var(--text-muted)' }}><Trash2 size={10} /></button>
              </div>
            ))}
            <div className="flex gap-1 pt-1" style={{ borderTop: '1px solid var(--border-color)' }}>
              <input value={newRemoteName} onChange={(e) => setNewRemoteName(e.target.value)}
                placeholder="名称"
                className="w-14 px-1.5 py-1 text-[10px] rounded outline-none"
                style={{ background: 'var(--input-bg)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }} />
              <input value={newRemoteUrl} onChange={(e) => setNewRemoteUrl(e.target.value)}
                placeholder="URL"
                className="flex-1 px-1.5 py-1 text-[10px] rounded outline-none"
                style={{ background: 'var(--input-bg)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleRemoteAdd() }} />
              <button onClick={handleRemoteAdd}
                className="px-2 py-1 text-[10px] font-medium rounded cursor-pointer"
                style={{ background: 'var(--accent)', color: '#fff', border: 'none' }}>
                <Plus size={10} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Staged changes ── */}
      {stagedChanges.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase px-1 mb-1" style={{ color: 'var(--text-muted)' }}>
            已暂存 ({stagedChanges.length})
          </p>
          {stagedChanges.map((c, i) => (
            <div key={i} className="flex items-center gap-1.5 px-2 py-1 rounded text-xs"
              style={{ color: 'var(--text-secondary)' }}>
              <button onClick={() => handleUnstage(c.path)} className="p-0.5 rounded cursor-pointer hover:opacity-70"
                style={{ color: 'var(--text-muted)' }} title="取消暂存">−</button>
              {statusIcon(c.status)}
              <span className="truncate flex-1">{c.path}</span>
              <button onClick={() => handleDiff(c.path, true)} className="p-0.5 rounded cursor-pointer hover:opacity-70"
                style={{ color: 'var(--text-muted)' }} title="查看 diff"><Diff size={10} /></button>
              <button onClick={() => handleBlame(c.path)} className="p-0.5 rounded cursor-pointer hover:opacity-70"
                style={{ color: 'var(--text-muted)' }} title="Blame"><File size={10} /></button>
              <span className="text-[10px] shrink-0" style={{ color: 'var(--text-muted)' }}>
                {statusLabel(c.status)}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Unstaged changes ── */}
      {unstagedChanges.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase px-1 mb-1" style={{ color: 'var(--text-muted)' }}>
            未暂存 ({unstagedChanges.length})
          </p>
          {unstagedChanges.map((c, i) => (
            <div key={i} className="flex items-center gap-1.5 px-2 py-1 rounded text-xs"
              style={{ color: 'var(--text-secondary)' }}>
              <button onClick={() => handleStage(c.path)} className="p-0.5 rounded cursor-pointer hover:opacity-70"
                style={{ color: 'var(--text-muted)' }} title="暂存">+</button>
              {statusIcon(c.status)}
              <span className="truncate flex-1">{c.path}</span>
              <button onClick={() => handleDiff(c.path, false)} className="p-0.5 rounded cursor-pointer hover:opacity-70"
                style={{ color: 'var(--text-muted)' }} title="查看 diff"><Diff size={10} /></button>
              <button onClick={() => handleBlame(c.path)} className="p-0.5 rounded cursor-pointer hover:opacity-70"
                style={{ color: 'var(--text-muted)' }} title="Blame"><File size={10} /></button>
              {c.status.trim() === 'M' && (
                <button onClick={() => handleDiscard(c.path)} disabled={discarding === c.path}
                  className="p-0.5 rounded cursor-pointer hover:opacity-70 disabled:opacity-40"
                  style={{ color: 'var(--text-muted)' }} title="放弃更改"><Trash2 size={10} /></button>
              )}
              <span className="text-[10px] shrink-0" style={{ color: 'var(--text-muted)' }}>
                {statusLabel(c.status)}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── All clean ── */}
      {allChanges.length === 0 && !loading && (
        <p className="text-xs px-1" style={{ color: 'var(--text-muted)' }}>工作区干净，无更改</p>
      )}

      {loading && <p className="text-xs px-1" style={{ color: 'var(--text-muted)' }}>读取中...</p>}

      {/* ── Blame viewer ── */}
      {blameEntries.length > 0 && blameTarget && (
        <div className="rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border-color)' }}>
          <div className="flex items-center justify-between px-2 py-1"
            style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-color)' }}>
            <span className="text-[10px] font-mono truncate" style={{ color: 'var(--text-muted)' }}>Blame: {blameTarget}</span>
            <button onClick={() => { setBlameEntries([]); setBlameTarget(null) }}
              className="p-0.5 rounded cursor-pointer hover:opacity-70" style={{ color: 'var(--text-muted)' }}>✕</button>
          </div>
          <div className="max-h-[200px] overflow-y-auto text-[10px] font-mono leading-relaxed"
            style={{ background: 'var(--code-bg)' }}>
            {blameEntries.map((e, i) => (
              <div key={i} className="flex gap-2 px-2 py-0.5 hover:opacity-80"
                style={{ background: i % 2 === 0 ? 'rgba(0,0,0,0.03)' : 'transparent' }}>
                <span className="shrink-0 w-6 text-right opacity-50" style={{ color: 'var(--text-muted)' }}>{e.line}</span>
                <span className="shrink-0 w-24 truncate opacity-70" style={{ color: 'var(--text-muted)' }} title={e.author}>{e.commit.slice(0, 7)}</span>
                <span className="shrink-0 w-12 truncate opacity-70" style={{ color: 'var(--text-muted)' }}>{e.author}</span>
                <span className="shrink-0 w-16 truncate opacity-50" style={{ color: 'var(--text-muted)' }}>{e.date}</span>
                <span className="flex-1 whitespace-pre-wrap break-all" style={{ color: 'var(--text-primary)' }}>{e.content}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Diff viewer ── */}
      {diffContent && !stashDiff && (
        <div className="rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border-color)' }}>
          <div className="flex items-center justify-between px-2 py-1"
            style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-color)' }}>
            <span className="text-[10px] font-mono truncate" style={{ color: 'var(--text-muted)' }}>{diffFile}</span>
            <button onClick={() => { setDiffContent(null); setDiffFile(null) }}
              className="p-0.5 rounded cursor-pointer hover:opacity-70" style={{ color: 'var(--text-muted)' }}>✕</button>
          </div>
          {(() => {
            const lines = diffContent.split('\n')
            // Find header lines
            let headerIdx = 0
            while (headerIdx < lines.length && !lines[headerIdx].startsWith('@@')) headerIdx++
            const header = lines.slice(0, headerIdx).join('\n')
            const hunkLines = lines.slice(headerIdx)

            // Group into hunks by @@ markers
            const hunks: { header: string; lines: string[] }[] = []
            let currentHunk: string[] = []
            for (const line of hunkLines) {
              if (line.startsWith('@@') && currentHunk.length > 0) {
                hunks.push({ header: currentHunk[0], lines: currentHunk.slice(1) })
                currentHunk = [line]
              } else {
                currentHunk.push(line)
              }
            }
            if (currentHunk.length > 0) {
              hunks.push({ header: currentHunk[0], lines: currentHunk.slice(1) })
            }

            return (
              <div className="max-h-[200px] overflow-y-auto">
                {hunks.length === 0 ? (
                  <div className="text-[11px] p-2 font-mono" style={{ background: 'var(--code-bg)', color: 'var(--text-primary)' }}>
                    {lines.map((line, i) => {
                      let color = 'var(--text-primary)'
                      let bg = 'transparent'
                      if (line.startsWith('+')) { color = '#10b981'; bg = 'rgba(16,185,129,0.08)' }
                      else if (line.startsWith('-')) { color = '#ef4444'; bg = 'rgba(239,68,68,0.08)' }
                      else if (line.startsWith('@@')) { color = '#3b82f6'; bg = 'rgba(59,130,246,0.08)' }
                      return <div key={i} style={{ background: bg, color }}>{line}</div>
                    })}
                  </div>
                ) : (
                  hunks.map((hunk, hi) => {
                    const patch = header + '\n' + hunk.header + '\n' + hunk.lines.join('\n')
                    return (
                      <div key={hi} style={{ borderBottom: hi < hunks.length - 1 ? '1px solid var(--border-color)' : 'none' }}>
                        <div className="flex items-center justify-between px-2 py-0.5" style={{ background: 'var(--bg-elevated)' }}>
                          <span className="text-[9px] font-mono" style={{ color: 'var(--text-muted)' }}>{hunk.header}</span>
                          <button onClick={() => handleStageHunk(patch)} disabled={stagingHunk}
                            className="px-1.5 py-0.5 text-[9px] font-medium rounded cursor-pointer disabled:opacity-40"
                            style={{ background: 'var(--accent)', color: '#fff', border: 'none' }}>
                            {stagingHunk ? '...' : '暂存此 Hunk'}
                          </button>
                        </div>
                        <pre className="text-[11px] p-2 leading-relaxed" style={{ background: 'var(--code-bg)', color: 'var(--text-primary)' }}>
                          {hunk.lines.map((line, i) => {
                            let color = 'var(--text-primary)'
                            let bg = 'transparent'
                            if (line.startsWith('+')) { color = '#10b981'; bg = 'rgba(16,185,129,0.08)' }
                            else if (line.startsWith('-')) { color = '#ef4444'; bg = 'rgba(239,68,68,0.08)' }
                            return <div key={i} style={{ background: bg, color }}>{line}</div>
                          })}
                        </pre>
                      </div>
                    )
                  })
                )}
              </div>
            )
          })()}
        </div>
      )}

      {/* ── Commit area ── */}
      {stagedChanges.length > 0 && (
        <div className="pt-2 space-y-2" style={{ borderTop: '1px solid var(--border-color)' }}>
          <div className="relative">
            <input value={commitMsg} onChange={(e) => setCommitMsg(e.target.value)}
              placeholder="提交信息..."
              className="w-full px-2 py-1.5 text-xs rounded border outline-none"
              style={{ background: 'var(--input-bg)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleCommit() } }} />
            {commitHistory.length > 0 && (
              <div className="absolute right-1 top-1/2 -translate-y-1/2">
                <button onClick={() => setShowCommitHistory(!showCommitHistory)}
                  className="p-0.5 rounded cursor-pointer hover:opacity-70"
                  style={{ color: 'var(--text-muted)' }} title="最近提交信息">
                  <Clock size={11} />
                </button>
              </div>
            )}
            {showCommitHistory && commitHistory.length > 0 && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowCommitHistory(false)} />
                <div className="absolute bottom-full right-0 mb-1 z-50 min-w-[200px] rounded-lg shadow-xl overflow-hidden"
                  style={{ background: 'var(--sidebar-bg)', border: '1px solid var(--border-color)' }}>
                  <div className="max-h-32 overflow-y-auto">
                    {commitHistory.map((msg, i) => (
                      <button key={i} onClick={() => { setCommitMsg(msg); setShowCommitHistory(false) }}
                        className="w-full text-left px-2 py-1.5 text-[10px] truncate cursor-pointer hover:opacity-80"
                        style={{ color: 'var(--text-secondary)' }}>{msg}</button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={handleCommit} disabled={committing || !commitMsg.trim()}
              className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs font-medium rounded cursor-pointer disabled:opacity-40"
              style={{ background: 'var(--accent)', color: '#fff', border: 'none' }}>
              <GitCommit size={12} />
              {committing ? '提交中...' : '提交'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Graph rendering for git log ──────────────────────────────────────

function renderGraph(graphStr: string, dotColor: string): string {
  if (!graphStr) return ''
  // Replace ASCII graph chars with prettier Unicode equivalents
  return graphStr
    .replace(/\*/g, '·')
    .replace(/\\/g, '╲')
    .replace(/\//g, '╱')
    .replace(/\|/g, '│')
    .replace(/-/g, '─')
}

function statusIcon(s: string) {
  const st = s.trim()
  switch (st) {
    case 'M': return <File size={12} style={{ color: 'var(--accent)' }} />
    case 'A': return <Plus size={12} style={{ color: '#10b981' }} />
    case 'D': return <Minus size={12} style={{ color: '#ef4444' }} />
    case '??': return <File size={12} style={{ color: '#f59e0b' }} />
    default: return <File size={12} style={{ color: 'var(--text-muted)' }} />
  }
}

function statusLabel(s: string) {
  const st = s.trim()
  switch (st) {
    case 'M': return 'modified'
    case 'A': return 'added'
    case 'D': return 'deleted'
    case '??': return 'untracked'
    default: return st
  }
}
