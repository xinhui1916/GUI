import { useState, useRef, useEffect } from 'react'
import { Palette } from 'lucide-react'
import { useStore, themeNames } from '../stores/useStore'
import ThemeSwitcher from './ThemeSwitcher'

export default function Titlebar() {
  const [showThemePicker, setShowThemePicker] = useState(false)
  const theme = useStore((s) => s.theme)
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        showThemePicker &&
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        btnRef.current &&
        !btnRef.current.contains(e.target as Node)
      ) {
        setShowThemePicker(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showThemePicker])

  return (
    <div
      className="flex items-center px-4 py-2.5 select-none shrink-0"
      style={{ background: 'var(--titlebar-bg)', borderBottom: '1px solid var(--border-color)' }}
    >
      {/* Traffic light dots */}
      <div className="flex gap-1.5 mr-4">
        <div className="w-3 h-3 rounded-full" style={{ background: '#ff5f56' }} />
        <div className="w-3 h-3 rounded-full" style={{ background: '#ffbd2e' }} />
        <div className="w-3 h-3 rounded-full" style={{ background: '#27c93f' }} />
      </div>

      {/* Title */}
      <div className="flex-1 text-center">
        <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
          Claude Code Desktop
        </span>
      </div>

      {/* Theme switcher button */}
      <div className="relative flex items-center gap-3">
        <button
          ref={btnRef}
          onClick={() => setShowThemePicker(!showThemePicker)}
          className="flex items-center gap-1.5 px-2 py-1 rounded text-xs cursor-pointer transition-colors"
          style={{
            color: 'var(--text-secondary)',
            border: '1px solid var(--border-light)',
            background: 'var(--bg-elevated)',
          }}
          title="切换主题"
        >
          <Palette size={14} />
          <span>{themeNames[theme]}</span>
        </button>

        {showThemePicker && (
          <div ref={panelRef} className="absolute top-full right-0 mt-2 z-50">
            <ThemeSwitcher onSelect={() => setShowThemePicker(false)} />
          </div>
        )}

        {/* Badge */}
        <div
          className="text-xs font-semibold px-2 py-0.5 rounded"
          style={{
            background: 'var(--badge-bg)',
            color: 'var(--badge-text)',
            border: '1px solid var(--badge-border)',
          }}
        >
          DeepSeek V4 Flash
        </div>
      </div>
    </div>
  )
}
