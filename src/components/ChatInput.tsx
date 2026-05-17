import { useState, useRef, useEffect, useCallback, useMemo, type DragEvent } from 'react'
import { Plus, Paperclip, Mic, Send, Loader2, X, File, Trash2, HelpCircle, Download, Bold, Italic, Code, List, ListOrdered, Link, Terminal, ChevronDown } from 'lucide-react'
import { useStore } from '../stores/useStore'
import { useToastStore } from '../stores/toastStore'
import { logError } from '../lib/logger'

const SLASH_COMMANDS = [
  { id: 'clear', label: '/clear', description: '清空当前会话', icon: Trash2 },
  { id: 'help', label: '/help', description: '显示帮助信息', icon: HelpCircle },
  { id: 'export', label: '/export', description: '导出当前会话为 Markdown', icon: Download },
]

const TEMPLATE_PRESETS = [
  { name: '写单元测试', prompt: '请为以下代码编写全面的单元测试，覆盖正常情况、边界情况和异常情况。使用适当的测试框架和断言风格。' },
  { name: '优化代码', prompt: '请优化以下代码的性能和可读性，提供优化的具体原因和改进前后的对比。' },
  { name: '解释代码', prompt: '请详细解释以下代码的功能、工作原理和关键设计决策，帮助我理解这段代码。' },
  { name: '添加注释', prompt: '请为以下代码添加清晰、简洁的中文注释，说明每个函数、参数和关键逻辑的作用。' },
  { name: 'Review 代码', prompt: '请 Review 以下代码，指出潜在的问题、安全漏洞、性能瓶颈和改进建议。' },
  { name: '重构建议', prompt: '请分析以下代码的结构问题，给出重构建议，使代码更加模块化、可维护和可测试。' },
]

interface FileAttachment {
  name: string
  content: string
  type?: 'text' | 'image'
}

const MAX_TEXT_SIZE = 100 * 1024 // 100KB
const MAX_IMAGE_SIZE = 5 * 1024 * 1024 // 5MB

export default function ChatInput() {
  const [value, setValue] = useState('')
  const [files, setFiles] = useState<FileAttachment[]>([])
  const [dragging, setDragging] = useState(false)
  const [slashIdx, setSlashIdx] = useState(0)
  const [showTemplates, setShowTemplates] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const sendMessage = useStore((s) => s.sendUserMessage)
  const isStreaming = useStore((s) => s.isStreaming)
  const clearSession = useStore((s) => s.clearSession)
  const activeSessionId = useStore((s) => s.activeSessionId)
  const addToast = useToastStore((s) => s.addToast)

  const showSlash = value === '/' || value.startsWith('/') && !value.includes(' ')
  const filteredCmds = useMemo(() => {
    if (!value.startsWith('/')) return []
    const term = value.slice(1).toLowerCase()
    return SLASH_COMMANDS.filter(c => c.label.slice(1).startsWith(term))
  }, [value])

  const executeSlash = useCallback((cmdId: string) => {
    switch (cmdId) {
      case 'clear':
        clearSession(activeSessionId)
        addToast({ type: 'info', title: '会话已清空', duration: 2000 })
        break
      case 'help':
        sendMessage('请介绍一下你可以帮我做什么，列出你的主要功能和使用技巧。')
        break
      case 'export':
        // Trigger export via custom event
        window.dispatchEvent(new CustomEvent('claude-export-chat'))
        addToast({ type: 'info', title: '正在导出...', duration: 1500 })
        break
    }
  }, [activeSessionId, clearSession, sendMessage, addToast])

  useEffect(() => {
    const ta = textareaRef.current
    if (ta) {
      ta.style.height = 'auto'
      ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'
    }
  }, [value])

  // Listen for code inserted from editor (claude-insert-text event)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      try {
        const data = typeof detail === 'string' ? JSON.parse(detail) : detail
        const codeBlock = '```\n' + data.text + '\n```'
        const prefix = data.fileName ? `[文件: ${data.fileName}]\n` : ''
        setValue(prev => prev ? `${prev}\n\n${prefix}${codeBlock}` : `${prefix}${codeBlock}`)
        textareaRef.current?.focus()
      } catch (err) { logError('ChatInput', 'parse claude-insert-text event failed', err) }
    }
    window.addEventListener('claude-insert-text', handler)
    return () => window.removeEventListener('claude-insert-text', handler)
  }, [])

  const handleSend = useCallback(() => {
    const text = value.trim()
    if ((!text && files.length === 0) || isStreaming) return

    // Handle slash commands
    if (showSlash && filteredCmds.length > 0) {
      const cmd = filteredCmds[slashIdx] || filteredCmds[0]
      executeSlash(cmd.id)
      setValue('')
      return
    }

    // Separate images and text files
    const txtFiles = files.filter(f => f.type !== 'image')

    // Build text content with non-image file attachments
    let textContent = text
    if (txtFiles.length > 0) {
      const fileBlocks = txtFiles.map((f) =>
        `\n\n[文件: ${f.name}]\n\`\`\`\n${f.content}\n\`\`\``
      ).join('')
      textContent = text ? text + '\n' + fileBlocks : fileBlocks
    }

    setValue('')
    setFiles([])
    sendMessage(textContent)
  }, [value, files, isStreaming, sendMessage, showSlash, filteredCmds, slashIdx, executeSlash])

  const isImage = (name: string, mime: string) =>
    mime.startsWith('image/') || /\.(png|jpg|jpeg|gif|webp|bmp|svg)$/i.test(name)

  const readFile = useCallback(async (file: File) => {
    if (isImage(file.name, file.type)) {
      if (file.size > MAX_IMAGE_SIZE) {
        addToast?.({ type: 'warning', title: '图片过大', message: `${file.name} (超过5MB)`, duration: 3000 })
        return
      }
      const reader = new FileReader()
      reader.onload = () => {
        setFiles((prev) => [...prev, { name: file.name, content: reader.result as string, type: 'image' }])
      }
      reader.readAsDataURL(file)
      return
    }

    if (file.size > MAX_TEXT_SIZE) {
      addToast?.({ type: 'warning', title: '文件过大', message: `${file.name} (超过100KB)`, duration: 3000 })
      return
    }
    if (file.type && !file.type.startsWith('text/') && !file.type.includes('json') && !file.type.includes('javascript') && !file.type.includes('typescript') && !file.type.includes('shell')) {
      return
    }
    const text = await file.text()
    setFiles((prev) => [...prev, { name: file.name, content: text, type: 'text' }])
  }, [addToast])

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const droppedFiles = Array.from(e.dataTransfer.files)
    droppedFiles.forEach((f) => readFile(f))
  }, [readFile])

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
    setDragging(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setDragging(false)
  }, [])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || [])
    selected.forEach((f) => readFile(f))
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [readFile])

  const removeFile = useCallback((name: string) => {
    setFiles((prev) => prev.filter((f) => f.name !== name))
  }, [])

  const wrapSelection = useCallback((before: string, after: string) => {
    const ta = textareaRef.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const selected = value.substring(start, end) || 'text'
    const newVal = value.substring(0, start) + before + selected + after + value.substring(end)
    setValue(newVal)
    requestAnimationFrame(() => {
      ta.focus()
      ta.selectionStart = start + before.length
      ta.selectionEnd = start + before.length + selected.length
    })
  }, [value])

  const insertAtStart = useCallback((prefix: string) => {
    const ta = textareaRef.current
    if (!ta) return
    const start = ta.selectionStart
    const lineStart = value.lastIndexOf('\n', start - 1) + 1
    const newVal = value.substring(0, lineStart) + prefix + value.substring(lineStart)
    setValue(newVal)
    requestAnimationFrame(() => {
      ta.focus()
      ta.selectionStart = ta.selectionEnd = lineStart + prefix.length
    })
  }, [value])

  return (
    <div
      className="relative"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {/* Drag overlay */}
      {dragging && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center rounded-lg"
          style={{
            background: 'var(--accent-bg)',
            border: '2px dashed var(--accent)',
            pointerEvents: 'none',
          }}
        >
          <p className="text-sm font-medium" style={{ color: 'var(--accent)' }}>拖拽文件到此处</p>
        </div>
      )}

      {/* Slash command popup */}
      {showSlash && filteredCmds.length > 0 && (
        <div
          className="absolute bottom-full left-4 right-4 mb-1 rounded-lg overflow-hidden shadow-xl z-20"
          style={{
            background: 'var(--sidebar-bg)',
            border: '1px solid var(--border-color)',
          }}
        >
          {filteredCmds.map((cmd, idx) => (
            <button
              key={cmd.id}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-left cursor-pointer transition-colors"
              style={{
                background: idx === slashIdx ? 'var(--accent-bg)' : 'transparent',
                borderLeft: idx === slashIdx ? '2px solid var(--accent)' : '2px solid transparent',
              }}
              onMouseEnter={() => setSlashIdx(idx)}
              onClick={() => { executeSlash(cmd.id); setValue(''); textareaRef.current?.focus() }}
            >
              <cmd.icon size={14} style={{ color: 'var(--text-muted)' }} />
              <div>
                <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{cmd.label}</span>
                <span className="text-[10px] ml-2" style={{ color: 'var(--text-muted)' }}>{cmd.description}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      <div className="px-4 py-3" style={{ borderTop: '1px solid var(--border-color)' }}>
        {/* Markdown toolbar */}
        <div className="flex items-center gap-0.5 mb-2">
          {[
            { icon: Bold, action: () => wrapSelection('**', '**'), title: '粗体' },
            { icon: Italic, action: () => wrapSelection('*', '*'), title: '斜体' },
            { icon: Code, action: () => wrapSelection('`', '`'), title: '行内代码' },
            { icon: Terminal, action: () => wrapSelection('```\n', '\n```'), title: '代码块' },
            { icon: List, action: () => insertAtStart('- '), title: '无序列表' },
            { icon: ListOrdered, action: () => insertAtStart('1. '), title: '有序列表' },
            { icon: Link, action: () => wrapSelection('[', '](url)'), title: '链接' },
          ].map((btn) => (
            <button
              key={btn.title}
              onClick={btn.action}
              className="p-1 rounded cursor-pointer hover:opacity-70"
              style={{ color: 'var(--text-muted)' }}
              title={btn.title}
            >
              <btn.icon size={14} />
            </button>
          ))}
          <div className="flex-1" />
          <div className="relative">
            <button
              onClick={() => setShowTemplates(v => !v)}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] cursor-pointer hover:opacity-70"
              style={{ color: 'var(--text-muted)' }}
              title="快速模板"
            >
              <ChevronDown size={12} />
              <span>模板</span>
            </button>
            {showTemplates && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowTemplates(false)} />
                <div
                  className="absolute bottom-full right-0 mb-1 rounded-lg overflow-hidden shadow-xl z-20 min-w-[160px]"
                  style={{ background: 'var(--sidebar-bg)', border: '1px solid var(--border-color)' }}
                >
                  {TEMPLATE_PRESETS.map((tpl) => (
                    <button
                      key={tpl.name}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left cursor-pointer hover:opacity-80"
                      style={{ color: 'var(--text-primary)' }}
                      onClick={() => {
                        setValue(tpl.prompt + '\n\n')
                        setShowTemplates(false)
                        textareaRef.current?.focus()
                      }}
                    >
                      <File size={12} style={{ color: 'var(--text-muted)' }} />
                      {tpl.name}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* File attachments */}
        {files.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {files.map((f) => (
              <span
                key={f.name}
                className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded"
                style={{
                  background: 'var(--badge-bg)',
                  color: 'var(--badge-text)',
                  border: '1px solid var(--badge-border)',
                }}
              >
                {f.type === 'image' ? (
                  <img src={f.content} alt={f.name} className="w-5 h-5 rounded object-cover" />
                ) : (
                  <File size={11} />
                )}
                <span className="max-w-[120px] truncate">{f.name}</span>
                <button
                  onClick={() => removeFile(f.name)}
                  className="cursor-pointer hover:opacity-70"
                >
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        )}

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
            placeholder="输入消息，Enter 发送... (拖拽文件以附加)"
            className="flex-1 bg-transparent border-none outline-none resize-none text-sm leading-relaxed"
            style={{ color: 'var(--text-primary)', minHeight: 20, maxHeight: 120 }}
            onPaste={(e) => {
              const items = e.clipboardData?.items
              if (!items) return
              for (const item of Array.from(items)) {
                if (item.kind === 'file') {
                  const file = item.getAsFile()
                  if (file) readFile(file)
                }
              }
            }}
            onKeyDown={(e) => {
              if (showSlash && filteredCmds.length > 0) {
                if (e.key === 'ArrowDown') { e.preventDefault(); setSlashIdx(i => Math.min(i + 1, filteredCmds.length - 1)); return }
                if (e.key === 'ArrowUp') { e.preventDefault(); setSlashIdx(i => Math.max(i - 1, 0)); return }
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); return }
                if (e.key === 'Escape') { setValue(''); return }
              }
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
          />
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileSelect}
            accept=".txt,.md,.json,.js,.ts,.jsx,.tsx,.css,.html,.rs,.py,.go,.java,.yaml,.yml,.toml,.xml,.sh,.bash,.png,.jpg,.jpeg,.gif,.webp,.bmp,.svg"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-1 cursor-pointer shrink-0"
            style={{ color: 'var(--text-muted)' }}
            title="附加文件"
          >
            <Paperclip size={16} />
          </button>
          <button className="p-1 cursor-pointer shrink-0" style={{ color: 'var(--text-muted)' }}>
            <Mic size={16} />
          </button>
          <button
            onClick={handleSend}
            disabled={isStreaming || (!value.trim() && files.length === 0)}
            className="p-1.5 rounded-md cursor-pointer shrink-0 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: isStreaming ? 'var(--text-muted)' : 'var(--accent)', color: '#fff' }}
          >
            {isStreaming ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>
      </div>
    </div>
  )
}
