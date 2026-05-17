import { useState, useCallback } from 'react'
import { Activity, RefreshCw, CheckCircle, AlertTriangle, XCircle, HelpCircle, ChevronDown, ChevronRight, Cpu, Globe, Lock, Wrench, MapPin } from 'lucide-react'
import { runDiagnostic, type DiagnosticResponse } from '../lib/ipc'
import { logError } from '../lib/logger'
import { useToastStore } from '../stores/toastStore'

// ── Constants ────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  path: '路径与系统环境',
  toolchain: '核心工具链',
  gpu: '显卡与子系统',
  permission: '权限与安全',
  network: '网络与镜像',
}

const CATEGORY_ICONS: Record<string, any> = {
  path: MapPin,
  toolchain: Wrench,
  gpu: Cpu,
  permission: Lock,
  network: Globe,
}

const CATEGORY_COLORS: Record<string, string> = {
  path: '#8b5cf6',
  toolchain: '#3b82f6',
  gpu: '#10b981',
  permission: '#f59e0b',
  network: '#ec4899',
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  pass: { label: '通过', color: '#22c55e', bg: '#22c55e15', icon: CheckCircle },
  warn: { label: '警告', color: '#eab308', bg: '#eab30815', icon: AlertTriangle },
  fail: { label: '失败', color: '#ef4444', bg: '#ef444415', icon: XCircle },
  unknown: { label: '未知', color: '#94a3b8', bg: '#94a3b815', icon: HelpCircle },
}

const GRADE_COLORS: Record<string, string> = {
  excellent: '#22c55e',
  good: '#3b82f6',
  fair: '#eab308',
  poor: '#ef4444',
}

// ── Helpers ──────────────────────────────────────────────────────────────

function getGradeColor(grade: string): string {
  return GRADE_COLORS[grade] || '#94a3b8'
}

function getScoreRingColor(score: number): string {
  if (score >= 90) return '#22c55e'
  if (score >= 70) return '#3b82f6'
  if (score >= 50) return '#eab308'
  return '#ef4444'
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString('zh-CN')
  } catch {
    return iso
  }
}

// ── ScoreRing ────────────────────────────────────────────────────────────

function ScoreRing({ score, label, grade }: { score: number; label: string; grade: string }) {
  const color = getScoreRingColor(score)
  const r = 40
  const circ = 2 * Math.PI * r
  const offset = circ - (score / 100) * circ

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-28 h-28 flex items-center justify-center">
        <svg width="112" height="112" viewBox="0 0 96 96" className="absolute">
          <circle cx="48" cy="48" r={r} fill="none" stroke="var(--border-color)" strokeWidth="6" opacity={0.3} />
          <circle cx="48" cy="48" r={r} fill="none" stroke={color} strokeWidth="6"
            strokeDasharray={circ} strokeDashoffset={offset}
            strokeLinecap="round" transform="rotate(-90 48 48)"
            style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
        </svg>
        <div className="flex flex-col items-center">
          <span className="text-3xl font-bold" style={{ color }}>{score}</span>
          <span className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>{label}</span>
        </div>
      </div>
    </div>
  )
}

// ── DiagnosticPanel ─────────────────────────────────────────────────────

export default function DiagnosticPanel() {
  const [response, setResponse] = useState<DiagnosticResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null)
  const [expandedResult, setExpandedResult] = useState<string | null>(null)
  const [showBasic, setShowBasic] = useState(false)
  const addToast = useToastStore((s) => s.addToast)

  const handleScan = useCallback(async () => {
    setLoading(true)
    setResponse(null)
    try {
      const res = await runDiagnostic()
      setResponse(res)
      if (!res.ok) {
        addToast({ type: 'error', title: '诊断失败', message: res.error || '未知错误', duration: 3000 })
      } else if (!res.winaicheck_available) {
        addToast({ type: 'info', title: '基础诊断模式', message: 'WinAICheck 未安装，使用内置基础检查', duration: 4000 })
      } else {
        addToast({ type: 'success', title: '诊断完成', message: '环境检测已完成', duration: 2000 })
      }
    } catch (err: any) {
      logError('DiagnosticPanel', 'scan failed', err)
      addToast({ type: 'error', title: '诊断失败', message: err?.message || String(err), duration: 4000 })
    }
    setLoading(false)
  }, [addToast])

  const report = response?.report
  const basic = response?.basic
  const hasData = report || basic

  // Group results by category
  const categoryGroups = report ? groupByCategory(report.results) : basic ? groupBasicByCategory(basic) : []

  return (
    <div className="flex flex-col h-full text-xs">
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1.5 shrink-0" style={{ borderBottom: '1px solid var(--border-color)' }}>
        <span className="flex items-center gap-1.5 font-semibold" style={{ color: 'var(--panel-header)' }}>
          <Activity size={12} style={{ color: 'var(--accent)' }} />
          AI 环境诊断
        </span>
        <button
          onClick={handleScan}
          disabled={loading}
          className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-medium rounded cursor-pointer disabled:opacity-40 transition-colors"
          style={{ background: 'var(--accent)', color: '#fff', border: 'none' }}
        >
          <RefreshCw size={10} className={loading ? 'animate-spin' : ''} />
          {loading ? '扫描中...' : '开始检测'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {!hasData && !loading && (
          <div className="flex flex-col items-center justify-center py-12" style={{ color: 'var(--text-muted)' }}>
            <Activity size={32} style={{ opacity: 0.2 }} />
            <p className="text-xs mt-3">点击"开始检测"扫描你的 AI 开发环境</p>
            <p className="text-[10px] mt-1" style={{ opacity: 0.6 }}>检测 Git、Node.js、Python、GPU 等开发工具</p>
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center py-12">
            <RefreshCw size={20} className="animate-spin" style={{ color: 'var(--accent)' }} />
            <p className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>正在检测环境...</p>
          </div>
        )}

        {hasData && (
          <div className="p-3 space-y-3">
            {/* WinAICheck badge */}
            {response?.winaicheck_available && (
              <div className="text-[9px] text-center py-1 rounded" style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}>
                由 WinAICheck 驱动
              </div>
            )}

            {/* Basic mode info */}
            {!response?.winaicheck_available && response?.error && (
              <div className="text-[10px] p-2 rounded" style={{ background: '#f59e0b15', color: '#f59e0b', border: '1px solid #f59e0b30' }}>
                未安装 WinAICheck ({response.error})，显示基础内置检查结果
              </div>
            )}

            {/* Score dashboard */}
            {report?.score && (
              <div className="p-4 rounded-xl text-center" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-color)' }}>
                <ScoreRing
                  score={report.score.score}
                  label={report.score.label}
                  grade={report.score.grade}
                />
                <div className="flex flex-wrap gap-2 justify-center mt-3">
                  {report.score.breakdown.map(b => (
                    <div key={b.category} className="px-2 py-1 rounded text-[10px]"
                      style={{ background: `${CATEGORY_COLORS[b.category] || '#94a3b8'}15`, color: CATEGORY_COLORS[b.category] || '#94a3b8' }}>
                      {CATEGORY_LABELS[b.category] || b.category}: {b.passed}/{b.total}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Basic mode score summary */}
            {!report && basic && (
              <div className="p-4 rounded-xl" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-color)' }}>
                <div className="flex items-center gap-2 mb-2">
                  <Activity size={14} style={{ color: 'var(--accent)' }} />
                  <span className="text-[11px] font-medium" style={{ color: 'var(--text-primary)' }}>基础环境概览</span>
                </div>
                {(() => {
                  const total = basic.length
                  const passed = basic.filter(r => r.status === 'pass').length
                  const warned = basic.filter(r => r.status === 'warn').length
                  const failed = basic.filter(r => r.status === 'fail').length
                  return (
                    <div className="flex gap-3">
                      <div className="flex-1 text-center p-2 rounded" style={{ background: '#22c55e10' }}>
                        <div className="text-lg font-bold" style={{ color: '#22c55e' }}>{passed}</div>
                        <div className="text-[9px]" style={{ color: 'var(--text-muted)' }}>通过</div>
                      </div>
                      <div className="flex-1 text-center p-2 rounded" style={{ background: '#eab30810' }}>
                        <div className="text-lg font-bold" style={{ color: '#eab308' }}>{warned}</div>
                        <div className="text-[9px]" style={{ color: 'var(--text-muted)' }}>警告</div>
                      </div>
                      <div className="flex-1 text-center p-2 rounded" style={{ background: '#ef444410' }}>
                        <div className="text-lg font-bold" style={{ color: '#ef4444' }}>{failed}</div>
                        <div className="text-[9px]" style={{ color: 'var(--text-muted)' }}>失败</div>
                      </div>
                    </div>
                  )
                })()}
              </div>
            )}

            {/* Timestamp */}
            {report?.timestamp && (
              <p className="text-[9px] text-center" style={{ color: 'var(--text-muted)' }}>
                检测时间: {formatTime(report.timestamp)}
              </p>
            )}

            {/* Category groups */}
            {categoryGroups.map(({ category, items }) => {
              const isExpanded = expandedCategory === category
              const Icon = CATEGORY_ICONS[category] || Activity
              const color = CATEGORY_COLORS[category] || 'var(--text-muted)'
              const passed = items.filter(r => r.status === 'pass').length
              const total = items.length

              return (
                <div key={category} className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border-color)' }}>
                  {/* Category header */}
                  <button
                    onClick={() => setExpandedCategory(isExpanded ? null : category)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left cursor-pointer hover:opacity-80"
                    style={{ background: 'var(--bg-elevated)' }}
                  >
                    {isExpanded ? <ChevronDown size={11} style={{ color }} /> : <ChevronRight size={11} style={{ color }} />}
                    <Icon size={12} style={{ color }} />
                    <span className="text-[11px] font-medium flex-1" style={{ color: 'var(--text-primary)' }}>
                      {CATEGORY_LABELS[category] || category}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded" style={{
                      color,
                      background: `${color}15`,
                    }}>
                      {passed}/{total}
                    </span>
                  </button>

                  {/* Items */}
                  {isExpanded && (
                    <div style={{ borderTop: '1px solid var(--border-color)' }}>
                      {items.map((r: any) => {
                        const cfg = STATUS_CONFIG[r.status] || STATUS_CONFIG.unknown
                        const IconStatus = cfg.icon
                        const isDetailExpanded = expandedResult === r.id

                        return (
                          <div key={r.id} className="px-3 py-1.5" style={{ borderBottom: '1px solid var(--border-color)' }}
                            onMouseEnter={undefined} onMouseLeave={undefined}>
                            <div className="flex items-start gap-2">
                              <IconStatus size={12} className="shrink-0 mt-0.5" style={{ color: cfg.color }} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[11px] font-medium" style={{ color: 'var(--text-primary)' }}>
                                    {r.name}
                                  </span>
                                  <span className="text-[9px] px-1 py-0.5 rounded" style={{
                                    color: cfg.color,
                                    background: cfg.bg,
                                  }}>
                                    {cfg.label}
                                  </span>
                                </div>
                                <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{r.message}</p>
                                {r.version && (
                                  <p className="text-[9px] font-mono mt-0.5" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>
                                    版本: {r.version}
                                  </p>
                                )}
                                {(r.detail || r.error_type) && (
                                  <div className="mt-1">
                                    <button
                                      onClick={() => setExpandedResult(isDetailExpanded ? null : r.id)}
                                      className="text-[9px] cursor-pointer hover:opacity-70"
                                      style={{ color: 'var(--accent)' }}
                                    >
                                      {isDetailExpanded ? '收起详情' : '查看详情'}
                                    </button>
                                    {isDetailExpanded && (
                                      <div className="mt-1 p-1.5 rounded text-[9px] font-mono whitespace-pre-wrap"
                                        style={{ background: 'var(--input-bg)', color: 'var(--text-muted)' }}>
                                        {r.detail && <div>{r.detail}</div>}
                                        {r.error_type && <div>错误类型: {r.error_type}</div>}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Grouping helpers ─────────────────────────────────────────────────────

interface GroupedItem {
  id: string
  name: string
  category: string
  status: string
  message: string
  detail?: string
  version?: string
  error_type?: string
}

function groupByCategory(results: any[]): { category: string; items: GroupedItem[] }[] {
  const map = new Map<string, GroupedItem[]>()
  for (const r of results) {
    const list = map.get(r.category) || []
    list.push({
      id: r.id,
      name: r.name,
      category: r.category,
      status: r.status,
      message: r.message,
      detail: r.detail,
      version: r.version,
      error_type: r.error_type,
    })
    map.set(r.category, list)
  }
  const order = ['path', 'toolchain', 'gpu', 'permission', 'network']
  return order
    .filter(c => map.has(c))
    .map(c => ({ category: c, items: map.get(c)! }))
    .concat(
      Array.from(map.entries())
        .filter(([c]) => !order.includes(c))
        .map(([category, items]) => ({ category, items }))
    )
}

function groupBasicByCategory(results: any[]): { category: string; items: GroupedItem[] }[] {
  const map = new Map<string, GroupedItem[]>()
  for (const r of results) {
    const cat = r.category || 'unknown'
    const list = map.get(cat) || []
    list.push({
      id: r.id,
      name: r.name,
      category: cat,
      status: r.status,
      message: r.message,
      detail: r.detail,
      version: r.version,
    })
    map.set(cat, list)
  }
  const order = ['path', 'toolchain', 'gpu', 'permission', 'network', 'unknown']
  return order
    .filter(c => map.has(c))
    .map(c => ({ category: c, items: map.get(c)! }))
}
