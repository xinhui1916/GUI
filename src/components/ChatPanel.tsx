import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso'
import { Square, MessageSquare, FolderKanban, RefreshCw, Download, ChevronDown, Search, X, ChevronUp, FileText } from 'lucide-react'
import { useStore } from '../stores/useStore'
import type { Message } from '../stores/useStore'
import MessageBubble from './MessageBubble'
import ChatInput from './ChatInput'

const EMPTY_MESSAGES: Message[] = []

function isErrorMessage(msg: Message): boolean {
  return msg.role === 'assistant' && !msg.streaming &&
    (msg.content.startsWith('连接失败') || msg.content.startsWith('API') || msg.content.startsWith('Error') || msg.content.includes('未安装'))
}

export default function ChatPanel() {
  const virtuosoRef = useRef<VirtuosoHandle>(null)
  const prevMsgLenRef = useRef(0)
  const [atBottom, setAtBottom] = useState(true)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [currentMatch, setCurrentMatch] = useState(0)

  const messages = useStore((s) => {
    const m = s.messages[s.activeSessionId]
    return m ?? EMPTY_MESSAGES
  })
  const workspacePath = useStore((s) => s.workspacePath)
  const isStreaming = useStore((s) => s.isStreaming)
  const sendUserMessage = useStore((s) => s.sendUserMessage)
  const cancelCurrentMessage = useStore((s) => s.cancelCurrentMessage)
  const compressSession = useStore((s) => s.compressSession)
  const activeSessionId = useStore((s) => s.activeSessionId)

  const lastMsgContent = messages[messages.length - 1]?.content

  // Auto-scroll when new messages added (only if at bottom)
  useEffect(() => {
    if (atBottom && messages.length > prevMsgLenRef.current) {
      virtuosoRef.current?.scrollToIndex({ index: messages.length - 1, behavior: 'smooth', align: 'end' })
    }
    prevMsgLenRef.current = messages.length
  }, [messages.length, atBottom])

  // Scroll to bottom during streaming (only if at bottom)
  useEffect(() => {
    if (atBottom && isStreaming && lastMsgContent) {
      virtuosoRef.current?.scrollToIndex({ index: 'LAST', behavior: 'auto', align: 'end' })
    }
  }, [isStreaming, lastMsgContent, atBottom])

  const scrollToBottom = useCallback(() => {
    virtuosoRef.current?.scrollToIndex({ index: messages.length - 1, behavior: 'smooth', align: 'end' })
  }, [messages.length])

  const matches = useMemo(() => {
    if (!searchQuery) return []
    const q = searchQuery.toLowerCase()
    return messages.reduce<number[]>((acc, msg, idx) => {
      if (msg.content.toLowerCase().includes(q)) acc.push(idx)
      return acc
    }, [])
  }, [messages, searchQuery])

  const handleRetry = useCallback((content: string) => {
    sendUserMessage(content)
  }, [sendUserMessage])

  const handleExport = useCallback(() => {
    if (messages.length === 0) return
    const session = useStore.getState().sessions.find(s => s.id === useStore.getState().activeSessionId)
    const sessionName = session?.name || 'chat'
    const lines: string[] = []
    lines.push(`# ${sessionName}`)
    lines.push(`> Exported on ${new Date().toLocaleString()}\n`)
    for (const msg of messages) {
      const role = msg.role === 'user' ? '**You**' : '**Claude**'
      lines.push(`---\n\n${role}:\n\n${msg.content}\n`)
    }
    const markdown = lines.join('\n')
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${sessionName.replace(/[^a-zA-Z0-9一-鿿_-]/g, '_')}.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [messages])

  const handleExportPDF = useCallback(() => {
    if (messages.length === 0) return
    const session = useStore.getState().sessions.find(s => s.id === useStore.getState().activeSessionId)
    const sessionName = session?.name || 'chat'

    const lines = messages.map((msg) => {
      const role = msg.role === 'user' ? 'You' : 'Claude'
      return `<div class="msg ${msg.role}">
        <div class="role">${role}</div>
        <div class="content">${msg.content.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
      </div>`
    }).join('\n')

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>${sessionName}</title>
<style>
  body { font: 12px/1.5 system-ui,sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; color: #1a1a1a; }
  h1 { font-size: 16px; margin-bottom: 4px; }
  .date { font-size: 11px; color: #888; margin-bottom: 20px; }
  .msg { margin-bottom: 16px; padding: 8px 12px; border-radius: 6px; }
  .msg.user { background: #e8f0fe; border-left: 3px solid #3b82f6; }
  .msg.assistant { background: #f3f4f6; border-left: 3px solid #9ca3af; }
  .role { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #666; margin-bottom: 4px; }
  .content { white-space: pre-wrap; }
  @media print { body { padding: 0; } }
</style></head><body>
<h1>${sessionName}</h1>
<p class="date">Exported on ${new Date().toLocaleString()}</p>
${lines}
</body></html>`

    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(html)
    w.document.close()
    w.focus()
    w.print()
  }, [messages])

  // Listen for /export slash command
  useEffect(() => {
    const handler = () => handleExport()
    window.addEventListener('claude-export-chat', handler)
    return () => window.removeEventListener('claude-export-chat', handler)
  }, [handleExport])

  // Cmd+F search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault()
        setSearchOpen(o => !o)
        if (!searchOpen) { setSearchQuery(''); setCurrentMatch(0) }
      }
      if (e.key === 'Escape' && searchOpen) {
        setSearchOpen(false)
        setSearchQuery('')
        setCurrentMatch(0)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [searchOpen])

  // Scroll to current match
  useEffect(() => {
    if (matches.length > 0 && currentMatch >= 0 && currentMatch < matches.length) {
      virtuosoRef.current?.scrollToIndex({ index: matches[currentMatch], behavior: 'smooth', align: 'center' })
    }
  }, [currentMatch, matches])

  const itemContent = useCallback((_idx: number, msg: Message) => (
    <div className="flex flex-col px-5 py-2">
      <MessageBubble message={msg} messageIndex={_idx} searchQuery={searchQuery} />
    </div>
  ), [searchQuery])

  const components = useMemo(() => ({
    Footer: () => <FooterContent messages={messages} handleRetry={handleRetry} />,
  }), [messages, handleRetry])

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden" style={{
      backgroundColor: 'var(--chat-bg)',
      backgroundImage: 'var(--chat-bg-image, none)',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-3 gap-3"
        style={{ borderBottom: '1px solid var(--border-color)' }}
      >
        <div className="flex items-center gap-2 min-w-0">
          {workspacePath && (
            <div
              className="flex items-center gap-1 text-[11px] px-2 py-1 rounded truncate max-w-[280px]"
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-muted)',
              }}
              title={workspacePath}
            >
              <FolderKanban size={12} className="shrink-0" style={{ color: 'var(--accent)' }} />
              <span className="truncate">{workspacePath.split('\\').pop() || workspacePath}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
            {messages.length > 20 && !isStreaming && (
              <button
                onClick={() => compressSession(activeSessionId)}
                className="px-2 py-1 rounded text-xs cursor-pointer transition-colors hover:opacity-70"
                style={{ color: 'var(--text-muted)', border: '1px solid var(--border-color)' }}
                title="压缩上下文"
              >
                压缩
              </button>
            )}
            {messages.length > 0 && !isStreaming && (
              <button
                onClick={handleExport}
                className="p-1.5 rounded cursor-pointer transition-colors hover:opacity-70"
                style={{ color: 'var(--text-muted)' }}
                title="导出 Markdown"
              >
                <Download size={14} />
              </button>
            )}
            {messages.length > 0 && !isStreaming && (
              <button
                onClick={handleExportPDF}
                className="p-1.5 rounded cursor-pointer transition-colors hover:opacity-70"
                style={{ color: 'var(--text-muted)' }}
                title="导出 PDF"
              >
                <FileText size={14} />
              </button>
            )}
          {isStreaming && (
            <button
              onClick={cancelCurrentMessage}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium cursor-pointer transition-colors"
              style={{
                background: 'rgba(239,68,68,0.15)',
                border: '1px solid rgba(239,68,68,0.3)',
                color: '#ef4444',
              }}
              title="停止生成"
            >
              <Square size={12} fill="#ef4444" />
              <span>停止</span>
            </button>
          )}
        </div>
      </div>

      {/* Search bar */}
      {searchOpen && (
        <div className="flex items-center gap-2 px-4 py-2" style={{ borderBottom: '1px solid var(--border-color)', background: 'var(--bg-elevated)' }}>
          <Search size={14} style={{ color: 'var(--text-muted)' }} />
          <input
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setCurrentMatch(0) }}
            placeholder="搜索消息..."
            className="flex-1 bg-transparent border-none outline-none text-xs"
            style={{ color: 'var(--text-primary)' }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                if (e.shiftKey) {
                  setCurrentMatch(i => (i - 1 + matches.length) % matches.length)
                } else {
                  setCurrentMatch(i => Math.min(i + 1, matches.length - 1))
                }
              }
              if (e.key === 'Escape') { setSearchOpen(false); setSearchQuery('') }
            }}
            autoFocus
          />
          {matches.length > 0 && (
            <span className="text-[10px] whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
              {currentMatch + 1}/{matches.length}
            </span>
          )}
          <button
            onClick={() => setCurrentMatch(i => Math.max(i - 1, 0))}
            className="p-0.5 cursor-pointer hover:opacity-70"
            style={{ color: 'var(--text-muted)' }}
          >
            <ChevronUp size={14} />
          </button>
          <button
            onClick={() => setCurrentMatch(i => Math.min(i + 1, matches.length - 1))}
            className="p-0.5 cursor-pointer hover:opacity-70"
            style={{ color: 'var(--text-muted)' }}
          >
            <ChevronDown size={14} />
          </button>
          <button
            onClick={() => { setSearchOpen(false); setSearchQuery(''); setCurrentMatch(0) }}
            className="p-0.5 cursor-pointer hover:opacity-70"
            style={{ color: 'var(--text-muted)' }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Messages - with virtual scrolling */}
      {messages.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center justify-center text-center px-8">
            <MessageSquare size={48} style={{ color: 'var(--text-muted)', opacity: 0.3 }} />
            <h2 className="text-lg font-semibold mt-4" style={{ color: 'var(--text-primary)' }}>Claude Code Desktop</h2>
            <p className="text-sm mt-2" style={{ color: 'var(--text-muted)' }}>
              在下方输入消息开始对话，或选择左侧的历史会话。
            </p>
            <p className="text-xs mt-3" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>
              Enter 发送 · Shift+Enter 换行
            </p>
          </div>
        </div>
      ) : (
        <div className="flex-1 relative">
          <Virtuoso
            ref={virtuosoRef}
            className="h-full"
            data={messages}
            itemContent={itemContent}
            components={components}
            followOutput={atBottom ? 'smooth' : false}
            atBottomStateChange={(bottom) => setAtBottom(bottom)}
            style={{ height: '100%' }}
          />
          {!atBottom && messages.length > 0 && (
            <button
              onClick={scrollToBottom}
              className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer transition-all hover:scale-105 shadow-lg"
              style={{
                background: 'var(--accent)',
                color: '#fff',
                border: 'none',
                opacity: 0.9,
              }}
            >
              <ChevronDown size={14} />
              回到底部
            </button>
          )}
        </div>
      )}

      {/* Input */}
      <ChatInput />
    </div>
  )
}

function FooterContent({ messages, handleRetry }: { messages: Message[]; handleRetry: (content: string) => void }) {
  const lastMsg = messages[messages.length - 1]
  const prevMsg = messages.length > 1 ? messages[messages.length - 2] : undefined
  const backendMode = useStore((s) => s.backendMode)

  if (!lastMsg) return null

  if (isErrorMessage(lastMsg) && prevMsg) {
    const isCliError = lastMsg.content.includes('CLI') || lastMsg.content.includes('安装')
    return (
      <div className="px-5 pb-2 flex items-center gap-3">
        <button
          onClick={() => handleRetry(prevMsg.content)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs cursor-pointer transition-colors hover:opacity-80"
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-color)',
            color: 'var(--accent)',
          }}
        >
          <RefreshCw size={12} />
          重试
        </button>
        {isCliError && (
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            请确保已安装 Claude CLI: npm install -g @anthropic-ai/claude-code
          </span>
        )}
        {!isCliError && backendMode === 'api' && (
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            请检查设置中的 API 地址和密钥
          </span>
        )}
      </div>
    )
  }

  return <div className="h-2" />
}
