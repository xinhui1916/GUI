import { useState, useEffect, useRef, useMemo } from 'react'
import { X, Eye, EyeOff, CheckCircle, XCircle, RefreshCw, Filter, Keyboard, FileCode } from 'lucide-react'
import { useUiStore } from '../stores/uiStore'
import { useStore } from '../stores/useStore'
import { checkClaudeInstalled, saveBrowserConfig } from '../lib/ipc'
import KeybindingsEditor from './KeybindingsEditor'
import JsonSettingsEditor from './JsonSettingsEditor'
import ThemeSwitcher from '../theme/ThemeSwitcher'

export default function SettingsDialog() {
  const settingsOpen = useUiStore((s) => s.settingsOpen)
  const closeSettings = useUiStore((s) => s.closeSettings)
  const workspacePath = useStore((s) => s.workspacePath)
  const storeModel = useStore((s) => s.model)
  const storeCustomPrompt = useStore((s) => s.customPrompt)
  const setStoreModel = useStore((s) => s.setModel)
  const setStoreCustomPrompt = useStore((s) => s.setCustomPrompt)
  const promptPresets = useStore((s) => s.promptPresets)
  const addPromptPreset = useStore((s) => s.addPromptPreset)
  const deletePromptPreset = useStore((s) => s.deletePromptPreset)
  const lang = useStore((s) => s.lang)
  const setLang = useStore((s) => s.setLang)
  const systemFollow = useStore((s) => s.systemFollow)
  const setSystemFollow = useStore((s) => s.setSystemFollow)
  const apiProvider = useStore((s) => s.apiProvider)
  const setApiProvider = useStore((s) => s.setApiProvider)
  const backendMode = useStore((s) => s.backendMode)
  const setBackendMode = useStore((s) => s.setBackendMode)
  const toolsEnabled = useStore((s) => s.toolsEnabled)
  const setToolsEnabled = useStore((s) => s.setToolsEnabled)

  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [model, setModel] = useState('')
  const [customPrompt, setCustomPrompt] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [saved, setSaved] = useState(false)
  const [claudeStatus, setClaudeStatus] = useState<string | null>(null)
  const [checkingClaude, setCheckingClaude] = useState(false)
  const [settingsQuery, setSettingsQuery] = useState('')
  const panelRef = useRef<HTMLDivElement>(null)

  const defaultConfig = useMemo(() => {
    return { apiKey: '', baseUrl: 'https://api.deepseek.com/anthropic', model: 'deepseek-v4-flash' }
  }, [])

  const sectionKeywords: Record<string, string[]> = {
    api: ['API 配置', 'API Key', 'Base URL', 'Provider', 'Model', 'Custom Prompt', '提示词', 'api', 'key', 'url', 'model', 'prompt', '配置'],
    backend: ['后端', 'Backend', 'Direct API', 'Claude CLI', 'cli', 'backend'],
    presets: ['提示词预设', 'Prompt Presets', '预设', 'preset'],
    theme: ['主题', 'Theme', 'ocean', 'forest', 'sunset', 'purple', 'cherry', 'neon', 'light', 'sepia'],
    autoTheme: ['自动主题', 'Auto Theme', '跟随系统', 'system', 'follow'],
    language: ['语言', 'Language', '中文', 'English'],
    about: ['关于', 'About', '版本', 'Version', 'about'],
    keybindings: ['快捷键', 'Keybindings', '键盘', 'Keyboard', 'Shortcuts', '快捷键', 'keybind'],
    jsonEditor: ['JSON 编辑器', 'JSON Editor', 'Settings', '设置文件', 'json', 'JSON Editor'],
    editor: ['编辑器', 'Editor', '自动保存', 'Auto Save', '格式化', 'Format', 'editor'],
  }

  const sectionVisible = useMemo(() => {
    if (!settingsQuery.trim()) {
      return { api: true, backend: true, presets: true, theme: true, autoTheme: true, language: true, about: true, keybindings: true, jsonEditor: true, editor: true }
    }
    const q = settingsQuery.toLowerCase()
    const out: Record<string, boolean> = {}
    for (const [key, keywords] of Object.entries(sectionKeywords)) {
      out[key] = keywords.some(k => k.toLowerCase().includes(q))
    }
    return out
  }, [settingsQuery])

  useEffect(() => {
    if (!settingsOpen) return
    setApiKey(defaultConfig.apiKey)
    setBaseUrl(defaultConfig.baseUrl)
    setModel(storeModel || defaultConfig.model)
    setCustomPrompt(storeCustomPrompt)
    setSaved(false)
  }, [settingsOpen, storeModel, storeCustomPrompt, defaultConfig])

  // Close on Escape
  useEffect(() => {
    if (!settingsOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeSettings()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [settingsOpen, closeSettings])

  const handleSave = () => {
    setStoreModel(model)
    setStoreCustomPrompt(customPrompt)
    // Persist API config to localStorage (used by browser mode as fallback)
    if (apiKey) {
      saveBrowserConfig({ apiKey, baseUrl, model })
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const toggleLang = () => {
    setLang(lang === 'zh' ? 'en' : 'zh')
  }

  if (!settingsOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={closeSettings}
    >
      <div
        ref={panelRef}
        className="w-full max-w-lg rounded-xl shadow-2xl overflow-hidden"
        style={{
          background: 'var(--sidebar-bg)',
          border: '1px solid var(--border-color)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3.5"
          style={{ borderBottom: '1px solid var(--border-color)' }}
        >
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            偏好设置
          </h2>
          <button
            onClick={closeSettings}
            className="cursor-pointer hover:opacity-70 transition-opacity"
            style={{ color: 'var(--text-muted)' }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Search */}
        <div className="flex items-center gap-2 px-5 py-2" style={{ borderBottom: '1px solid var(--border-color)', background: 'var(--bg-elevated)' }}>
          <Filter size={13} style={{ color: 'var(--text-muted)' }} />
          <input value={settingsQuery} onChange={(e) => setSettingsQuery(e.target.value)}
            placeholder="搜索设置..."
            className="flex-1 bg-transparent border-none outline-none text-xs"
            style={{ color: 'var(--text-primary)' }} />
          {settingsQuery && (
            <button onClick={() => setSettingsQuery('')} className="p-0.5 rounded cursor-pointer hover:opacity-70"
              style={{ color: 'var(--text-muted)' }}><X size={12} /></button>
          )}
        </div>

        <div className="max-h-[55vh] overflow-y-auto p-5 space-y-5">
          {/* ── API Configuration ── */}
          <section style={{ display: sectionVisible.api ? '' : 'none' }}>
            <h3 className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: 'var(--panel-header)' }}>
              API 配置
            </h3>
            <div className="space-y-3">
              {/* API Key */}
              <div>
                <label className="text-xs block mb-1" style={{ color: 'var(--text-secondary)' }}>API Key</label>
                <div className="flex gap-2">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="flex-1 px-3 py-2 text-xs rounded-lg outline-none"
                    style={{
                      background: 'var(--input-bg)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-primary)',
                    }}
                  />
                  <button
                    onClick={() => setShowKey(!showKey)}
                    className="px-2 rounded-lg cursor-pointer transition-colors"
                    style={{
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-muted)',
                    }}
                  >
                    {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              {/* Base URL */}
              <div>
                <label className="text-xs block mb-1" style={{ color: 'var(--text-secondary)' }}>Base URL</label>
                <input
                  type="text"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg outline-none"
                  style={{
                    background: 'var(--input-bg)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

              {/* Provider */}
              <div>
                <label className="text-xs block mb-1.5" style={{ color: 'var(--text-secondary)' }}>Provider</label>
                <div className="flex gap-1.5">
                  {['deepseek', 'openai', 'anthropic', 'custom'].map((p) => (
                    <button
                      key={p}
                      onClick={() => {
                        setApiProvider(p)
                        const presets: Record<string, { baseUrl: string; model: string }> = {
                          deepseek: { baseUrl: 'https://api.deepseek.com/anthropic', model: 'deepseek-v4-flash' },
                          openai: { baseUrl: 'https://api.openai.com', model: 'gpt-4o' },
                          anthropic: { baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-4-6' },
                          custom: { baseUrl: '', model: '' },
                        }
                        const preset = presets[p]
                        if (preset) {
                          setBaseUrl(preset.baseUrl)
                          setModel(preset.model)
                          setStoreModel(preset.model)
                        }
                      }}
                      className="flex-1 py-2 text-xs font-medium rounded-lg cursor-pointer transition-colors"
                      style={{
                        background: apiProvider === p ? 'var(--accent-bg)' : 'var(--bg-elevated)',
                        border: apiProvider === p ? '1px solid var(--accent)' : '1px solid var(--border-color)',
                        color: apiProvider === p ? 'var(--accent)' : 'var(--text-muted)',
                      }}
                    >
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Model */}
              <div>
                <label className="text-xs block mb-1" style={{ color: 'var(--text-secondary)' }}>Model</label>
                <input
                  type="text"
                  value={model}
                  onChange={(e) => { setModel(e.target.value); setStoreModel(e.target.value) }}
                  className="w-full px-3 py-2 text-xs rounded-lg outline-none"
                  style={{
                    background: 'var(--input-bg)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

              {/* Custom Prompt */}
              <div>
                <label className="text-xs block mb-1" style={{ color: 'var(--text-secondary)' }}>自定义提示词 (Custom Prompt)</label>
                <textarea
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder="例如：请始终用中文回答。你是一个资深 Rust 开发者..."
                  rows={3}
                  className="w-full px-3 py-2 text-xs rounded-lg outline-none resize-none"
                  style={{
                    background: 'var(--input-bg)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

              <button
                onClick={handleSave}
                className="w-full py-2 text-xs font-medium rounded-lg cursor-pointer transition-colors"
                style={{
                  background: saved ? 'var(--accent)' : 'var(--bg-elevated)',
                  border: '1px solid var(--border-color)',
                  color: saved ? '#fff' : 'var(--text-primary)',
                }}
              >
                {saved ? '✓ 已保存' : '保存配置'}
              </button>
            </div>
          </section>

          {/* ── Backend Mode ── */}
          <section style={{ display: sectionVisible.backend ? '' : 'none' }}>
            <h3 className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: 'var(--panel-header)' }}>
              后端
            </h3>
            <div className="space-y-3">
              <div className="flex gap-1.5">
                {(['api', 'cli'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setBackendMode(mode)}
                    className="flex-1 py-2 text-xs font-medium rounded-lg cursor-pointer transition-colors"
                    style={{
                      background: backendMode === mode ? 'var(--accent-bg)' : 'var(--bg-elevated)',
                      border: backendMode === mode ? '1px solid var(--accent)' : '1px solid var(--border-color)',
                      color: backendMode === mode ? 'var(--accent)' : 'var(--text-muted)',
                    }}
                  >
                    {mode === 'api' ? 'Direct API' : 'Claude CLI'}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    setCheckingClaude(true)
                    setClaudeStatus(null)
                    const version = await checkClaudeInstalled()
                    setClaudeStatus(version ?? 'not_found')
                    setCheckingClaude(false)
                  }}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg cursor-pointer transition-colors"
                  style={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-primary)',
                  }}
                >
                  {checkingClaude ? <RefreshCw size={12} className="animate-spin" /> : '检查 Claude CLI'}
                </button>
                {claudeStatus && (
                  <span className="flex items-center gap-1 text-xs" style={{ color: claudeStatus === 'not_found' ? '#ef4444' : 'var(--text-muted)' }}>
                    {claudeStatus === 'not_found' ? (
                      <><XCircle size={12} style={{ color: '#ef4444' }} /> 未找到</>
                    ) : (
                      <><CheckCircle size={12} style={{ color: '#10b981' }} /> {claudeStatus}</>
                    )}
                  </span>
                )}
              </div>
              <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)', opacity: 0.7 }}>
                CLI 模式使用 <code style={{ background: 'var(--code-bg)', padding: '1px 4px', borderRadius: 3 }}>claude --bare</code> 作为引擎，
                支持 <code style={{ background: 'var(--code-bg)', padding: '1px 4px', borderRadius: 3 }}>~/.claude/settings.json</code> 中配置的所有 Provider。
              </p>

              <div className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-color)' }}>
                <div>
                  <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>工具调用</span>
                  <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>文件读写 / 终端命令 / 代码搜索</p>
                </div>
                <button
                  onClick={() => setToolsEnabled(!toolsEnabled)}
                  className="text-[10px] px-2 py-0.5 rounded cursor-pointer"
                  style={{
                    background: toolsEnabled ? 'var(--accent-bg)' : 'transparent',
                    color: toolsEnabled ? 'var(--accent)' : 'var(--text-muted)',
                    border: `1px solid ${toolsEnabled ? 'var(--accent)' : 'var(--border-color)'}`,
                  }}
                >
                  {toolsEnabled ? '开启' : '关闭'}
                </button>
              </div>
            </div>
          </section>

          {/* ── Prompt Presets ── */}
          <section style={{ display: sectionVisible.presets ? '' : 'none' }}>
            <h3 className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: 'var(--panel-header)' }}>
              提示词预设
            </h3>
            <div className="space-y-2">
              {promptPresets.length === 0 ? (
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>暂无预设</p>
              ) : (
                promptPresets.map((p) => (
                  <div
                    key={p.name}
                    className="flex items-center gap-2 p-2 rounded text-xs cursor-pointer transition-colors"
                    style={{
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border-color)',
                    }}
                    onClick={() => { setCustomPrompt(p.prompt); setStoreCustomPrompt(p.prompt); }}
                  >
                    <span className="font-medium flex-1 truncate" style={{ color: 'var(--text-primary)' }}>{p.name}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); deletePromptPreset(p.name) }}
                      className="cursor-pointer hover:opacity-70 shrink-0"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))
              )}
              <div className="flex gap-2">
                <input
                  id="preset-name"
                  placeholder="预设名称"
                  className="flex-1 px-2 py-1.5 text-xs rounded border outline-none"
                  style={{
                    background: 'var(--input-bg)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-primary)',
                  }}
                />
                <button
                  onClick={() => {
                    const input = document.getElementById('preset-name') as HTMLInputElement
                    const name = input?.value.trim()
                    if (name && customPrompt.trim()) {
                      addPromptPreset(name, customPrompt.trim())
                      input.value = ''
                    }
                  }}
                  className="px-3 py-1.5 text-xs font-medium rounded cursor-pointer transition-colors"
                  style={{
                    background: 'var(--accent)',
                    color: '#fff',
                    border: 'none',
                  }}
                >
                  保存当前
                </button>
              </div>
            </div>
          </section>

          {/* ── Theme ── */}
          <section style={{ display: sectionVisible.theme ? '' : 'none' }}>
            <h3 className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: 'var(--panel-header)' }}>
              主题 / Theme
            </h3>
            <div className="flex justify-center">
              <ThemeSwitcher onSelect={() => {}} />
            </div>
          </section>

          {/* ── System Theme Follow ── */}
          <section style={{ display: sectionVisible.autoTheme ? '' : 'none' }}>
            <h3 className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: 'var(--panel-header)' }}>
              {lang === 'zh' ? '自动主题' : 'Auto Theme'}
            </h3>
            <button
              onClick={() => setSystemFollow(!systemFollow)}
              className="flex items-center justify-between w-full px-3 py-2 rounded-lg text-xs cursor-pointer transition-colors"
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
              }}
            >
              <span>{lang === 'zh' ? '跟随系统主题' : 'Follow system theme'}</span>
              <span
                className="text-[10px] px-1.5 py-0.5 rounded"
                style={{
                  background: systemFollow ? 'var(--accent-bg)' : 'transparent',
                  color: systemFollow ? 'var(--accent)' : 'var(--text-muted)',
                  border: `1px solid ${systemFollow ? 'var(--accent)' : 'var(--border-color)'}`,
                }}
              >
                {systemFollow ? (lang === 'zh' ? '开启' : 'On') : (lang === 'zh' ? '关闭' : 'Off')}
              </span>
            </button>
          </section>

          {/* ── Editor ── */}
          <section style={{ display: sectionVisible.editor ? '' : 'none' }}>
            <h3 className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: 'var(--panel-header)' }}>
              编辑器
            </h3>
            <div className="space-y-2.5">
              <div className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-color)' }}>
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>自动保存</span>
                <button
                  onClick={() => useStore.getState().setAutoSave(!useStore.getState().autoSave)}
                  className="text-[10px] px-2 py-0.5 rounded cursor-pointer"
                  style={{
                    background: useStore.getState().autoSave ? 'var(--accent-bg)' : 'transparent',
                    color: useStore.getState().autoSave ? 'var(--accent)' : 'var(--text-muted)',
                    border: `1px solid ${useStore.getState().autoSave ? 'var(--accent)' : 'var(--border-color)'}`,
                  }}
                >
                  {useStore.getState().autoSave ? '开启' : '关闭'}
                </button>
              </div>
              <div className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-color)' }}>
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>保存时格式化</span>
                <button
                  onClick={() => useStore.getState().setFormatOnSave(!useStore.getState().formatOnSave)}
                  className="text-[10px] px-2 py-0.5 rounded cursor-pointer"
                  style={{
                    background: useStore.getState().formatOnSave ? 'var(--accent-bg)' : 'transparent',
                    color: useStore.getState().formatOnSave ? 'var(--accent)' : 'var(--text-muted)',
                    border: `1px solid ${useStore.getState().formatOnSave ? 'var(--accent)' : 'var(--border-color)'}`,
                  }}
                >
                  {useStore.getState().formatOnSave ? '开启' : '关闭'}
                </button>
              </div>
              <div className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-color)' }}>
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Tab 大小</span>
                <div className="flex gap-1">
                  {[2, 4, 8].map((size) => (
                    <button
                      key={size}
                      onClick={() => useStore.getState().setTabSize(size)}
                      className="text-[10px] px-2 py-0.5 rounded cursor-pointer"
                      style={{
                        background: useStore.getState().tabSize === size ? 'var(--accent-bg)' : 'transparent',
                        color: useStore.getState().tabSize === size ? 'var(--accent)' : 'var(--text-muted)',
                        border: `1px solid ${useStore.getState().tabSize === size ? 'var(--accent)' : 'var(--border-color)'}`,
                      }}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* ── Language ── */}
          <section style={{ display: sectionVisible.language ? '' : 'none' }}>
            <h3 className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: 'var(--panel-header)' }}>
              语言 / Language
            </h3>
            <button
              onClick={toggleLang}
              className="flex items-center justify-between w-full px-3 py-2 rounded-lg text-xs cursor-pointer transition-colors"
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
              }}
            >
              <span>{lang === 'zh' ? '简体中文' : 'English'}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}>
                {lang === 'zh' ? '切换至 English' : '切换到中文'}
              </span>
            </button>
          </section>

          {/* ── Keybindings ── */}
          <section style={{ display: sectionVisible.keybindings ? '' : 'none' }}>
            <h3 className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: 'var(--panel-header)' }}>
              <Keyboard size={12} className="inline mr-1" style={{ color: 'var(--accent)' }} />
              快捷键
            </h3>
            <KeybindingsEditor />
          </section>

          {/* ── JSON Settings Editor ── */}
          <section style={{ display: sectionVisible.jsonEditor ? '' : 'none' }}>
            <h3 className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: 'var(--panel-header)' }}>
              <FileCode size={12} className="inline mr-1" style={{ color: 'var(--accent)' }} />
              JSON 设置编辑器
            </h3>
            <JsonSettingsEditor />
          </section>

          {/* ── About ── */}
          <section style={{ display: sectionVisible.about ? '' : 'none' }}>
            <h3 className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: 'var(--panel-header)' }}>
              关于
            </h3>
            <div className="text-xs space-y-1.5 px-1" style={{ color: 'var(--text-secondary)' }}>
              <p><span className="font-medium" style={{ color: 'var(--text-primary)' }}>版本:</span> 1.0.0</p>
              <p><span className="font-medium" style={{ color: 'var(--text-primary)' }}>后端:</span> Tauri 2 + Rust</p>
              <p><span className="font-medium" style={{ color: 'var(--text-primary)' }}>前端:</span> React 19 + TypeScript</p>
              {workspacePath && (
                <p><span className="font-medium" style={{ color: 'var(--text-primary)' }}>工作区:</span> {workspacePath}</p>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
