import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import { Copy, Check, Pencil, Trash2, GitBranch, RefreshCw, FileCode } from 'lucide-react'
import { useStore, type Message } from '../stores/useStore'
import ContextMenu from './ContextMenu'
import MermaidBlock from './MermaidBlock'
import MonacoBlock from './MonacoBlock'
import { logError } from '../lib/logger'

const FILE_PATH_RE = /(\b(?:\.[\/\\]|[a-zA-Z]:[\/\\])?[\w.\-\/\\]+\.[a-zA-Z]{1,4})(?::(\d+))?\b/g
const SRC_EXT_RE = /\.(tsx?|jsx?|rs|py|go|java|kt|swift|c|cpp|h|hpp|css|scss|less|html|json|yaml|yml|toml|md|rb|php|xml|sh|bash|ps1|sql|r|vue|svelte)$/i

function convertFilePaths(text: string, workspacePath?: string): string {
  return text.replace(FILE_PATH_RE, (match, path, line) => {
    if (!SRC_EXT_RE.test(path)) return match
    if (!path.includes('/') && !path.includes('\\')) return match
    const idx = text.indexOf(match)
    if (idx > 0 && text[idx - 1] === '(' && text.substring(idx - 5, idx).includes('](')) return match
    const absPath = path.startsWith('/') || /^[a-zA-Z]:[/\\]/.test(path) ? path : (workspacePath ? `${workspacePath}/${path}` : path)
    return `[\`${match}\`](file://open?path=${encodeURIComponent(absPath)}${line ? `&line=${line}` : ''})`
  })
}

async function openFileInEditor(filePath: string) {
  try {
    const ti = (window as any).__TAURI_INTERNALS__
    if (ti) {
      await ti.invoke('open_in_editor', { path: filePath })
    }
  } catch (e) {
    console.error('Failed to open file:', e)
  }
}

function isDiffContent(code: string): boolean {
  return /^[+-]/m.test(code.trim()) && /^@@|^diff /.test(code.trim())
}

function DiffBlock({ code }: { code: string }) {
  const lines = code.split('\n')
  return (
    <div className="my-2 rounded-lg overflow-hidden text-xs font-mono leading-relaxed" style={{ background: 'var(--code-bg)', border: '1px solid var(--border-color)' }}>
      <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)' }}>
        Diff 预览
      </div>
      <div className="overflow-x-auto p-0">
        {lines.map((line, i) => {
          let bg = 'transparent'
          let prefix = ' '
          if (line.startsWith('+')) { bg = 'rgba(16,185,129,0.12)'; prefix = '+' }
          else if (line.startsWith('-')) { bg = 'rgba(239,68,68,0.12)'; prefix = '-' }
          else if (line.startsWith('@@')) { bg = 'rgba(59,130,246,0.1)'; prefix = '@' }
          return (
            <div key={i} className="flex" style={{ background: bg }}>
              <span className="w-8 text-right pr-2 select-none" style={{ color: 'var(--text-muted)', opacity: 0.4 }}>{i + 1}</span>
              <span className="w-4 shrink-0" style={{ color: line.startsWith('+') ? '#10b981' : line.startsWith('-') ? '#ef4444' : line.startsWith('@@') ? '#3b82f6' : 'var(--text-muted)' }}>{prefix}</span>
              <span className="flex-1 whitespace-pre" style={{ color: 'var(--text-primary)' }}>{line.slice(1)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function MessageBubble({ message, messageIndex, searchQuery }: { message: Message; messageIndex?: number; searchQuery?: string }) {
  const isUser = message.role === 'user'
  const isStreaming = message.streaming
  const [showRaw, setShowRaw] = useState(false)
  const editMessage = useStore((s) => s.editMessage)
  const deleteMessage = useStore((s) => s.deleteMessage)
  const regenerateMessage = useStore((s) => s.regenerateMessage)
  const activeSessionId = useStore((s) => s.activeSessionId)
  const messages = useStore((s) => s.messages)
  const setActiveSession = useStore((s) => s.setActiveSession)
  const createNewSession = useStore((s) => s.createNewSession)

  const [showActions, setShowActions] = useState(false)
  const [copied, setCopied] = useState(false)
  const [cmPos, setCmPos] = useState<{ x: number; y: number } | null>(null)

  const handleFork = useCallback(() => {
    // Create a new session, copy messages up to this index
    const newId = createNewSession()
    const currentMessages = messages[activeSessionId] || []
    const idx = messageIndex ?? currentMessages.findIndex(m => m.id === message.id)
    const branchMessages = currentMessages.slice(0, idx + 1)
    useStore.setState((s) => ({
      messages: {
        ...s.messages,
        [newId]: branchMessages.map(m => ({ ...m, streaming: false })),
      },
    }))
    setActiveSession(newId)
  }, [message.id, messageIndex, activeSessionId, messages, createNewSession, setActiveSession])
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState(message.content)
  const editRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (editing && editRef.current) {
      editRef.current.focus()
      editRef.current.setSelectionRange(editContent.length, editContent.length)
    }
  }, [editing])

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const handleEditSave = () => {
    if (editContent.trim() && editContent !== message.content) {
      editMessage(activeSessionId, message.id, editContent)
    }
    setEditing(false)
  }

  const handleDelete = () => {
    deleteMessage(activeSessionId, message.id)
  }

  const workspacePath = useStore((s) => s.workspacePath)

  const highlightedContent = useMemo(() => {
    let content = message.content
    // Convert file paths to clickable links
    content = convertFilePaths(content, workspacePath)
    if (!searchQuery) return content
    const escaped = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    try {
      const re = new RegExp(`(${escaped})`, 'gi')
      return content.replace(re, '<mark class="search-highlight">$1</mark>')
    } catch (err) {
      logError('MessageBubble', 'search highlight regex failed', err)
      return content
    }
  }, [message.content, searchQuery, workspacePath])

  if (editing) {
    return (
      <div className="flex gap-3 flex-row-reverse" style={{ maxWidth: '85%', alignSelf: 'flex-end' }}>
        <div
          className="w-7 h-7 rounded-md flex items-center justify-center text-sm font-bold shrink-0"
          style={{ background: 'var(--accent)', color: '#fff' }}
        >
          U
        </div>
        <div className="flex-1 rounded-lg overflow-hidden" style={{
          background: 'var(--bubble-user-bg)',
          border: '1px solid var(--accent)',
        }}>
          <textarea
            ref={editRef}
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleEditSave()
              if (e.key === 'Escape') { setEditContent(message.content); setEditing(false) }
            }}
            className="w-full px-3 py-2 text-sm resize-none outline-none bg-transparent"
            style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-sans)' }}
            rows={Math.min(editContent.split('\n').length, 12)}
          />
          <div className="flex justify-end gap-2 px-3 py-1.5" style={{ borderTop: '1px solid var(--border-color)' }}>
            <button
              onClick={() => { setEditContent(message.content); setEditing(false) }}
              className="text-xs px-2 py-1 rounded cursor-pointer"
              style={{ color: 'var(--text-muted)', border: '1px solid var(--border-color)' }}
            >
              取消
            </button>
            <button
              onClick={handleEditSave}
              className="text-xs px-3 py-1 rounded cursor-pointer font-medium"
              style={{ background: 'var(--accent)', color: '#fff', border: 'none' }}
            >
              保存
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="flex gap-3 message-enter relative group"
      style={{ maxWidth: '85%', alignSelf: isUser ? 'flex-end' : 'flex-start' }}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
      onContextMenu={(e) => {
        e.preventDefault()
        setCmPos({ x: e.clientX, y: e.clientY })
      }}
    >
      {cmPos && (
        <ContextMenu
          x={cmPos.x}
          y={cmPos.y}
          onClose={() => setCmPos(null)}
          items={[
            { label: '复制', icon: <Copy size={12} />, action: handleCopy },
            ...(isUser ? [{ label: '编辑', icon: <Pencil size={12} />, action: () => { setEditContent(message.content); setEditing(true) } }] : []),
            { label: '从此处分支', icon: <GitBranch size={12} />, action: handleFork },
            { label: '删除', icon: <Trash2 size={12} />, danger: true, action: handleDelete },
          ]}
        />
      )}
      {/* Action buttons (hover) */}
      <div
        className={`absolute -top-6 right-0 flex items-center gap-0.5 transition-opacity duration-150 ${showActions && !isStreaming ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      >
        <button onClick={handleCopy} className="p-1 rounded cursor-pointer hover:opacity-70" style={{ color: 'var(--text-muted)' }} title={copied ? '已复制' : '复制'}>
          {copied ? <Check size={12} style={{ color: 'var(--accent)' }} /> : <Copy size={12} />}
        </button>
        {!isUser && !isStreaming && (
          <button
            onClick={() => regenerateMessage(activeSessionId, message.id)}
            className="p-1 rounded cursor-pointer hover:opacity-70"
            style={{ color: 'var(--text-muted)' }}
            title="重新生成"
          >
            <RefreshCw size={12} />
          </button>
        )}
        {!isUser && !isStreaming && (
          <button onClick={() => setShowRaw(!showRaw)} className="p-1 rounded cursor-pointer hover:opacity-70" style={{ color: showRaw ? 'var(--accent)' : 'var(--text-muted)' }} title={showRaw ? '预览' : '原始 Markdown'}>
            <FileCode size={12} />
          </button>
        )}
        {isUser && (
          <button onClick={() => { setEditContent(message.content); setEditing(true) }} className="p-1 rounded cursor-pointer hover:opacity-70" style={{ color: 'var(--text-muted)' }} title="编辑">
            <Pencil size={12} />
          </button>
        )}
        <button onClick={handleDelete} className="p-1 rounded cursor-pointer hover:opacity-70" style={{ color: 'var(--text-muted)' }} title="删除">
          <Trash2 size={12} />
        </button>
      </div>

      {/* Avatar */}
      {isUser ? (
        <div
          className="w-7 h-7 rounded-md flex items-center justify-center text-sm font-bold shrink-0"
          style={{
            background: 'var(--avatar-user-image, var(--accent))',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            color: '#fff',
            border: 'none',
          }}
        >
          U
        </div>
      ) : (
        <div className="shrink-0">
          <div
            className="w-12 h-12 rounded-full shrink-0"
            style={{
              background: 'var(--avatar-ai-image, url(./ai-avatar.png))',
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              border: '2px solid var(--border-light)',
            }}
          />
        </div>
      )}

      {/* Bubble */}
      <div
        className="rounded-lg px-3.5 py-2.5 overflow-hidden"
        style={{
          background: isUser ? 'var(--bubble-user-bg)' : 'var(--bubble-assistant-bg)',
          backgroundImage: isUser ? 'var(--bubble-user-bg-image, none)' : 'var(--bubble-assistant-bg-image, none)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          border: `1px solid ${isUser ? 'var(--bubble-user-border)' : 'var(--bubble-assistant-border)'}`,
          boxShadow: 'var(--card-glow, none)',
        }}
      >
        {isStreaming && !message.content && (
          <div className="flex items-center gap-2 py-1">
            <div className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--accent)', animation: 'pulse-dot 1.4s infinite ease-in-out' }} />
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--accent)', animation: 'pulse-dot 1.4s infinite ease-in-out 0.2s' }} />
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--accent)', animation: 'pulse-dot 1.4s infinite ease-in-out 0.4s' }} />
            </div>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>正在思考...</span>
          </div>
        )}
        {showRaw ? (
          <pre className="text-xs whitespace-pre-wrap rounded p-2" style={{ color: 'var(--text-primary)', background: 'var(--code-bg)', border: '1px solid var(--border-color)', maxHeight: 400, overflow: 'auto' }}>
            {highlightedContent}
          </pre>
        ) : (
          <div className="prose prose-sm max-w-none" style={{ color: 'var(--text-primary)' }}>
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeRaw]}
              components={{
                code({ className, children, ...props }) {
                  const match = /language-(\w+)/.exec(className || '')
                  const isInline = !match
                  if (isInline) {
                    return (
                      <code className="text-xs px-1 py-0.5 rounded" style={{ background: 'var(--code-bg)', color: 'var(--accent)' }} {...props}>
                        {children}
                      </code>
                    )
                  }
                  const codeStr = String(children).replace(/\n$/, '')
                  if (match[1] === 'mermaid') {
                    return <MermaidBlock code={codeStr} />
                  }
                  if (match[1] === 'diff' || match[1] === 'patch' || isDiffContent(codeStr)) {
                    return <DiffBlock code={codeStr} />
                  }
                  return <MonacoBlock code={codeStr} language={match[1]} />
                },
                h1({ children }) { return <h1 className="text-lg font-bold mt-4 mb-2" style={{ color: 'var(--text-primary)' }}>{children}</h1> },
                h2({ children }) { return <h2 className="text-base font-bold mt-3 mb-2" style={{ color: 'var(--text-primary)' }}>{children}</h2> },
                h3({ children }) { return <h3 className="text-sm font-bold mt-2 mb-1" style={{ color: 'var(--text-primary)' }}>{children}</h3> },
                p({ children }) { return <p className="text-sm leading-relaxed mb-2 last:mb-0" style={{ color: 'var(--text-primary)' }}>{children}</p> },
                a({ href, children }) {
                  if (href?.startsWith('file://')) {
                    const params = new URLSearchParams(href.split('?')[1] || '')
                    const path = params.get('path') || decodeURIComponent(href.replace('file://open?path=', '').split('&')[0])
                    return (
                      <a href="#" onClick={(e) => { e.preventDefault(); openFileInEditor(path) }}
                        className="cursor-pointer" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>
                        {children}
                      </a>
                    )
                  }
                  return <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>{children}</a>
                },
                img({ src, alt }) {
                  if (!src) return null
                  return (
                    <img src={src} alt={alt || ''} className="max-w-full rounded-md my-2" style={{ maxHeight: 400 }}
                      loading="lazy" />
                  )
                },
                ul({ children }) { return <ul className="text-sm mb-2 pl-5 space-y-1" style={{ color: 'var(--text-primary)' }}>{children}</ul> },
                ol({ children }) { return <ol className="text-sm mb-2 pl-5 space-y-1" style={{ color: 'var(--text-primary)' }}>{children}</ol> },
                li({ children }) { return <li className="text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>{children}</li> },
                blockquote({ children }) {
                  return <blockquote className="pl-3 my-2 italic" style={{ borderLeft: '3px solid var(--accent)', color: 'var(--text-muted)', background: 'var(--bg-elevated)', padding: '4px 12px', borderRadius: '0 4px 4px 0' }}>{children}</blockquote>
                },
                table({ children }) { return <div className="overflow-x-auto my-2"><table className="text-xs w-full border-collapse" style={{ color: 'var(--text-primary)' }}>{children}</table></div> },
                th({ children }) { return <th className="px-3 py-1.5 text-left font-semibold" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-color)' }}>{children}</th> },
                td({ children }) { return <td className="px-3 py-1.5" style={{ border: '1px solid var(--border-color)' }}>{children}</td> },
                hr() { return <hr className="my-3" style={{ borderColor: 'var(--border-color)' }} /> },
                strong({ children }) { return <strong className="font-semibold" style={{ color: 'var(--text-primary)' }}>{children}</strong> },
              }}
            >
              {highlightedContent}
            </ReactMarkdown>
            {isStreaming && message.content && <span className="streaming-cursor" />}
          </div>
        )}

        {/* File tags */}
        {message.files && message.files.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {message.files.map((f) => (
              <span key={f} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded"
                style={{ background: 'var(--badge-bg)', color: 'var(--badge-text)', border: '1px solid var(--badge-border)' }}>
                <span className="opacity-70">{/\.(png|jpg|jpeg|gif|webp|bmp|svg)$/i.test(f) ? '🖼' : '📄'}</span>{f}
              </span>
            ))}
          </div>
        )}
        {/* Image attachments */}
        {message.images && message.images.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {message.images.map((src, i) => (
              <a key={i} href={src} target="_blank" rel="noopener noreferrer">
                <img src={src} alt={`Image ${i + 1}`} className="max-w-[200px] max-h-[200px] rounded-lg object-cover border cursor-pointer hover:opacity-90 transition-opacity"
                  style={{ borderColor: 'var(--border-color)' }} loading="lazy" />
              </a>
            ))}
          </div>
        )}
        {(message.time || message.elapsed) && (
          <div className="text-[10px] mt-1.5 text-right" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>
            {message.time}{message.elapsed !== undefined ? ` · ${message.elapsed.toFixed(1)}s` : ''}
          </div>
        )}
      </div>
    </div>
  )
}

