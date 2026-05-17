import { useEffect, useRef } from 'react'

interface ContextMenuItem {
  label: string
  icon?: React.ReactNode
  danger?: boolean
  action: () => void
}

interface ContextMenuProps {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}

export default function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [onClose])

  // Adjust position to stay within viewport
  const adjustedX = Math.min(x, window.innerWidth - 180)
  const adjustedY = Math.min(y, window.innerHeight - items.length * 32 - 16)

  return (
    <div
      ref={ref}
      className="fixed z-[60] rounded-lg py-1 shadow-xl"
      style={{
        left: adjustedX,
        top: adjustedY,
        minWidth: 160,
        background: 'var(--sidebar-bg)',
        border: '1px solid var(--border-color)',
      }}
    >
      {items.map((item, i) => (
        <button
          key={i}
          onClick={() => { item.action(); onClose() }}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left cursor-pointer transition-colors hover:opacity-80"
          style={{
            color: item.danger ? '#ef4444' : 'var(--text-primary)',
          }}
        >
          {item.icon && <span className="w-4 h-4 flex items-center justify-center shrink-0">{item.icon}</span>}
          {item.label}
        </button>
      ))}
    </div>
  )
}
