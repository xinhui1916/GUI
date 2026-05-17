import { useState, useEffect } from 'react'

const shortcuts = [
  { keys: 'Cmd+N', label: '新建会话' },
  { keys: 'Cmd+B', label: '切换侧边栏' },
  { keys: 'Cmd+,', label: '打开设置' },
  { keys: 'Cmd+Shift+F', label: '搜索消息' },
  { keys: 'Cmd+P', label: '命令面板' },
  { keys: 'Cmd+/', label: '显示此帮助' },
  { keys: 'Enter', label: '发送消息' },
  { keys: 'Shift+Enter', label: '换行' },
  { keys: 'Esc', label: '关闭弹窗 / 取消' },
]

const shortcutsEn = [
  { keys: 'Cmd+N', label: 'New session' },
  { keys: 'Cmd+B', label: 'Toggle sidebar' },
  { keys: 'Cmd+,', label: 'Open settings' },
  { keys: 'Cmd+Shift+F', label: 'Search messages' },
  { keys: 'Cmd+P', label: 'Command palette' },
  { keys: 'Cmd+/', label: 'Show this help' },
  { keys: 'Enter', label: 'Send message' },
  { keys: 'Shift+Enter', label: 'New line' },
  { keys: 'Esc', label: 'Close / Cancel' },
]

export default function ShortcutsHelp({ onClose }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false)

  // Listen for Cmd+/
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey
      if (meta && e.key === '/') {
        e.preventDefault()
        setOpen((v) => !v)
      }
      if (e.key === 'Escape' && open) {
        setOpen(false)
        onClose?.()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  // Detect language for display
  const items = document.documentElement.lang === 'en' ? shortcutsEn : shortcuts

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={() => { setOpen(false); onClose?.() }}
    >
      <div
        className="w-full max-w-sm rounded-xl shadow-2xl overflow-hidden"
        style={{ background: 'var(--sidebar-bg)', border: '1px solid var(--border-color)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{ borderBottom: '1px solid var(--border-color)' }}
        >
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            {document.documentElement.lang === 'en' ? 'Keyboard Shortcuts' : '快捷键'}
          </h3>
          <button
            onClick={() => { setOpen(false); onClose?.() }}
            className="text-lg cursor-pointer hover:opacity-70"
            style={{ color: 'var(--text-muted)' }}
          >
            ✕
          </button>
        </div>

        {/* Shortcuts list */}
        <div className="p-4 space-y-2">
          {items.map((s) => (
            <div key={s.keys} className="flex items-center justify-between">
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{s.label}</span>
              <kbd
                className="text-[11px] px-2 py-0.5 rounded font-mono"
                style={{
                  background: 'var(--bg-elevated)',
                  color: 'var(--text-muted)',
                  border: '1px solid var(--border-color)',
                }}
              >
                {s.keys}
              </kbd>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div
          className="px-5 py-2.5 text-[10px] text-center"
          style={{ borderTop: '1px solid var(--border-color)', color: 'var(--text-muted)' }}
        >
          {document.documentElement.lang === 'en' ? 'Press Cmd+/ to toggle' : '按 Cmd+/ 切换'}
        </div>
      </div>
    </div>
  )
}
