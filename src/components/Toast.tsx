import { useEffect } from 'react'
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react'
import { useToastStore, type ToastType } from '../stores/toastStore'

const ICON: Record<ToastType, typeof CheckCircle> = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
}

const COLORS: Record<ToastType, { accent: string; bg: string }> = {
  success: { accent: '#22c55e', bg: 'rgba(34,197,94,0.1)' },
  error: { accent: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
  warning: { accent: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
  info: { accent: '#3b82f6', bg: 'rgba(59,130,246,0.1)' },
}

function ToastItem({ id, type, title, message, duration }: {
  id: string; type: ToastType; title: string; message?: string; duration: number
}) {
  const removeToast = useToastStore((s) => s.removeToast)
  const Icon = ICON[type]
  const colors = COLORS[type]

  useEffect(() => {
    if (duration <= 0) return
    const timer = setTimeout(() => removeToast(id), duration)
    return () => clearTimeout(timer)
  }, [id, duration, removeToast])

  return (
    <div
      className="flex items-start gap-3 px-4 py-3 rounded-lg shadow-lg text-xs min-w-[280px] max-w-[400px] animate-slide-in"
      style={{
        background: 'var(--sidebar-bg)',
        border: '1px solid var(--border-color)',
      }}
    >
      <Icon size={18} className="shrink-0 mt-0.5" style={{ color: colors.accent }} />
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>{title}</div>
        {message && (
          <div className="mt-0.5" style={{ color: 'var(--text-muted)' }}>{message}</div>
        )}
      </div>
      <button
        onClick={() => removeToast(id)}
        className="shrink-0 p-0.5 rounded cursor-pointer transition-colors hover:opacity-70"
        style={{ color: 'var(--text-muted)' }}
      >
        <X size={14} />
      </button>
    </div>
  )
}

export default function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts)

  if (toasts.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <ToastItem {...t} />
        </div>
      ))}
    </div>
  )
}
