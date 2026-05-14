import { useState, useRef, useEffect } from 'react'
import { Plus, Paperclip, Mic, Send, Loader2 } from 'lucide-react'
import { useStore } from '../stores/useStore'

export default function ChatInput() {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const sendMessage = useStore((s) => s.sendUserMessage)
  const isStreaming = useStore((s) => s.isStreaming)

  useEffect(() => {
    const ta = textareaRef.current
    if (ta) {
      ta.style.height = 'auto'
      ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'
    }
  }, [value])

  const handleSend = () => {
    const text = value.trim()
    if (!text || isStreaming) return
    setValue('')
    sendMessage(text)
  }

  return (
    <div
      className="px-4 py-3"
      style={{ borderTop: '1px solid var(--border-color)' }}
    >
      <div
        className="flex items-end gap-2 rounded-lg px-3 py-2"
        style={{ background: 'var(--input-bg)', border: '1px solid var(--border-light)' }}
      >
        <button className="p-1 cursor-pointer shrink-0" style={{ color: 'var(--text-muted)' }}>
          <Plus size={18} />
        </button>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={1}
          placeholder="输入消息，Enter 发送..."
          className="flex-1 bg-transparent border-none outline-none resize-none text-sm leading-relaxed"
          style={{ color: 'var(--text-primary)', minHeight: 20, maxHeight: 120 }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
        />
        <button className="p-1 cursor-pointer shrink-0" style={{ color: 'var(--text-muted)' }}>
          <Paperclip size={16} />
        </button>
        <button className="p-1 cursor-pointer shrink-0" style={{ color: 'var(--text-muted)' }}>
          <Mic size={16} />
        </button>
        <button
          onClick={handleSend}
          disabled={isStreaming || !value.trim()}
          className="p-1.5 rounded-md cursor-pointer shrink-0 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: isStreaming ? 'var(--text-muted)' : 'var(--accent)', color: '#fff' }}
        >
          {isStreaming ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </button>
      </div>
    </div>
  )
}
