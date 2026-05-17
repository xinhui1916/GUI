import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// ── Types ─────────────────────────────────────────────────────────────────

export interface CustomThemeVars {
  'bg-primary': string
  'bg-secondary': string
  'bg-surface': string
  'bg-elevated': string
  'bg-hover': string
  'border-color': string
  'border-light': string
  'text-primary': string
  'text-secondary': string
  'text-muted': string
  'accent': string
  'accent-hover': string
  'accent-bg': string
  'accent-border': string
  'sidebar-bg': string
  'sidebar-active': string
  'chat-bg': string
  'bubble-user-bg': string
  'bubble-user-border': string
  'bubble-assistant-bg': string
  'bubble-assistant-border': string
  'code-bg': string
  'scrollbar-thumb': string
  'scrollbar-hover': string
  'titlebar-bg': string
  'input-bg': string
  'badge-bg': string
  'badge-border': string
  'badge-text': string
  'panel-header': string
  'file-change-m': string
  'file-change-a': string
  'file-change-d': string
  'tab-inactive': string
  'tab-active': string
  // ── Decoration vars ──
  'app-bg-image': string
  'chat-bg-image': string
  'sidebar-bg-image': string
  'bubble-user-bg-image': string
  'bubble-assistant-bg-image': string
  'titlebar-decoration': string
  'app-bg-blur': string
  'card-glow': string
  'avatar-user-image': string
  'avatar-ai-image': string
}

export interface CustomTheme {
  id: string
  name: string
  vars: CustomThemeVars
  createdAt: number
  updatedAt: number
  isBuiltin?: boolean
}

// ── All CSS var keys ──────────────────────────────────────────────────────

export const ALL_CSS_VARS: (keyof CustomThemeVars)[] = [
  'bg-primary', 'bg-secondary', 'bg-surface', 'bg-elevated', 'bg-hover',
  'border-color', 'border-light',
  'text-primary', 'text-secondary', 'text-muted',
  'accent', 'accent-hover', 'accent-bg', 'accent-border',
  'sidebar-bg', 'sidebar-active',
  'chat-bg',
  'bubble-user-bg', 'bubble-user-border', 'bubble-assistant-bg', 'bubble-assistant-border',
  'code-bg',
  'scrollbar-thumb', 'scrollbar-hover',
  'titlebar-bg', 'input-bg',
  'badge-bg', 'badge-border', 'badge-text',
  'panel-header',
  'file-change-m', 'file-change-a', 'file-change-d',
  'tab-inactive', 'tab-active',
  'app-bg-image', 'chat-bg-image', 'sidebar-bg-image',
  'bubble-user-bg-image', 'bubble-assistant-bg-image',
  'titlebar-decoration', 'app-bg-blur', 'card-glow',
  'avatar-user-image', 'avatar-ai-image',
]

// ── Apply / clear helpers ─────────────────────────────────────────────────

export function applyCustomThemeVars(vars: CustomThemeVars) {
  const root = document.documentElement
  for (const key of ALL_CSS_VARS) {
    root.style.setProperty(`--${key}`, vars[key])
  }
}

export function clearCustomThemeVars() {
  const root = document.documentElement
  for (const key of ALL_CSS_VARS) {
    root.style.removeProperty(`--${key}`)
  }
}

// ── Animation style injection ─────────────────────────────────────────────

const ANIM_STYLE_ID = '__custom-theme-decorations__'

export function injectDecorationAnimations(vars: CustomThemeVars) {
  removeDecorationAnimations()
  const style = document.createElement('style')
  style.id = ANIM_STYLE_ID
  const accent = vars['accent']
  style.textContent = `
@keyframes holyLight {
  0% { box-shadow: 0 0 6px ${accent}, 0 0 12px ${accent}44; }
  50% { box-shadow: 0 0 15px ${accent}, 0 0 30px ${accent}66; }
  100% { box-shadow: 0 0 6px ${accent}, 0 0 12px ${accent}44; }
}
@keyframes bronzeShake {
  0%,100% { transform: translateX(0); }
  25% { transform: translateX(-2px); }
  75% { transform: translateX(2px); }
}
@keyframes streamLight {
  0% { left: -100%; }
  100% { left: 100%; }
}`
  document.head.appendChild(style)
}

export function removeDecorationAnimations() {
  const el = document.getElementById(ANIM_STYLE_ID)
  if (el) el.remove()
}

// ── Color utilities ───────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null
}

function rgbToHex(r: number, g: number, b: number): string {
  const to = (n: number) => Math.round(n).toString(16).padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`
}

export function darkenColor(hex: string, factor: number): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  return rgbToHex(rgb[0] * (1 - factor), rgb[1] * (1 - factor), rgb[2] * (1 - factor))
}

export function colorToRgba(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`
}

// ── Built-in: Saint Seiya ─────────────────────────────────────────────────

export const SAINT_SEIYA_THEME: CustomTheme = {
  id: '__builtin_saint_seiya__',
  name: '圣斗士 Saint Seiya',
  isBuiltin: true,
  createdAt: 0,
  updatedAt: 0,
  vars: {
    // Base colors
    'bg-primary': 'transparent',
    'bg-secondary': 'transparent',
    'bg-surface': 'transparent',
    'bg-elevated': 'transparent',
    'bg-hover': 'rgba(255, 255, 255, 0.1)',
    'border-color': 'rgba(255, 255, 255, 0.25)',
    'border-light': 'rgba(255, 255, 255, 0.35)',
    'text-primary': '#ffffff',
    'text-secondary': '#d4d0c8',
    'text-muted': '#a09888',
    'accent': '#c9a84c',
    'accent-hover': '#d4b85a',
    'accent-bg': 'rgba(201, 168, 76, 0.15)',
    'accent-border': 'rgba(201, 168, 76, 0.3)',
    'sidebar-bg': 'transparent',
    'sidebar-active': 'rgba(201, 168, 76, 0.12)',
    'chat-bg': 'transparent',
    'bubble-user-bg': 'rgba(0, 0, 0, 0.35)',
    'bubble-user-border': '#c9a84c',
    'bubble-assistant-bg': 'rgba(0, 0, 0, 0.25)',
    'bubble-assistant-border': 'rgba(255, 255, 255, 0.2)',
    'code-bg': 'rgba(0, 0, 0, 0.4)',
    'scrollbar-thumb': '#c9a84c',
    'scrollbar-hover': '#d4b85a',
    'titlebar-bg': 'transparent',
    'input-bg': 'rgba(0, 0, 0, 0.3)',
    'badge-bg': 'rgba(0, 0, 0, 0.4)',
    'badge-border': '#c9a84c',
    'badge-text': '#f0d060',
    'panel-header': '#ddd8d0',
    'file-change-m': '#c9a84c',
    'file-change-a': '#4ade80',
    'file-change-d': '#dc2626',
    'tab-inactive': '#a09888',
    'tab-active': '#ffffff',
    // Decorations
    'app-bg-image': 'linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.55)), url(/shaka.png)',
    'chat-bg-image': 'none',
    'sidebar-bg-image': 'none',
    'bubble-user-bg-image': 'linear-gradient(145deg, #232b52, #121a38)',
    'bubble-assistant-bg-image': 'linear-gradient(145deg, #4a1a1a, #2a0a0a)',
    'titlebar-decoration': 'linear-gradient(90deg, #c9a84c, #f0d060, #c9a84c)',
    'app-bg-blur': '0px',
    'card-glow': '#c9a84c',
    'avatar-user-image': 'none',
    'avatar-ai-image': 'url(/shaka.png)',
  },
}

const BUILTIN_THEMES: CustomTheme[] = [SAINT_SEIYA_THEME]

// ── Store ─────────────────────────────────────────────────────────────────

interface CustomThemeStoreState {
  customThemes: CustomTheme[]
  activeCustomThemeId: string | null
  addCustomTheme: (name: string, vars: CustomThemeVars) => string
  updateCustomTheme: (id: string, updates: Partial<Pick<CustomTheme, 'name' | 'vars'>>) => void
  deleteCustomTheme: (id: string) => void
  duplicateCustomTheme: (id: string, newName?: string) => string
  activateCustomTheme: (id: string) => void
  deactivateCustomTheme: () => void
}

export const useCustomThemeStore = create<CustomThemeStoreState>()(
  persist(
    (set, get) => ({
      customThemes: [...BUILTIN_THEMES],
      activeCustomThemeId: null,

      addCustomTheme: (name, vars) => {
        const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        const now = Date.now()
        const theme: CustomTheme = { id, name, vars, createdAt: now, updatedAt: now }
        set((s) => ({ customThemes: [...s.customThemes, theme] }))
        return id
      },

      updateCustomTheme: (id, updates) => {
        set((s) => ({
          customThemes: s.customThemes.map((t) =>
            t.id === id && !t.isBuiltin
              ? { ...t, ...updates, updatedAt: Date.now() }
              : t
          ),
        }))
        if (get().activeCustomThemeId === id && updates.vars) {
          applyCustomThemeVars(updates.vars as CustomThemeVars)
          injectDecorationAnimations(updates.vars as CustomThemeVars)
        }
      },

      deleteCustomTheme: (id) => {
        const state = get()
        const theme = state.customThemes.find((t) => t.id === id)
        if (theme?.isBuiltin) return
        set((s) => ({ customThemes: s.customThemes.filter((t) => t.id !== id) }))
        if (state.activeCustomThemeId === id) {
          get().deactivateCustomTheme()
        }
      },

      duplicateCustomTheme: (id, newName?) => {
        const source = get().customThemes.find((t) => t.id === id)
        if (!source) return ''
        const name = newName || `${source.name} (副本)`
        const newId = get().addCustomTheme(name, { ...source.vars })
        return newId
      },

      activateCustomTheme: (id) => {
        const theme = get().customThemes.find((t) => t.id === id)
        if (!theme) return
        applyCustomThemeVars(theme.vars)
        injectDecorationAnimations(theme.vars)
        set({ activeCustomThemeId: id })
      },

      deactivateCustomTheme: () => {
        clearCustomThemeVars()
        removeDecorationAnimations()
        set({ activeCustomThemeId: null })
      },
    }),
    {
      name: 'claude-desktop-custom-themes',
      partialize: (state) => ({
        customThemes: state.customThemes.filter((t) => !t.isBuiltin),
        activeCustomThemeId: state.activeCustomThemeId,
      }),
      merge: (persisted, initial) => {
        const merged = initial.customThemes.map((t) => ({ ...t }))
        if (persisted && typeof persisted === 'object' && 'customThemes' in persisted) {
          const p = persisted
          if (Array.isArray(p.customThemes)) {
            for (const t of p.customThemes) {
              if (!t.isBuiltin && !merged.some((m) => m.id === t.id)) {
                merged.push(t)
              }
            }
          }
        }
        const activeId = persisted && typeof persisted === 'object' && 'activeCustomThemeId' in persisted
          ? persisted.activeCustomThemeId
          : initial.activeCustomThemeId
        return { ...initial, ...persisted, customThemes: merged, activeCustomThemeId: activeId }
      },
      onRehydrateStorage: () => (state) => {
        if (state?.activeCustomThemeId) {
          const theme = state.customThemes.find((t) => t.id === state.activeCustomThemeId)
          if (theme) {
            applyCustomThemeVars(theme.vars)
            injectDecorationAnimations(theme.vars)
          }
        }
      },
    }
  )
)
