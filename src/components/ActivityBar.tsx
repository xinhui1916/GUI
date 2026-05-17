import { useState } from 'react'
import { Files, GitBranch, Settings, Maximize2, Minimize2 } from 'lucide-react'
import { useUiStore } from '../stores/uiStore'
import { useStore } from '../stores/useStore'

interface ActivityItem {
  id: string
  icon: typeof Files
  label: string
  action: () => void
}

export default function ActivityBar() {
  const [activeId, setActiveId] = useState<string | null>(null)
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)
  const setRightTab = useStore((s) => s.setRightTab)
  const openSettings = useUiStore((s) => s.openSettings)
  const items: ActivityItem[] = [
    {
      id: 'explorer',
      icon: Files,
      label: '文件浏览器',
      action: () => { setActiveId('explorer'); setRightTab('files'); toggleSidebar() },
    },
    {
      id: 'git',
      icon: GitBranch,
      label: '源代码管理',
      action: () => { setActiveId('git'); setRightTab('git') },
    },
  ]

  return (
    <div
      className="flex flex-col items-center py-2 gap-1 w-12 shrink-0"
      style={{
        background: 'var(--titlebar-bg)',
        backgroundImage: 'var(--sidebar-bg-image, none)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        borderRight: '1px solid var(--border-color)',
      }}
    >
      {items.map((item) => {
        const Icon = item.icon
        const isActive = activeId === item.id
        return (
          <button
            key={item.id}
            onClick={item.action}
            className="w-9 h-9 flex items-center justify-center rounded-md cursor-pointer transition-all hover:opacity-80"
            style={{
              color: isActive ? 'var(--accent)' : 'var(--text-muted)',
              background: isActive ? 'var(--accent-bg)' : 'transparent',
              borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
              borderRadius: 0,
            }}
            title={item.label}
          >
            <Icon size={18} />
          </button>
        )
      })}

      <div className="flex-1" />

      <button
        onClick={() => useUiStore.getState().toggleZenMode()}
        className="w-9 h-9 flex items-center justify-center rounded-md cursor-pointer transition-all hover:opacity-80"
        style={{ color: 'var(--text-muted)' }}
        title={useUiStore.getState().zenMode ? '退出禅模式' : '禅模式'}
      >
        {useUiStore.getState().zenMode ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
      </button>

      <button
        onClick={openSettings}
        className="w-9 h-9 flex items-center justify-center rounded-md cursor-pointer transition-all hover:opacity-80"
        style={{ color: 'var(--text-muted)' }}
        title="设置"
      >
        <Settings size={16} />
      </button>
    </div>
  )
}
