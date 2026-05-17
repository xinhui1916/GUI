import { useState } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { useStore, type Theme, themeNames, themePalettes } from '../stores/useStore'
import { useCustomThemeStore, type CustomTheme, type CustomThemeVars } from './customThemeStore'
import ThemeEditor from './ThemeEditor'

// ── Preset theme config ───────────────────────────────────────────────────

const darkThemes: Theme[] = ['ocean', 'forest', 'sunset', 'purple', 'cherry', 'neon', 'dracula', 'nord', 'sakura', 'midnight', 'solarized']
const lightThemes: Theme[] = ['light', 'sepia']

// ── ThemeCard (preset) ────────────────────────────────────────────────────

function ThemeCard({ theme, current, onSelect }: { theme: Theme; current: Theme; onSelect: () => void }) {
  const pal = themePalettes[theme]
  const isActive = theme === current

  return (
    <button
      onClick={() => {
        // Selecting a preset deactivates any custom theme (handled in setTheme)
        useStore.getState().setTheme(theme)
        onSelect()
      }}
      className="flex flex-col rounded-xl overflow-hidden cursor-pointer transition-all duration-200"
      style={{
        border: isActive ? '2px solid var(--accent)' : '2px solid var(--border-color)',
        background: 'var(--bg-elevated)',
        boxShadow: isActive ? '0 0 12px var(--accent-border)' : 'none',
      }}
    >
      <div className="flex items-center gap-1.5 px-3 py-2.5" style={{ background: 'var(--bg-primary)' }}>
        <div className="w-5 h-5 rounded-full border" style={{ background: pal.primary, borderColor: pal.border }} title="背景" />
        <div className="w-5 h-5 rounded-full border" style={{ background: pal.accent, borderColor: pal.border }} title="强调色" />
        <div className="w-5 h-5 rounded-full border" style={{ background: pal.elevated, borderColor: pal.border }} title="面板色" />
        <div className="w-5 h-5 rounded-full border" style={{ background: pal.border, borderColor: pal.border }} title="边框色" />
      </div>
      <div
        className="text-[11px] py-1.5 text-center font-medium"
        style={{
          color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
          background: 'var(--bg-elevated)',
        }}
      >
        {themeNames[theme]}
        {isActive && <span className="ml-1">✓</span>}
      </div>
    </button>
  )
}

// ── CustomThemeCard ───────────────────────────────────────────────────────

function CustomThemeCard({
  ct,
  isActive,
  onSelect,
  onEdit,
  onDelete,
}: {
  ct: CustomTheme
  isActive: boolean
  onSelect: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const vars = ct.vars
  return (
    <div
      className="flex flex-col rounded-xl overflow-hidden transition-all duration-200 relative group"
      style={{
        border: isActive ? '2px solid var(--accent)' : '2px solid var(--border-color)',
        background: 'var(--bg-elevated)',
        boxShadow: isActive ? '0 0 12px var(--accent-border)' : 'none',
      }}
    >
      <button
        onClick={onSelect}
        className="flex flex-col cursor-pointer text-left"
      >
        <div className="flex items-center gap-1.5 px-3 py-2.5" style={{ background: vars['bg-primary'] }}>
          <div className="w-5 h-5 rounded-full border" style={{ background: vars['bg-primary'], borderColor: vars['border-color'] }} />
          <div className="w-5 h-5 rounded-full border" style={{ background: vars['accent'], borderColor: vars['border-color'] }} />
          <div className="w-5 h-5 rounded-full border" style={{ background: vars['bg-elevated'], borderColor: vars['border-color'] }} />
          <div className="w-5 h-5 rounded-full border" style={{ background: vars['border-color'], borderColor: vars['border-color'] }} />
        </div>
        <div
          className="text-[11px] py-1.5 text-center font-medium flex items-center justify-center gap-1"
          style={{
            color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
            background: 'var(--bg-elevated)',
          }}
        >
          {ct.name}
          {isActive && <span>✓</span>}
        </div>
      </button>
      {/* Edit/Delete buttons on hover */}
      <div
        className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <button
          onClick={onEdit}
          className="p-1 rounded cursor-pointer hover:opacity-80"
          style={{ background: 'var(--bg-surface)', color: 'var(--text-secondary)' }}
          title="编辑 Edit"
        >
          <Pencil size={10} />
        </button>
        {!ct.isBuiltin && (
          <button
            onClick={onDelete}
            className="p-1 rounded cursor-pointer hover:opacity-80"
            style={{ background: 'var(--bg-surface)', color: '#ef4444' }}
            title="删除 Delete"
          >
            <Trash2 size={10} />
          </button>
        )}
      </div>
    </div>
  )
}

// ── ThemeSwitcher (main) ──────────────────────────────────────────────────

export default function ThemeSwitcher({ onSelect }: { onSelect: () => void }) {
  const currentTheme = useStore((s) => s.theme)
  const customThemes = useCustomThemeStore((s) => s.customThemes)
  const activeCustomId = useCustomThemeStore((s) => s.activeCustomThemeId)
  const { activateCustomTheme, deleteCustomTheme } = useCustomThemeStore.getState()

  const [editorOpen, setEditorOpen] = useState(false)
  const [editingTheme, setEditingTheme] = useState<CustomTheme | undefined>(undefined)

  const handleSelectCustom = (id: string) => {
    if (activeCustomId !== id) {
      activateCustomTheme(id)
    }
    onSelect()
  }

  const handleOpenEditor = (ct?: CustomTheme) => {
    setEditingTheme(ct)
    setEditorOpen(true)
  }

  const handleDelete = (id: string) => {
    const ct = customThemes.find((t) => t.id === id)
    if (ct?.isBuiltin) return
    deleteCustomTheme(id)
  }

  return (
    <>
      <div
        className="rounded-xl p-4 shadow-2xl border"
        style={{
          background: 'var(--bg-surface)',
          borderColor: 'var(--border-color)',
          minWidth: '280px',
          maxHeight: '70vh',
          overflowY: 'auto',
        }}
      >
        <div className="text-xs font-semibold mb-3 px-0.5 flex items-center gap-2" style={{ color: 'var(--panel-header)' }}>
          <span>🎨</span>
          <span>主题 / Theme</span>
        </div>

        {/* Dark themes */}
        <div className="mb-3">
          <div className="text-[10px] font-medium uppercase tracking-wider mb-2 px-0.5" style={{ color: 'var(--text-muted)' }}>
            暗色 / Dark
          </div>
          <div className="grid grid-cols-3 gap-2">
            {darkThemes.map((t) => (
              <ThemeCard key={t} theme={t} current={currentTheme} onSelect={onSelect} />
            ))}
          </div>
        </div>

        {/* Light themes */}
        <div className="mb-3">
          <div className="text-[10px] font-medium uppercase tracking-wider mb-2 px-0.5" style={{ color: 'var(--text-muted)' }}>
            亮色 / Light
          </div>
          <div className="grid grid-cols-3 gap-2">
            {lightThemes.map((t) => (
              <ThemeCard key={t} theme={t} current={currentTheme} onSelect={onSelect} />
            ))}
          </div>
        </div>

        {/* Custom themes */}
        {customThemes.length > 0 && (
          <div className="mb-3">
            <div className="text-[10px] font-medium uppercase tracking-wider mb-2 px-0.5" style={{ color: 'var(--text-muted)' }}>
              自定义 / Custom
            </div>
            <div className="grid grid-cols-2 gap-2">
              {customThemes.map((ct) => (
                <CustomThemeCard
                  key={ct.id}
                  ct={ct}
                  isActive={activeCustomId === ct.id}
                  onSelect={() => handleSelectCustom(ct.id)}
                  onEdit={() => handleOpenEditor(ct)}
                  onDelete={() => handleDelete(ct.id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Create button */}
        <button
          onClick={() => handleOpenEditor(undefined)}
          className="w-full flex items-center justify-center gap-1.5 text-[11px] py-2 rounded-lg cursor-pointer transition-colors"
          style={{
            color: 'var(--accent)',
            border: '1px dashed var(--accent-border)',
            background: 'var(--accent-bg)',
          }}
        >
          <Plus size={12} />
          创建自定义主题 / Create Custom Theme
        </button>
      </div>

      {/* Theme Editor dialog */}
      {editorOpen && (
        <ThemeEditor
          theme={editingTheme}
          onClose={() => {
            setEditorOpen(false)
            setEditingTheme(undefined)
          }}
        />
      )}
    </>
  )
}
