import { useState, useEffect, useCallback } from 'react'
import { useStore } from '../stores/useStore'
import { RotateCcw } from 'lucide-react'

const ACTION_LABELS: Record<string, string> = {
  toggleSidebar: '切换侧边栏',
  newSession: '新建会话',
  openSettings: '打开设置',
  openCommandPalette: '打开命令面板',
  toggleZenMode: '切换禅模式',
  formatCode: '格式化代码',
}

const DEFAULT_BINDINGS: Record<string, string> = {
  toggleSidebar: 'ctrl+b',
  newSession: 'ctrl+n',
  openSettings: 'ctrl+,',
  openCommandPalette: 'ctrl+p',
  toggleZenMode: 'ctrl+shift+z',
  formatCode: 'ctrl+shift+f',
}

function formatKeyCombo(combo: string): string {
  return combo
    .split('+')
    .map(part => {
      if (part === 'ctrl') return 'Ctrl'
      if (part === 'shift') return 'Shift'
      if (part === 'alt') return 'Alt'
      if (part === 'meta') return '⌘'
      if (part === ',') return ','
      return part.toUpperCase()
    })
    .join(' + ')
}

function parseKeyEvent(e: React.KeyboardEvent): string {
  const parts: string[] = []
  if (e.ctrlKey || e.metaKey) parts.push('ctrl')
  if (e.shiftKey) parts.push('shift')
  if (e.altKey) parts.push('alt')

  const key = e.key.toLowerCase()
  if (['control', 'shift', 'alt', 'meta'].includes(key)) {
    // Modifier only — ignore
    return ''
  }

  const mappedKey = key === ',' ? ',' : key
  parts.push(mappedKey)
  return parts.join('+')
}

export default function KeybindingsEditor() {
  const keybindings = useStore((s) => s.keybindings)
  const setKeybinding = useStore((s) => s.setKeybinding)
  const resetKeybindings = useStore((s) => s.resetKeybindings)

  const [recording, setRecording] = useState<string | null>(null)
  const [tempCombo, setTempCombo] = useState('')

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!recording) return
    e.preventDefault()
    e.stopPropagation()

    const combo = parseKeyEvent(e)
    if (combo) {
      setTempCombo(combo)
    }
  }, [recording])

  const startCapture = (action: string) => {
    if (recording === action) {
      // Save
      if (tempCombo) {
        setKeybinding(action, tempCombo)
      }
      setRecording(null)
      setTempCombo('')
    } else {
      setRecording(action)
      setTempCombo('')
    }
  }

  const cancelCapture = () => {
    setRecording(null)
    setTempCombo('')
  }

  // Global keydown capture when recording
  useEffect(() => {
    if (!recording) return
    const handler = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()

      const parts: string[] = []
      if (e.ctrlKey || e.metaKey) parts.push('ctrl')
      if (e.shiftKey) parts.push('shift')
      if (e.altKey) parts.push('alt')

      const key = e.key.toLowerCase()
      if (['control', 'shift', 'alt', 'meta'].includes(key)) return

      const mappedKey = key === ',' ? ',' : key
      parts.push(mappedKey)
      setTempCombo(parts.join('+'))
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [recording])

  const hasChanges = Object.keys(DEFAULT_BINDINGS).some(
    action => keybindings[action] !== DEFAULT_BINDINGS[action]
  )

  return (
    <div className="space-y-1">
      {Object.entries(ACTION_LABELS).map(([action, label]) => {
        const current = keybindings[action] || ''
        const isRecording = recording === action
        const isDefault = current === DEFAULT_BINDINGS[action]

        return (
          <div
            key={action}
            className="flex items-center gap-2 px-2 py-1.5 rounded text-xs"
            style={{ color: 'var(--text-secondary)' }}
          >
            <span className="flex-1" style={{ color: 'var(--text-primary)' }}>{label}</span>
            {isRecording ? (
              <div className="flex items-center gap-1" onKeyDown={handleKeyDown}>
                <kbd
                  className="px-2 py-0.5 rounded text-[10px] font-mono min-w-[60px] text-center"
                  style={{
                    background: 'var(--accent-bg)',
                    border: '1px solid var(--accent)',
                    color: 'var(--accent)',
                  }}
                >
                  {tempCombo ? formatKeyCombo(tempCombo) : '按下按键...'}
                </kbd>
                {tempCombo && (
                  <button onClick={() => startCapture(action)}
                    className="px-1.5 py-0.5 text-[9px] rounded cursor-pointer font-medium"
                    style={{ background: 'var(--accent)', color: '#fff', border: 'none' }}>
                    确定
                  </button>
                )}
                <button onClick={cancelCapture}
                  className="px-1.5 py-0.5 text-[9px] rounded cursor-pointer"
                  style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                  取消
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <kbd
                  className="px-2 py-0.5 rounded text-[10px] font-mono cursor-pointer hover:opacity-80"
                  style={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-primary)',
                  }}
                  onClick={() => startCapture(action)}
                >
                  {formatKeyCombo(current)}
                </kbd>
                {!isDefault && (
                  <button
                    onClick={() => setKeybinding(action, DEFAULT_BINDINGS[action])}
                    className="p-0.5 rounded cursor-pointer hover:opacity-70"
                    style={{ color: 'var(--text-muted)' }}
                    title="重置默认"
                  >
                    <RotateCcw size={10} />
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}

      {hasChanges && (
        <button
          onClick={resetKeybindings}
          className="mt-2 px-3 py-1.5 text-[10px] font-medium rounded cursor-pointer"
          style={{
            background: 'transparent',
            border: '1px solid var(--border-color)',
            color: 'var(--text-muted)',
          }}
        >
          重置所有快捷键
        </button>
      )}
    </div>
  )
}
