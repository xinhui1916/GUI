import { Search, Paperclip, Settings, MessageSquare, FolderKanban } from 'lucide-react'
import { useStore } from '../stores/useStore'
import type { Message } from '../stores/useStore'
import MessageBubble from './MessageBubble'
import ChatInput from './ChatInput'

const EMPTY_MESSAGES: Message[] = []

export default function ChatPanel() {
  const messages = useStore((s) => {
    const m = s.messages[s.activeSessionId]
    return m ?? EMPTY_MESSAGES
  })

  const workspacePath = useStore((s) => s.workspacePath)

  return (
    <div className="flex-1 flex flex-col min-w-0" style={{ background: 'var(--chat-bg)' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-3 gap-3"
        style={{ borderBottom: '1px solid var(--border-color)' }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div
            className="text-xs font-semibold px-2.5 py-1 rounded shrink-0"
            style={{
              background: 'var(--badge-bg)',
              color: 'var(--badge-text)',
              border: '1px solid var(--badge-border)',
            }}
          >
            DeepSeek V4 Flash
          </div>
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
        <div className="flex gap-2">
          <button className="px-2 py-1 rounded text-xs cursor-pointer transition-colors" style={{ border: '1px solid var(--border-light)', color: 'var(--text-secondary)', background: 'transparent' }}>
            <Search size={14} />
          </button>
          <button className="px-2 py-1 rounded text-xs cursor-pointer transition-colors" style={{ border: '1px solid var(--border-light)', color: 'var(--text-secondary)', background: 'transparent' }}>
            <Paperclip size={14} />
          </button>
          <button className="px-2 py-1 rounded text-xs cursor-pointer transition-colors" style={{ border: '1px solid var(--border-light)', color: 'var(--text-secondary)', background: 'transparent' }}>
            <Settings size={14} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
        {messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
            <MessageSquare size={48} style={{ color: 'var(--text-muted)', opacity: 0.3 }} />
            <h2 className="text-lg font-semibold mt-4" style={{ color: 'var(--text-primary)' }}>Claude Code Desktop</h2>
            <p className="text-sm mt-2" style={{ color: 'var(--text-muted)' }}>
              在下方输入消息开始对话，或选择左侧的历史会话。
            </p>
            <p className="text-xs mt-3" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>
              Enter 发送 · Shift+Enter 换行
            </p>
          </div>
        ) : (
          messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))
        )}
      </div>

      {/* Input */}
      <ChatInput />
    </div>
  )
}
