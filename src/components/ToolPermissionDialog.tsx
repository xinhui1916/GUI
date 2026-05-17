import { useState, useCallback } from 'react'
import { ShieldAlert, Check, X, Terminal, FileEdit, FileText, FileCode } from 'lucide-react'

interface PendingRequest {
  sessionId: string
  toolName: string
  detail: string
  input?: any
}

const TOOL_ICONS: Record<string, { icon: typeof ShieldAlert; label: string }> = {
  Bash: { icon: Terminal, label: '执行命令' },
  Write: { icon: FileEdit, label: '写入文件' },
  Read: { icon: FileText, label: '读取文件' },
  Edit: { icon: FileCode, label: '编辑文件' },
}

export default function ToolPermissionDialog() {
  const [request, setRequest] = useState<PendingRequest | null>(null)
  const [remember, setRemember] = useState(false)
  const [allowedTools, setAllowedTools] = useState<string[]>(() => {
    const stored = localStorage.getItem('claude-allowed-tools')
    return stored ? JSON.parse(stored) : []
  })

  const getIdentifier = (r: PendingRequest) => {
    if (r.toolName === 'Bash') return `bash:${r.detail}`
    return `${r.toolName}:${r.detail}`
  }

  const onPermissionRequest = useCallback((sessionId: string, toolName: string, detail: string, input?: any) => {
    const id = toolName === 'Bash' ? `bash:${detail}` : `${toolName}:${detail}`
    if (allowedTools.includes(id)) {
      respondToPermission(sessionId, true)
      return
    }
    setRequest({ sessionId, toolName, detail, input })
  }, [allowedTools])

  const onPermissionDone = useCallback(() => {
    setRequest(null)
  }, [])

  const respondToPermission = async (sessionId: string, allowed: boolean) => {
    try {
      const ti = (window as any).__TAURI_INTERNALS__
      if (ti) {
        await ti.invoke('respond_tool_permission', { sessionId, allowed })
      }
    } catch (e) {
      console.error('Failed to respond to permission request:', e)
    }
  }

  const handleAllow = () => {
    if (!request) return
    if (remember) {
      const id = getIdentifier(request)
      const updated = [...allowedTools, id]
      setAllowedTools(updated)
      localStorage.setItem('claude-allowed-tools', JSON.stringify(updated))
    }
    respondToPermission(request.sessionId, true)
    setRequest(null)
    setRemember(false)
  }

  const handleDeny = () => {
    if (!request) return
    respondToPermission(request.sessionId, false)
    setRequest(null)
    setRemember(false)
  }

  // Expose callbacks for App.tsx to wire up
  ;(window as any).__onToolPermissionRequest = onPermissionRequest
  ;(window as any).__onToolPermissionDone = onPermissionDone

  if (!request) return null

  const toolIcon = TOOL_ICONS[request.toolName] || { icon: ShieldAlert, label: request.toolName }

  const renderDetail = () => {
    switch (request.toolName) {
      case 'Bash':
        return (
          <pre
            className="text-xs p-3 rounded-lg overflow-x-auto whitespace-pre-wrap"
            style={{
              background: 'var(--code-bg)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono, monospace)',
            }}
          >
            {request.detail}
          </pre>
        )
      case 'Write': {
        const content = request.input?.content || ''
        return (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
              <FileEdit size={12} />
              <span className="truncate font-mono">{request.detail}</span>
            </div>
            {content && (
              <pre
                className="text-xs p-3 rounded-lg overflow-x-auto whitespace-pre-wrap max-h-[200px] overflow-y-auto"
                style={{
                  background: 'var(--code-bg)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-mono, monospace)',
                }}
              >
                {content.length > 2000 ? content.slice(0, 2000) + '\n... (截断)' : content}
              </pre>
            )}
          </div>
        )
      }
      case 'Edit':
        return (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
              <FileCode size={12} />
              <span className="truncate font-mono">{request.detail}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>旧内容:</p>
                <pre className="text-xs p-2 rounded overflow-x-auto whitespace-pre-wrap max-h-[120px] overflow-y-auto"
                  style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--text-primary)', fontFamily: 'var(--font-mono, monospace)' }}>
                  {String(request.input?.old_string || '').slice(0, 500)}
                </pre>
              </div>
              <div>
                <p className="text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>新内容:</p>
                <pre className="text-xs p-2 rounded overflow-x-auto whitespace-pre-wrap max-h-[120px] overflow-y-auto"
                  style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', color: 'var(--text-primary)', fontFamily: 'var(--font-mono, monospace)' }}>
                  {String(request.input?.new_string || '').slice(0, 500)}
                </pre>
              </div>
            </div>
          </div>
        )
      case 'Read':
        return (
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
            <FileText size={12} />
            <span className="truncate font-mono">{request.detail}</span>
          </div>
        )
      default:
        return <p className="text-xs">{request.detail}</p>
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]"
      style={{ background: 'rgba(0,0,0,0.5)' }}
    >
      <div
        className="w-full max-w-lg rounded-xl shadow-2xl overflow-hidden"
        style={{
          background: 'var(--sidebar-bg)',
          border: '1px solid var(--border-color)',
        }}
      >
        <div
          className="flex items-center gap-3 px-5 py-3.5"
          style={{ borderBottom: '1px solid var(--border-color)', background: 'rgba(239,68,68,0.08)' }}
        >
          <ShieldAlert size={18} style={{ color: '#ef4444' }} />
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            请求{toolIcon.label}
          </h2>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
              Claude 想要执行以下操作：
            </p>
            {renderDetail()}
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="rounded"
              style={{ accentColor: 'var(--accent)' }}
            />
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              记住此操作，下次自动允许
            </span>
          </label>

          <div className="flex gap-2 pt-2">
            <button
              onClick={handleDeny}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-lg cursor-pointer transition-colors"
              style={{
                background: 'transparent',
                border: '1px solid var(--border-color)',
                color: 'var(--text-secondary)',
              }}
            >
              <X size={14} />
              拒绝
            </button>
            <button
              onClick={handleAllow}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium rounded-lg cursor-pointer transition-colors"
              style={{
                background: '#ef4444',
                border: 'none',
                color: '#fff',
              }}
            >
              <Check size={14} />
              允许
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
