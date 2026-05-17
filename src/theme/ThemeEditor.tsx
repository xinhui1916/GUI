import { useState } from 'react'
import { X, Save, Trash2, Eye, EyeOff, Plus } from 'lucide-react'
import {
  useCustomThemeStore,
  type CustomTheme,
  type CustomThemeVars,
  darkenColor,
  colorToRgba,
  ALL_CSS_VARS,
} from './customThemeStore'

// ── Default base (Ocean Blue) ─────────────────────────────────────────────

const DEFAULT_VARS: CustomThemeVars = {
  'bg-primary': '#0a0f1e',
  'bg-secondary': '#0d1525',
  'bg-surface': '#14181f',
  'bg-elevated': '#1a1e26',
  'bg-hover': 'rgba(255, 255, 255, 0.04)',
  'border-color': '#23272e',
  'border-light': '#2a2e36',
  'text-primary': '#e1e4e8',
  'text-secondary': '#8b8e93',
  'text-muted': '#555555',
  'accent': '#3b82f6',
  'accent-hover': '#2563eb',
  'accent-bg': 'rgba(59, 130, 246, 0.1)',
  'accent-border': 'rgba(59, 130, 246, 0.3)',
  'sidebar-bg': '#14181f',
  'sidebar-active': 'rgba(37, 99, 235, 0.1)',
  'chat-bg': '#12161c',
  'bubble-user-bg': '#1e3a5f',
  'bubble-user-border': '#2d5a8e',
  'bubble-assistant-bg': '#1a1e26',
  'bubble-assistant-border': '#23272e',
  'code-bg': '#0d1117',
  'scrollbar-thumb': '#2a2e36',
  'scrollbar-hover': '#3a3e46',
  'titlebar-bg': '#1a1d23',
  'input-bg': '#1a1e26',
  'badge-bg': '#1e293b',
  'badge-border': '#2d3a52',
  'badge-text': '#93c5fd',
  'panel-header': '#9ca3af',
  'file-change-m': '#f59e0b',
  'file-change-a': '#10b981',
  'file-change-d': '#ef4444',
  'tab-inactive': '#6b7280',
  'tab-active': '#e1e4e8',
  // Decoration vars
  'app-bg-image': 'none',
  'chat-bg-image': 'none',
  'sidebar-bg-image': 'none',
  'bubble-user-bg-image': 'none',
  'bubble-assistant-bg-image': 'none',
  'titlebar-decoration': 'none',
  'app-bg-blur': '0px',
  'card-glow': 'none',
  'avatar-user-image': 'none',
  'avatar-ai-image': 'none',
}

// ── Quick mode field groups ───────────────────────────────────────────────

interface FieldDef {
  key: keyof CustomThemeVars
  label: string
}

const FIELD_GROUPS: { title: string; fields: FieldDef[] }[] = [
  {
    title: '背景 / Background',
    fields: [
      { key: 'bg-primary', label: '主背景' },
      { key: 'bg-secondary', label: '次背景' },
      { key: 'bg-elevated', label: '面板背景' },
    ],
  },
  {
    title: '文字 / Text',
    fields: [
      { key: 'text-primary', label: '主文字' },
      { key: 'text-secondary', label: '次要文字' },
      { key: 'text-muted', label: '弱化文字' },
    ],
  },
  {
    title: '强调色 / Accent',
    fields: [
      { key: 'accent', label: '强调色' },
    ],
  },
  {
    title: '边框 / Borders',
    fields: [
      { key: 'border-color', label: '边框' },
      { key: 'border-light', label: '浅边框' },
    ],
  },
  {
    title: '聊天气泡 / Chat Bubbles',
    fields: [
      { key: 'bubble-user-bg', label: '用户气泡' },
      { key: 'bubble-user-border', label: '用户气泡边框' },
      { key: 'bubble-assistant-bg', label: '助手气泡' },
      { key: 'bubble-assistant-border', label: '助手气泡边框' },
    ],
  },
  {
    title: '装饰 / Decoration',
    fields: [
      { key: 'titlebar-decoration', label: '顶部装饰条' },
      { key: 'card-glow', label: '边框辉光' },
      { key: 'app-bg-blur', label: '背景模糊' },
      { key: 'bubble-user-bg-image', label: '用户气泡渐变' },
      { key: 'bubble-assistant-bg-image', label: '助手气泡渐变' },
    ],
  },
]

// ── ColorInput ────────────────────────────────────────────────────────────

function ColorInput({
  label,
  varName,
  value,
  onChange,
}: {
  label: string
  varName: string
  value: string
  onChange: (v: string) => void
}) {
  const isHex = /^#[0-9a-f]{6}$/i.test(value)

  return (
    <div className="flex items-center gap-2">
      <div
        className="w-6 h-6 rounded-full shrink-0 border"
        style={{ background: value, borderColor: 'var(--border-color)' }}
        title={value}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
            {label}
          </span>
          <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
            --{varName}
          </span>
        </div>
        <div className="flex items-center gap-1 mt-0.5">
          {isHex && (
            <input
              type="color"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="w-5 h-5 p-0 border-0 cursor-pointer rounded"
              style={{ background: 'transparent' }}
            />
          )}
          <input
            className="flex-1 text-[11px] px-1.5 py-0.5 rounded border rounded-md"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            style={{
              background: 'var(--input-bg)',
              color: 'var(--text-primary)',
              borderColor: 'var(--border-color)',
              fontFamily: 'var(--font-mono)',
            }}
          />
        </div>
      </div>
    </div>
  )
}

// ── Preview ───────────────────────────────────────────────────────────────

function Preview({ vars }: { vars: CustomThemeVars }) {
  return (
    <div
      className="rounded-lg overflow-hidden border text-xs"
      style={{
        background: vars['bg-primary'],
        borderColor: vars['border-color'],
      }}
    >
      {/* Title bar */}
      <div
        className="px-3 py-1.5 text-[10px] font-semibold flex items-center gap-2"
        style={{
          background: vars['titlebar-bg'],
          color: vars['text-secondary'],
          borderBottom: `1px solid ${vars['border-color']}`,
        }}
      >
        <div className="w-2.5 h-2.5 rounded-full" style={{ background: vars['accent'] }} />
        预览 Preview
      </div>
      {/* Content */}
      <div className="p-3 space-y-2">
        <div style={{ color: vars['text-primary'] }} className="text-xs font-medium">
          Sample Text
        </div>
        <div style={{ color: vars['text-secondary'] }} className="text-[10px]">
          Secondary text example
        </div>
        <div style={{ color: vars['text-muted'] }} className="text-[10px]">
          Muted text example
        </div>
        <div
          className="rounded px-2 py-1 text-center text-[10px] font-medium"
          style={{
            background: vars['accent'],
            color: vars['text-primary'],
          }}
        >
          Button
        </div>
        {/* Chat bubbles */}
        <div className="space-y-1.5 pt-1">
          <div
            className="rounded-lg px-2 py-1.5 text-[10px] max-w-[80%]"
            style={{
              background: vars['bubble-user-bg'],
              border: `1px solid ${vars['bubble-user-border']}`,
              color: vars['text-primary'],
              marginLeft: '20%',
            }}
          >
            User message
          </div>
          <div
            className="rounded-lg px-2 py-1.5 text-[10px] max-w-[80%]"
            style={{
              background: vars['bubble-assistant-bg'],
              border: `1px solid ${vars['bubble-assistant-border']}`,
              color: vars['text-primary'],
            }}
          >
            Assistant reply
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Derived accent helpers ────────────────────────────────────────────────

function deriveAccentVars(accent: string): Pick<CustomThemeVars, 'accent-hover' | 'accent-bg' | 'accent-border'> {
  return {
    'accent-hover': darkenColor(accent, 0.1),
    'accent-bg': colorToRgba(accent, 0.12),
    'accent-border': colorToRgba(accent, 0.3),
  }
}

// ── ThemeEditor ────────────────────────────────────────────────────────────

interface ThemeEditorProps {
  theme?: CustomTheme // undefined = creating new
  onClose: () => void
}

export default function ThemeEditor({ theme, onClose }: ThemeEditorProps) {
  const isEditing = !!theme
  const { addCustomTheme, updateCustomTheme, deleteCustomTheme, activateCustomTheme, duplicateCustomTheme } =
    useCustomThemeStore.getState()

  const [name, setName] = useState(theme?.name || '')
  const [vars, setVars] = useState<CustomThemeVars>(theme?.vars || { ...DEFAULT_VARS })
  const [showAdvanced, setShowAdvanced] = useState(false)

  const updateVar = (key: keyof CustomThemeVars, value: string) => {
    const next = { ...vars, [key]: value }
    // Auto-derive accent variants when accent changes
    if (key === 'accent' && /^#[0-9a-f]{6}$/i.test(value)) {
      const derived = deriveAccentVars(value)
      Object.assign(next, derived)
    }
    setVars(next)
  }

  const handleSave = () => {
    if (!name.trim()) return
    if (isEditing && theme) {
      updateCustomTheme(theme.id, { name: name.trim(), vars })
      activateCustomTheme(theme.id)
    } else {
      const id = addCustomTheme(name.trim(), vars)
      activateCustomTheme(id)
    }
    onClose()
  }

  const handleDelete = () => {
    if (!theme || theme.isBuiltin) return
    deleteCustomTheme(theme.id)
    onClose()
  }

  const handleDuplicate = () => {
    if (!theme) return
    const id = duplicateCustomTheme(theme.id, `${theme.name} (副本)`)
    if (id) {
      activateCustomTheme(id)
    }
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{
        background: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(4px)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="rounded-xl shadow-2xl border max-w-2xl w-full mx-4 max-h-[85vh] flex flex-col"
        style={{
          background: 'var(--bg-surface)',
          borderColor: 'var(--border-color)',
        }}
      >
        {/* ── Header ── */}
        <div
          className="flex items-center gap-3 px-5 py-3 border-b shrink-0"
          style={{ borderColor: 'var(--border-color)' }}
        >
          <input
            className="flex-1 text-sm font-semibold bg-transparent border-none outline-none"
            placeholder={isEditing ? '编辑主题名称...' : '输入主题名称...'}
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ color: 'var(--text-primary)' }}
          />
          <button
            onClick={onClose}
            className="p-1 rounded cursor-pointer hover:opacity-80"
            style={{ color: 'var(--text-muted)' }}
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* Toggle mode */}
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-[11px] flex items-center gap-1 mb-4 px-2 py-1 rounded cursor-pointer"
            style={{
              color: 'var(--accent)',
              background: 'var(--accent-bg)',
              border: '1px solid var(--accent-border)',
            }}
          >
            {showAdvanced ? <EyeOff size={12} /> : <Eye size={12} />}
            {showAdvanced ? '简易模式 / Quick' : '高级模式 / Advanced'}
          </button>

          {showAdvanced ? (
            /* ── Advanced: all 35 vars ── */
            <div className="grid grid-cols-2 gap-2">
              {ALL_CSS_VARS.map((key) => (
                <ColorInput
                  key={key}
                  label={key}
                  varName={key}
                  value={vars[key]}
                  onChange={(v) => updateVar(key, v)}
                />
              ))}
            </div>
          ) : (
            /* ── Quick mode: grouped fields + preview side-by-side ── */
            <div className="flex gap-6">
              <div className="flex-1 space-y-4">
                {FIELD_GROUPS.map((group) => (
                  <div key={group.title}>
                    <div
                      className="text-[10px] font-semibold uppercase tracking-wider mb-1.5 pb-1"
                      style={{
                        color: 'var(--panel-header)',
                        borderBottom: '1px solid var(--border-color)',
                      }}
                    >
                      {group.title}
                    </div>
                    <div className="space-y-2">
                      {group.fields.map((f) => (
                        <ColorInput
                          key={f.key}
                          label={f.label}
                          varName={f.key}
                          value={vars[f.key]}
                          onChange={(v) => updateVar(f.key, v)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {/* Preview */}
              <div className="w-52 shrink-0">
                <div
                  className="text-[10px] font-semibold uppercase tracking-wider mb-2"
                  style={{ color: 'var(--panel-header)' }}
                >
                  预览 / Preview
                </div>
                <Preview vars={vars} />
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div
          className="flex items-center justify-between px-5 py-3 border-t shrink-0"
          style={{ borderColor: 'var(--border-color)' }}
        >
          <div className="flex items-center gap-2">
            {isEditing && !theme?.isBuiltin && (
              <button
                onClick={handleDelete}
                className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded cursor-pointer"
                style={{
                  color: '#ef4444',
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                }}
              >
                <Trash2 size={12} />
                删除 Delete
              </button>
            )}
            {isEditing && theme?.isBuiltin && (
              <button
                onClick={handleDuplicate}
                className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded cursor-pointer"
                style={{
                  color: 'var(--accent)',
                  background: 'var(--accent-bg)',
                  border: '1px solid var(--accent-border)',
                }}
              >
                <Plus size={12} />
                创建副本 Duplicate
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="text-[11px] px-3 py-1.5 rounded cursor-pointer"
              style={{
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-color)',
              }}
            >
              取消 Cancel
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded cursor-pointer font-medium"
              style={{
                color: '#ffffff',
                background: 'var(--accent)',
                border: 'none',
                opacity: name.trim() ? 1 : 0.5,
              }}
              disabled={!name.trim()}
            >
              <Save size={12} />
              保存 Save
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
