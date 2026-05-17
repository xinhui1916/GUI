import { useState, useEffect, useMemo } from 'react'
import { Puzzle, Power, PowerOff, Terminal, Trash2, ChevronDown, ChevronRight, Search, Download, Package, Loader2, Cloud, Store } from 'lucide-react'
import { useExtensionStore, type ExtensionManifest } from '../stores/extensionStore'
import { loadSampleExtension, loadExtension } from '../lib/extensionHost'
import { installExtension } from '../lib/ipc'
import { useToastStore } from '../stores/toastStore'

export default function ExtensionManager() {
  const extensions = useExtensionStore((s) => s.extensions)
  const activeExtensions = useExtensionStore((s) => s.activeExtensions)
  const extensionOutputs = useExtensionStore((s) => s.extensionOutputs)
  const setExtensionEnabled = useExtensionStore((s) => s.setExtensionEnabled)
  const clearExtensionOutput = useExtensionStore((s) => s.clearExtensionOutput)
  const [expandedOutput, setExpandedOutput] = useState<string | null>(null)
  const [showBuiltin, setShowBuiltin] = useState(true)

  const hasUserExts = useMemo(() => extensions.some(e => e.path !== '__builtin__'), [extensions])
  const [tab, setTab] = useState<'installed' | 'marketplace'>('marketplace')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [installing, setInstalling] = useState<string | null>(null)
  const addToast = useToastStore((s) => s.addToast)

  // Auto-load sample extension on first mount
  useEffect(() => {
    if (extensions.length === 0) {
      loadSampleExtension()
    }
  }, [])

  // Search Open VSX
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults(null); return }
    const timer = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(`https://open-vsx.org/api/-/search?query=${encodeURIComponent(searchQuery)}&size=30`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        setSearchResults(data.extensions || [])
      } catch (e: any) {
        console.error('Marketplace search failed:', e)
        setSearchResults([])
      }
      setSearching(false)
    }, 400)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const handleInstall = async (ext: any) => {
    const extName = `${ext.namespace}.${ext.name}`
    setInstalling(extName)
    try {
      const vsixUrl = `https://open-vsx.org/api/${ext.namespace}/${ext.name}/${ext.version}/file/vsix`
      const manifest = await installExtension(vsixUrl, extName)
      useExtensionStore.getState().registerExtension(manifest)
      await loadExtension(manifest)
      addToast({ type: 'success', title: '安装成功', message: extName, duration: 3000 })
    } catch (e: any) {
      const msg = typeof e === 'string' ? e : e?.message || '安装失败'
      addToast({ type: 'error', title: '安装失败', message: msg, duration: 5000 })
      console.error('Install failed:', e)
    }
    setInstalling(null)
  }

  const builtinExtensions = useMemo(() => extensions.filter(e => e.path === '__builtin__'), [extensions])
  const userExtensions = useMemo(() => extensions.filter(e => e.path !== '__builtin__'), [extensions])

  const renderExtension = (ext: ExtensionManifest) => {
    const isActive = activeExtensions.has(ext.name)
    const isExpanded = expandedOutput === ext.name
    const output = extensionOutputs.get(ext.name) || []

    return (
      <div
        key={ext.name}
        className="rounded-lg overflow-hidden"
        style={{
          border: '1px solid var(--border-color)',
          background: 'var(--bg-elevated)',
          opacity: isActive ? 1 : 0.5,
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-3 py-2.5">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-xs shrink-0"
            style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}
          >
            <Puzzle size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
              {ext.displayName}
              <span className="ml-1.5 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                v{ext.version}
              </span>
            </div>
            <div className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>
              {ext.description || ext.name}
              {ext.path === '__builtin__' && ' · 内置'}
            </div>
          </div>
          <button
            onClick={() => setExtensionEnabled(ext.name, !isActive)}
            className="p-1.5 rounded cursor-pointer transition-colors hover:opacity-80"
            style={{ color: isActive ? 'var(--accent)' : 'var(--text-muted)' }}
            title={isActive ? '禁用' : '启用'}
          >
            {isActive ? <Power size={14} /> : <PowerOff size={14} />}
          </button>
        </div>

        {/* Commands list */}
        {ext.contributes?.commands && ext.contributes.commands.length > 0 && (
          <div className="px-3 pb-2 flex flex-wrap gap-1">
            {ext.contributes.commands.map((cmd) => (
              <span
                key={cmd.command}
                className="text-[10px] px-1.5 py-0.5 rounded"
                style={{
                  background: 'var(--badge-bg)',
                  color: 'var(--badge-text)',
                  border: '1px solid var(--badge-border)',
                  fontFamily: 'monospace',
                }}
              >
                {cmd.command}
              </span>
            ))}
          </div>
        )}

        {/* Output (collapsible) */}
        {output.length > 0 && (
          <div style={{ borderTop: '1px solid var(--border-color)' }}>
            <button
              onClick={() => setExpandedOutput(isExpanded ? null : ext.name)}
              className="flex items-center gap-1 w-full px-3 py-1 text-[10px] cursor-pointer hover:opacity-80"
              style={{ color: 'var(--text-muted)' }}
            >
              {isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
              <Terminal size={10} />
              <span>输出 ({output.length})</span>
              <button
                onClick={(e) => { e.stopPropagation(); clearExtensionOutput(ext.name) }}
                className="ml-auto p-0.5 rounded cursor-pointer hover:opacity-70"
                style={{ color: 'var(--text-muted)' }}
              >
                <Trash2 size={10} />
              </button>
            </button>
            {isExpanded && (
              <div
                className="px-3 py-1.5 max-h-32 overflow-y-auto text-[10px] font-mono leading-relaxed"
                style={{
                  background: 'var(--code-bg)',
                  color: 'var(--text-secondary)',
                  borderTop: '1px solid var(--border-color)',
                }}
              >
                {output.map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-primary)' }}>
      {/* Tab bar */}
      <div className="flex" style={{ borderBottom: '1px solid var(--border-color)' }}>
        <button
          onClick={() => setTab('installed')}
          className="flex-1 py-2.5 text-xs font-medium cursor-pointer transition-colors flex items-center justify-center gap-1.5"
          style={{
            color: tab === 'installed' ? 'var(--tab-active)' : 'var(--tab-inactive)',
            borderBottom: tab === 'installed' ? '2px solid var(--accent)' : '2px solid transparent',
            background: tab === 'installed' ? 'var(--accent-bg)' : 'transparent',
          }}
        >
          <Package size={12} />
          已安装
          <span className="text-[10px] ml-0.5 opacity-60">{extensions.length}</span>
        </button>
        <button
          onClick={() => setTab('marketplace')}
          className="flex-1 py-2.5 text-xs font-medium cursor-pointer transition-colors flex items-center justify-center gap-1.5"
          style={{
            color: tab === 'marketplace' ? 'var(--tab-active)' : 'var(--tab-inactive)',
            borderBottom: tab === 'marketplace' ? '2px solid var(--accent)' : '2px solid transparent',
            background: tab === 'marketplace' ? 'var(--accent-bg)' : 'transparent',
          }}
        >
          <Store size={12} />
          市场
        </button>
      </div>

      {/* Installed tab */}
      {tab === 'installed' && (
        <>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {extensions.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-4">
                <Puzzle size={40} style={{ color: 'var(--text-muted)', opacity: 0.3 }} />
                <p className="text-sm mt-3" style={{ color: 'var(--text-muted)' }}>
                  暂无扩展
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>
                  在市场搜索并安装扩展
                </p>
              </div>
            ) : (
              <>
                {userExtensions.map(renderExtension)}
                {builtinExtensions.length > 0 && (
                  <>
                    <button
                      onClick={() => setShowBuiltin(!showBuiltin)}
                      className="flex items-center gap-1 text-xs font-medium cursor-pointer py-1"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {showBuiltin ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      内置扩展 ({builtinExtensions.length})
                    </button>
                    {showBuiltin && builtinExtensions.map(renderExtension)}
                  </>
                )}
              </>
            )}
          </div>
          <div
            className="px-3 py-2 text-[10px]"
            style={{ borderTop: '1px solid var(--border-color)', color: 'var(--text-muted)' }}
          >
            扩展安装在 ~/.claude-desktop/extensions/
          </div>
        </>
      )}

      {/* Marketplace tab */}
      {tab === 'marketplace' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Search bar — VS Code style */}
          <div className="px-3 py-2 shrink-0" style={{ borderBottom: '1px solid var(--border-color)' }}>
            <div
              className="flex items-center gap-2 px-2 py-1.5 text-xs rounded"
              style={{ background: 'var(--input-bg)', border: '1px solid var(--border-color)' }}
            >
              <Search size={12} style={{ color: 'var(--text-muted)' }} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索扩展 (Open VSX)..."
                className="flex-1 bg-transparent outline-none"
                style={{ color: 'var(--text-primary)' }}
                autoFocus
              />
              {searching && <Loader2 size={12} className="animate-spin" style={{ color: 'var(--text-muted)' }} />}
            </div>
          </div>

          {/* Results — VS Code compact list */}
          <div className="flex-1 overflow-y-auto divide-y" style={{ borderColor: 'var(--border-color)' }}>
            {searchResults === null && !searching && (
              <div className="flex flex-col items-center justify-center h-full text-center px-6">
                <Cloud size={36} style={{ color: 'var(--text-muted)', opacity: 0.25 }} />
                <p className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>
                  输入关键词搜索 Open VSX 扩展市场
                </p>
              </div>
            )}
            {searchResults && searchResults.length === 0 && (
              <p className="text-xs text-center py-10" style={{ color: 'var(--text-muted)' }}>
                没有匹配的扩展
              </p>
            )}
            {searchResults && searchResults.map((ext: any) => {
              const extName = `${ext.namespace}.${ext.name}`
              const isInstalled = extensions.some(e => e.name === extName)
              const isInstalling = installing === extName
              return (
                <div
                  key={extName}
                  className="flex items-start gap-2.5 px-3 py-2"
                  style={{ background: 'transparent' }}
                >
                  {/* Icon */}
                  <div
                    className="w-8 h-8 rounded flex items-center justify-center text-xs font-bold shrink-0"
                    style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}
                  >
                    {(ext.displayName || ext.name).charAt(0).toUpperCase()}
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                        {ext.displayName || ext.name}
                      </span>
                      <span className="text-[9px] px-1 py-[1px] rounded shrink-0" style={{
                        background: 'var(--badge-bg)', color: 'var(--badge-text)',
                      }}>
                        {ext.version}
                      </span>
                      <span className="text-[10px] shrink-0" style={{ color: 'var(--text-muted)' }}>
                        {ext.namespace}
                      </span>
                    </div>
                    <p className="text-[11px] leading-snug mt-0.5 line-clamp-1" style={{ color: 'var(--text-secondary)' }}>
                      {ext.description || ''}
                    </p>
                  </div>
                  {/* Install button */}
                  <div className="shrink-0 pt-0.5">
                    {isInstalled ? (
                      <span className="text-[10px] font-medium" style={{ color: 'var(--accent)' }}>✔ 已安装</span>
                    ) : (
                      <button
                        onClick={() => handleInstall(ext)}
                        disabled={isInstalling}
                        className="text-[11px] font-medium px-3 py-1 rounded cursor-pointer transition-colors disabled:opacity-50"
                        style={{
                          background: isInstalling ? 'var(--accent-bg)' : 'var(--accent)',
                          color: isInstalling ? 'var(--accent)' : '#fff',
                          border: 'none',
                        }}
                      >
                        {isInstalling ? (
                          <span className="flex items-center gap-1"><Loader2 size={10} className="animate-spin" /> 安装中</span>
                        ) : '安装'}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
