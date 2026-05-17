import { useRef, useState } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import { Copy, Check, FileDown, X, Edit3 } from 'lucide-react'
import { useStore } from '../stores/useStore'
import { logError } from '../lib/logger'

function detectTheme(): 'vs-dark' | 'light' {
  if (typeof document === 'undefined') return 'vs-dark'
  const theme = document.documentElement.getAttribute('data-theme')
  if (theme === 'light' || theme === 'sepia') return 'light'
  return 'vs-dark'
}

function extToLang(ext: string): string {
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    rs: 'rust', py: 'python', go: 'go', java: 'java', kt: 'kotlin',
    swift: 'swift', c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp',
    css: 'css', scss: 'scss', html: 'html', json: 'json', yaml: 'yaml',
    yml: 'yaml', toml: 'ini', md: 'markdown', rb: 'ruby', php: 'php',
    xml: 'xml', sql: 'sql', sh: 'shell', bash: 'shell', ps1: 'powershell',
    r: 'r', vue: 'html', svelte: 'html',
  }
  return map[ext] || 'plaintext'
}

export default function MonacoBlock({ code, language }: { code: string; language: string }) {
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)
  const monacoRef = useRef<Parameters<OnMount>[1] | null>(null)
  const [copied, setCopied] = useState(false)
  const [showSave, setShowSave] = useState(false)
  const [filePath, setFilePath] = useState('')
  const [applying, setApplying] = useState(false)
  const [applyResult, setApplyResult] = useState<'idle' | 'ok' | 'err'>('idle')
  const theme = detectTheme()
  const openEditingFile = useStore((s) => s.openEditingFile)

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor
    monacoRef.current = monaco
  }

  const handleCopy = () => {
    const text = editorRef.current?.getValue() || code
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const handleApply = async () => {
    if (!filePath.trim()) return
    setApplying(true)
    setApplyResult('idle')
    try {
      const ti = (window as any).__TAURI_INTERNALS__
      if (!ti) { setApplyResult('err'); return }
      const text = editorRef.current?.getValue() || code
      await ti.invoke('write_file', { path: filePath.trim(), content: text })
      setApplyResult('ok')
      setTimeout(() => { setShowSave(false); setFilePath(''); setApplyResult('idle') }, 1500)
    } catch (err) {
      logError('MonacoBlock', 'apply file write failed', err)
      setApplyResult('err')
    }
    setApplying(false)
  }

  const handleOpenInEditor = () => {
    const lang = language || 'plaintext'
    const ext = lang === 'typescript' ? 'ts' : lang === 'javascript' ? 'js' : lang
    const guessedPath = `untitled.${ext}`
    openEditingFile({ path: guessedPath, content: code })
  }

  return (
    <div className="relative group/code my-2 rounded-lg overflow-hidden border"
      style={{ borderColor: 'var(--border-color)' }}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 gap-1"
        style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-color)' }}>
        <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>{language}</span>
        <div className="flex items-center gap-1">
          <button onClick={handleOpenInEditor}
            className="p-1 rounded cursor-pointer hover:opacity-70 transition-opacity"
            style={{ color: 'var(--text-muted)' }} title="在编辑器中打开">
            <Edit3 size={12} />
          </button>
          <button onClick={() => setShowSave(!showSave)}
            className="p-1 rounded cursor-pointer hover:opacity-70 transition-opacity"
            style={{ color: 'var(--text-muted)' }} title="保存到文件">
            <FileDown size={12} />
          </button>
          <button onClick={handleCopy}
            className="p-1 rounded cursor-pointer transition-opacity"
            style={{ color: 'var(--text-muted)' }} title="复制代码">
            {copied ? <Check size={12} style={{ color: 'var(--accent)' }} /> : <Copy size={12} />}
          </button>
        </div>
      </div>
      {/* Monaco Editor */}
      <Editor
        height={Math.min(Math.max(code.split('\n').length * 19 + 20, 60), 500)}
        defaultLanguage={extToLang(language)}
        defaultValue={code}
        theme={theme}
        options={{
          readOnly: true,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          fontSize: 12,
          lineNumbers: 'on',
          renderWhitespace: 'selection',
          tabSize: 2,
          padding: { top: 8 },
          folding: true,
          glyphMargin: false,
          lineDecorationsWidth: 4,
          lineNumbersMinChars: 3,
          scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
          overviewRulerLanes: 0,
          overviewRulerBorder: false,
          hideCursorInOverviewRuler: true,
          cursorBlinking: 'smooth',
          smoothScrolling: true,
          contextmenu: true,
          automaticLayout: true,
        }}
        onMount={handleMount}
        loading={null}
      />
      {/* Save dialog */}
      {showSave && (
        <div className="flex items-center gap-2 p-2" style={{ background: 'var(--bg-elevated)', borderTop: '1px solid var(--border-color)' }}>
          <input value={filePath} onChange={(e) => setFilePath(e.target.value)}
            placeholder="输入文件路径..."
            className="flex-1 px-2 py-1 text-[11px] rounded outline-none"
            style={{ background: 'var(--input-bg)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleApply(); if (e.key === 'Escape') setShowSave(false) }}
            autoFocus />
          {applyResult === 'ok' ? <span className="text-[11px]" style={{ color: '#10b981' }}>✓</span>
            : applyResult === 'err' ? <span className="text-[11px]" style={{ color: '#ef4444' }}>失败</span>
            : <button onClick={handleApply} disabled={applying || !filePath.trim()}
                className="px-2 py-1 text-[11px] font-medium rounded cursor-pointer disabled:opacity-40"
                style={{ background: 'var(--accent)', color: '#fff', border: 'none' }}>
                {applying ? '...' : '保存'}
              </button>}
          <button onClick={() => setShowSave(false)} className="p-1 rounded cursor-pointer"
            style={{ color: 'var(--text-muted)' }}><X size={12} /></button>
        </div>
      )}
    </div>
  )
}
