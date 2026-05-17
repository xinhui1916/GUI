import { useState, useEffect, useRef, useCallback } from 'react'
import { Save, RefreshCw } from 'lucide-react'
import type { editor } from 'monaco-editor'
import { useStore } from '../stores/useStore'
import { useToastStore } from '../stores/toastStore'

export default function JsonSettingsEditor() {
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const addToast = useToastStore((s) => s.addToast)

  // Snapshot current settings
  const store = useStore.getState()
  const initialJson = JSON.stringify({
    theme: store.theme,
    model: store.model,
    customPrompt: store.customPrompt,
    lang: store.lang,
    systemFollow: store.systemFollow,
    apiProvider: store.apiProvider,
    backendMode: store.backendMode,
  }, null, 2)

  const initEditor = useCallback(async () => {
    if (!containerRef.current || editorRef.current) return
    const monaco = await import('monaco-editor')
    const ed = monaco.editor.create(containerRef.current, {
      value: initialJson,
      language: 'json',
      theme: 'vs-dark',
      fontSize: 11,
      lineNumbers: 'off',
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      wordWrap: 'on',
      automaticLayout: true,
    })
    editorRef.current = ed
  }, [initialJson])

  useEffect(() => {
    initEditor()
    return () => {
      editorRef.current?.dispose()
      editorRef.current = null
    }
  }, [initEditor])

  const applySettings = () => {
    const val = editorRef.current?.getValue() || ''
    setError('')
    try {
      const parsed = JSON.parse(val)
      const s = useStore.getState()
      if (parsed.theme) s.setTheme(parsed.theme)
      if (parsed.model) s.setModel(parsed.model)
      if (parsed.customPrompt !== undefined) s.setCustomPrompt(parsed.customPrompt)
      if (parsed.lang) s.setLang(parsed.lang)
      if (parsed.systemFollow !== undefined) s.setSystemFollow(parsed.systemFollow)
      if (parsed.apiProvider) s.setApiProvider(parsed.apiProvider)
      if (parsed.backendMode) s.setBackendMode(parsed.backendMode)
      setSaved(true)
      addToast({ type: 'success', title: '设置已应用', duration: 2000 })
      setTimeout(() => setSaved(false), 2000)
    } catch (e: any) {
      setError(e.message || 'JSON 解析错误')
      addToast({ type: 'error', title: 'JSON 解析错误', message: e.message, duration: 4000 })
    }
  }

  return (
    <div className="space-y-2">
      <div ref={containerRef} className="h-[200px] rounded" style={{ border: '1px solid var(--border-color)', overflow: 'hidden' }} />
      {error && (
        <p className="text-[10px]" style={{ color: 'var(--danger, #ef4444)' }}>{error}</p>
      )}
      <div className="flex gap-2">
        <button
          onClick={applySettings}
          className="flex-1 py-1.5 text-xs font-medium rounded cursor-pointer transition-colors flex items-center justify-center gap-1"
          style={{ background: saved ? 'var(--accent)' : 'var(--bg-elevated)', border: '1px solid var(--border-color)', color: saved ? '#fff' : 'var(--text-primary)' }}
        >
          {saved ? <><Save size={11} /> 已应用</> : <><Save size={11} /> 应用设置</>}
        </button>
        <button
          onClick={() => {
            const s = useStore.getState()
            editorRef.current?.setValue(JSON.stringify({
              theme: s.theme, model: s.model, customPrompt: s.customPrompt,
              lang: s.lang, systemFollow: s.systemFollow,
            }, null, 2))
            setError('')
          }}
          className="px-3 py-1.5 text-xs rounded cursor-pointer"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}
        >
          <RefreshCw size={11} />
        </button>
      </div>
      <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
        直接编辑 JSON 配置。修改会立即应用到当前会话。
      </p>
    </div>
  )
}
