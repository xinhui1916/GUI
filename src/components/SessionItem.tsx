import { useStore, type Session } from '../stores/useStore'

export default function SessionItem({ session }: { session: Session }) {
  const setActive = useStore((s) => s.setActiveSession)

  return (
    <div
      onClick={() => setActive(session.id)}
      className="px-4 py-2.5 cursor-pointer transition-colors"
      style={{
        borderLeft: session.active ? '3px solid var(--accent)' : '3px solid transparent',
        background: session.active ? 'var(--sidebar-active)' : 'transparent',
      }}
    >
      <div className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
        {session.name}
      </div>
      <div
        className="text-xs mt-0.5 truncate"
        style={{ color: 'var(--text-muted)' }}
      >
        {session.preview}
      </div>
      <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
        {session.time}
      </div>
    </div>
  )
}
