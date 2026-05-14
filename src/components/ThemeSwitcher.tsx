import { useStore, type Theme, themeNames, themeAccents } from '../stores/useStore'

const themeList: Theme[] = ['ocean', 'forest', 'sunset', 'purple', 'cherry', 'neon', 'light', 'sepia']

export default function ThemeSwitcher({ onSelect }: { onSelect: () => void }) {
  const currentTheme = useStore((s) => s.theme)
  const setTheme = useStore((s) => s.setTheme)

  return (
    <div
      className="rounded-xl p-3 shadow-2xl border"
      style={{
        background: 'var(--bg-surface)',
        borderColor: 'var(--border-color)',
        minWidth: '200px',
      }}
    >
      <div className="text-xs font-semibold mb-2 px-0.5" style={{ color: 'var(--panel-header)' }}>
        选择主题
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {themeList.map((t) => (
          <button
            key={t}
            onClick={() => {
              setTheme(t)
              onSelect()
            }}
            className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs cursor-pointer transition-all"
            style={{
              background: t === currentTheme ? 'var(--accent-bg)' : 'transparent',
              color: 'var(--text-primary)',
              border: t === currentTheme ? '1px solid var(--accent-border)' : '1px solid transparent',
            }}
          >
            <div
              className="w-4 h-4 rounded-full shrink-0"
              style={{ background: themeAccents[t] }}
            />
            <span>{themeNames[t]}</span>
            {t === currentTheme && (
              <span className="ml-auto text-xs" style={{ color: 'var(--accent)' }}>
                ✓
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
