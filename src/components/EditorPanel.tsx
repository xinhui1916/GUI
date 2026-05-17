import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import Editor, { loader, type OnMount } from '@monaco-editor/react'
import { Group, Panel } from 'react-resizable-panels'
import {
  FileCode, X, LayoutPanelLeft, LayoutPanelTop,
  Layers, Eye, Wand2,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import { useStore } from '../stores/useStore'
import { useToastStore } from '../stores/toastStore'
import { readSnippets, formatCode, gitDiff as ipcGitDiff, lspStartServer, lspRequest, lspNotification, onLspDiagnostics } from '../lib/ipc'
import { useDebugStore } from '../stores/debugStore'
import { logError } from '../lib/logger'

function extToLang(ext: string): string {
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    rs: 'rust', py: 'python', go: 'go', java: 'java', kt: 'kotlin',
    swift: 'swift', c: 'c', cpp: 'cpp', css: 'css', html: 'html',
    json: 'json', yaml: 'yaml', yml: 'yaml', md: 'markdown', sh: 'shell',
    bash: 'shell', ps1: 'powershell', sql: 'sql', vue: 'html', svelte: 'html',
  }
  return map[ext] || 'plaintext'
}

function getFilename(path: string): string {
  const idx = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'))
  return idx >= 0 ? path.slice(idx + 1) : path
}

function getExt(path: string): string {
  const fn = getFilename(path)
  return fn.includes('.') ? fn.split('.').pop() || '' : ''
}

function isImage(path: string): boolean {
  const ext = getExt(path).toLowerCase()
  return ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico'].includes(ext)
}

function pathToUri(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  return normalized.startsWith('/') ? `file://${normalized}` : `file:///${normalized}`
}

// ── Outline Panel ─────────────────────────────────────────────────

interface OutlineSymbol {
  name: string
  kind: string
  range: { startLine: number; startCol: number; endLine: number; endCol: number }
  children?: OutlineSymbol[]
}

function parseOutline(content: string, lang: string): OutlineSymbol[] {
  const symbols: OutlineSymbol[] = []
  if (lang === 'typescript' || lang === 'javascript') {
    const patterns: { re: RegExp; kind: string }[] = [
      { re: /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/gm, kind: 'function' },
      { re: /^(?:export\s+)?(?:class|abstract\s+class)\s+(\w+)/gm, kind: 'class' },
      { re: /^(?:export\s+)?(?:interface)\s+(\w+)/gm, kind: 'interface' },
      { re: /^(?:export\s+)?(?:type)\s+(\w+)\s*=/gm, kind: 'type' },
      { re: /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*(?::|=[^=])/gm, kind: 'variable' },
      { re: /^(?:export\s+)?(?:enum)\s+(\w+)/gm, kind: 'enum' },
      { re: /^\s*(?:async\s+)?(?:private|public|protected)?\s*(?:static\s+)?(?:get\s+)?(\w+)\s*\([^)]*\)\s*{/gm, kind: 'method' },
    ]
    for (const { re, kind } of patterns) {
      let m: RegExpExecArray | null
      while ((m = re.exec(content)) !== null) {
        const idx = m.index
        const line = content.slice(0, idx).split('\n').length
        symbols.push({ name: m[1], kind, range: { startLine: line, startCol: 0, endLine: line, endCol: 0 } })
      }
    }
  }
  if (lang === 'rust') {
    const patterns: { re: RegExp; kind: string }[] = [
      { re: /^fn\s+(\w+)/gm, kind: 'function' },
      { re: /^struct\s+(\w+)/gm, kind: 'struct' },
      { re: /^enum\s+(\w+)/gm, kind: 'enum' },
      { re: /^(?:pub\s+)?(?:trait|impl)\s+(\w+)/gm, kind: 'trait' },
      { re: /^(?:pub\s+)?(?:mod)\s+(\w+)/gm, kind: 'module' },
      { re: /^(?:pub\s+)?(?:type)\s+(\w+)/gm, kind: 'type' },
      { re: /^(?:pub\s+)?(?:const)\s+(\w+)/gm, kind: 'variable' },
    ]
    for (const { re, kind } of patterns) {
      let m: RegExpExecArray | null
      while ((m = re.exec(content)) !== null) {
        const idx = m.index
        const line = content.slice(0, idx).split('\n').length
        symbols.push({ name: m[1], kind, range: { startLine: line, startCol: 0, endLine: line, endCol: 0 } })
      }
    }
  }
  return symbols
}

function kindIcon(kind: string): string {
  const map: Record<string, string> = {
    function: 'ƒ', method: 'ƒ', class: 'C', interface: 'I', type: 'T',
    enum: 'E', struct: 'S', trait: 'T', module: 'M', variable: 'v',
  }
  return map[kind] || '•'
}

function OutlinePanel({ symbols, onSelect, onClose }: {
  symbols: OutlineSymbol[]
  onSelect: (line: number) => void
  onClose: () => void
}) {
  return (
    <div
      className="flex flex-col text-xs overflow-hidden"
      style={{
        width: 180,
        borderLeft: '1px solid var(--border-color)',
        background: 'var(--bg-elevated)',
      }}
    >
      <div
        className="flex items-center justify-between px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide"
        style={{ color: 'var(--panel-header)', borderBottom: '1px solid var(--border-color)' }}
      >
        <span>大纲</span>
        <button onClick={onClose} className="p-0.5 rounded cursor-pointer hover:opacity-70"
          style={{ color: 'var(--text-muted)' }}><X size={11} /></button>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {symbols.length === 0 ? (
          <p className="text-[10px] px-2 py-3 text-center" style={{ color: 'var(--text-muted)' }}>无符号</p>
        ) : (
          symbols.map((sym, i) => (
            <button
              key={i}
              onClick={() => onSelect(sym.range.startLine)}
              className="w-full flex items-center gap-1.5 px-2 py-1 text-left cursor-pointer hover:opacity-80"
              style={{ color: 'var(--text-secondary)' }}
            >
              <span className="text-[10px] font-mono w-4 text-center shrink-0" style={{ color: 'var(--accent)' }}>
                {kindIcon(sym.kind)}
              </span>
              <span className="truncate">{sym.name}</span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}

// ── TabBar ──────────────────────────────────────────────────────────

function TabBar({ files, activePath, onSelect, onClose, onCloseAll, dirtyFiles, previewFiles, onSplitOpen }: {
  files: { path: string; content: string }[]
  activePath: string | null
  onSelect: (path: string) => void
  onClose: (path: string) => void
  onCloseAll: () => void
  dirtyFiles?: Set<string>
  previewFiles?: Set<string>
  onSplitOpen?: (path: string) => void
}) {
  const tabRef = useRef<HTMLDivElement>(null)
  const [contextMenu, setContextMenu] = useState<{ path: string; x: number; y: number } | null>(null)

  useEffect(() => {
    const el = tabRef.current?.querySelector('[data-active="true"]') as HTMLElement
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [activePath])

  return (
    <div
      ref={tabRef}
      className="flex items-center overflow-x-auto no-scrollbar shrink-0"
      style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-color)', minHeight: 32 }}
    >
      {files.map((f) => {
        const name = getFilename(f.path)
        const isActive = f.path === activePath
        return (
          <div
            key={f.path}
            data-active={isActive ? 'true' : 'false'}
            onClick={() => {
              // Preview tab becomes permanent on click
              if (previewFiles?.has(f.path)) {
                previewFiles.delete(f.path)
              }
              onSelect(f.path)
            }}
            className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] cursor-pointer shrink-0 select-none"
            style={{
              borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
              color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
              background: isActive ? 'var(--accent-bg)' : 'transparent',
              fontStyle: previewFiles?.has(f.path) ? 'italic' : 'normal',
            }}
            onContextMenu={(e) => {
              e.preventDefault()
              setContextMenu({ path: f.path, x: e.clientX, y: e.clientY })
            }}
          >
            <span className="truncate max-w-[130px]">{name}</span>
            {dirtyFiles?.has(f.path) && (
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: 'var(--accent)' }} />
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onClose(f.path) }}
              className="p-0.5 rounded hover:opacity-70 cursor-pointer ml-0.5"
              style={{ color: 'var(--text-muted)' }}
            >
              <X size={10} />
            </button>
          </div>
        )
      })}
      {files.length > 1 && (
        <div className="ml-auto px-1 flex items-center gap-0.5">
          <button onClick={onCloseAll} className="p-1 rounded cursor-pointer hover:opacity-70"
            style={{ color: 'var(--text-muted)' }} title="全部关闭">
            <X size={11} />
          </button>
        </div>
      )}

      {/* Tab context menu */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
          <div
            className="fixed z-50 rounded-lg shadow-xl py-1 min-w-[140px]"
            style={{ left: contextMenu.x, top: contextMenu.y, background: 'var(--sidebar-bg)', border: '1px solid var(--border-color)' }}
          >
            <button onClick={() => { onClose(contextMenu.path); setContextMenu(null) }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-left cursor-pointer hover:opacity-80"
              style={{ color: 'var(--text-secondary)' }}>关闭</button>
            <button onClick={() => { files.filter(f => f.path !== contextMenu.path).forEach(f => onClose(f.path)); setContextMenu(null) }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-left cursor-pointer hover:opacity-80"
              style={{ color: 'var(--text-secondary)' }}>关闭其他</button>
            <button onClick={() => { const idx = files.findIndex(f => f.path === contextMenu.path); files.filter((_, i) => i > idx).forEach(f => onClose(f.path)); setContextMenu(null) }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-left cursor-pointer hover:opacity-80"
              style={{ color: 'var(--text-secondary)' }}>关闭右侧</button>
            <div style={{ borderTop: '1px solid var(--border-color)', margin: '2px 0' }} />
            {onSplitOpen && (
              <button onClick={() => { onSplitOpen(contextMenu.path); setContextMenu(null) }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-left cursor-pointer hover:opacity-80"
                style={{ color: 'var(--text-secondary)' }}>分屏打开</button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ── LSP providers hook ─────────────────────────────────────────────

function useLspProviders(workspacePath: string) {
  useEffect(() => {
    if (!workspacePath) return

    let cancelled = false
    const disposables: { dispose: () => void }[] = []
    let unlistenDiagnostics: (() => void) | undefined

    const langIds = [
      'typescript', 'javascript', 'typescriptreact', 'javascriptreact',
      'python', 'rust', 'json', 'jsonc', 'html', 'css', 'scss', 'go',
      'yaml', 'markdown', 'shell',
    ]

    loader.init().then((monaco) => {
      if (cancelled) return

      const getServerId = (model: any): string | null => {
        const lang = model.getLanguageId()
        if (!langIds.includes(lang)) return null
        return `${lang}@${workspacePath}`
      }

      const lspRange = (r: any) => new monaco.Range(
        r.start.line + 1, r.start.character + 1,
        r.end.line + 1, r.end.character + 1,
      )

      // ── Definition provider ──
      disposables.push(monaco.languages.registerDefinitionProvider(langIds, {
        provideDefinition: async (model: any, position: any) => {
          const sid = getServerId(model)
          if (!sid) return []
          try {
            const result = await lspRequest(sid, 'textDocument/definition', {
              textDocument: { uri: model.uri.toString() },
              position: { line: position.lineNumber - 1, character: position.column - 1 },
            })
            if (!result) return []
            const arr = Array.isArray(result) ? result : [result]
            return arr.map((loc: any) => ({
              uri: monaco.Uri.parse(loc.uri),
              range: lspRange(loc.range),
            }))
          } catch (err) { logError('EditorPanel', 'LSP definition failed', err); return [] }
        },
      }))

      // ── References provider ──
      disposables.push(monaco.languages.registerReferenceProvider(langIds, {
        provideReferences: async (model: any, position: any) => {
          const sid = getServerId(model)
          if (!sid) return []
          try {
            const result = await lspRequest(sid, 'textDocument/references', {
              textDocument: { uri: model.uri.toString() },
              position: { line: position.lineNumber - 1, character: position.column - 1 },
              context: { includeDeclaration: true },
            })
            if (!result) return []
            return result.map((loc: any) => ({
              uri: monaco.Uri.parse(loc.uri),
              range: lspRange(loc.range),
            }))
          } catch (err) { logError('EditorPanel', 'LSP references failed', err); return [] }
        },
      }))

      // ── Hover provider ──
      disposables.push(monaco.languages.registerHoverProvider(langIds, {
        provideHover: async (model: any, position: any) => {
          const sid = getServerId(model)
          if (!sid) return null
          try {
            const result = await lspRequest(sid, 'textDocument/hover', {
              textDocument: { uri: model.uri.toString() },
              position: { line: position.lineNumber - 1, character: position.column - 1 },
            })
            if (!result) return null
            const contents = Array.isArray(result.contents) ? result.contents : [result.contents]
            const markdownStr = contents.map((c: any) => {
              if (typeof c === 'string') return c
              if (c.kind === 'markdown') return c.value
              if (c.language && c.value) return '```' + c.language + '\n' + c.value + '\n```'
              return c.value || ''
            }).join('\n\n')
            return {
              contents: [{ value: markdownStr }],
              range: result.range ? lspRange(result.range) : undefined,
            }
          } catch (err) { logError('EditorPanel', 'LSP hover failed', err); return null }
        },
      }))

      // ── Code action provider ──
      disposables.push(monaco.languages.registerCodeActionProvider(langIds, {
        provideCodeActions: async (model: any, _range: any, context: any) => {
          const sid = getServerId(model)
          if (!sid || !context.markers?.length) return { actions: [], dispose: () => {} }
          try {
            const result = await lspRequest(sid, 'textDocument/codeAction', {
              textDocument: { uri: model.uri.toString() },
              range: {
                start: { line: _range.startLineNumber - 1, character: _range.startColumn - 1 },
                end: { line: _range.endLineNumber - 1, character: _range.endColumn - 1 },
              },
              context: {
                diagnostics: context.markers.map((m: any) => ({
                  range: {
                    start: { line: m.startLineNumber - 1, character: m.startColumn - 1 },
                    end: { line: m.endLineNumber - 1, character: m.endColumn - 1 },
                  },
                  message: m.message,
                  severity: m.severity,
                })),
              },
            })
            if (!result) return { actions: [], dispose: () => {} }
            const actions = Array.isArray(result) ? result : []
            return {
              actions: actions.map((a: any) => ({ title: a.title, kind: a.kind, diagnostics: a.diagnostics, edit: a.edit, command: a.command })),
              dispose: () => {},
            }
          } catch (err) { logError('EditorPanel', 'LSP code actions failed', err); return { actions: [], dispose: () => {} } }
        },
      }))

      // ── Completion provider ──
      disposables.push(monaco.languages.registerCompletionItemProvider(langIds, {
        triggerCharacters: ['.', '/', '@', '<', '"', "'", ':', '#'],
        provideCompletionItems: async (model: any, position: any) => {
          const sid = getServerId(model)
          if (!sid) return { suggestions: [] }
          try {
            const result = await lspRequest(sid, 'textDocument/completion', {
              textDocument: { uri: model.uri.toString() },
              position: { line: position.lineNumber - 1, character: position.column - 1 },
              context: { triggerKind: 1 },
            })
            if (!result) return { suggestions: [] }
            const items = Array.isArray(result) ? result : (result.items || [])
            const kindMap: Record<number, number> = {
              1: monaco.languages.CompletionItemKind.Text,
              2: monaco.languages.CompletionItemKind.Method,
              3: monaco.languages.CompletionItemKind.Function,
              4: monaco.languages.CompletionItemKind.Constructor,
              5: monaco.languages.CompletionItemKind.Field,
              6: monaco.languages.CompletionItemKind.Variable,
              7: monaco.languages.CompletionItemKind.Class,
              8: monaco.languages.CompletionItemKind.Interface,
              9: monaco.languages.CompletionItemKind.Module,
              10: monaco.languages.CompletionItemKind.Property,
              11: monaco.languages.CompletionItemKind.Unit,
              12: monaco.languages.CompletionItemKind.Value,
              13: monaco.languages.CompletionItemKind.Enum,
              14: monaco.languages.CompletionItemKind.Keyword,
              15: monaco.languages.CompletionItemKind.Snippet,
              16: monaco.languages.CompletionItemKind.Color,
              17: monaco.languages.CompletionItemKind.File,
              18: monaco.languages.CompletionItemKind.Reference,
              19: monaco.languages.CompletionItemKind.Folder,
              20: monaco.languages.CompletionItemKind.EnumMember,
              21: monaco.languages.CompletionItemKind.Constant,
              22: monaco.languages.CompletionItemKind.Struct,
              23: monaco.languages.CompletionItemKind.Event,
              24: monaco.languages.CompletionItemKind.Operator,
              25: monaco.languages.CompletionItemKind.TypeParameter,
            }
            return {
              suggestions: items.map((item: any) => ({
                label: item.label,
                kind: kindMap[item.kind] || monaco.languages.CompletionItemKind.Text,
                detail: item.detail || '',
                documentation: item.documentation?.value || item.documentation || '',
                insertText: item.textEdit?.newText || item.insertText || item.label,
                range: item.textEdit?.range ? lspRange(item.textEdit.range) : undefined,
              })),
            }
          } catch (err) {
            logError('EditorPanel', 'LSP completion failed', err)
            return { suggestions: [] }
          }
        },
      }))

      // ── Rename provider ──
      disposables.push(monaco.languages.registerRenameProvider(langIds, {
        provideRenameEdits: async (model: any, position: any, newName: string) => {
          const sid = getServerId(model)
          if (!sid) return null
          try {
            const result = await lspRequest(sid, 'textDocument/rename', {
              textDocument: { uri: model.uri.toString() },
              position: { line: position.lineNumber - 1, character: position.column - 1 },
              newName,
            })
            if (!result?.changes) return null
            const edit: any = { edits: [] }
            for (const [uri, changes] of Object.entries(result.changes)) {
              edit.edits.push({
                resource: monaco.Uri.parse(uri),
                textEdit: (changes as any[]).map((c: any) => ({
                  range: lspRange(c.range),
                  text: c.newText,
                })),
              })
            }
            return edit
          } catch (err) { logError('EditorPanel', 'LSP rename failed', err); return null }
        },
      }))

      // ── Diagnostics listener ──
      onLspDiagnostics((params) => {
        const model = monaco.editor.getModel(monaco.Uri.parse(params.uri))
        if (!model) return
        monaco.editor.setModelMarkers(model, 'lsp', (params.diagnostics || []).map((d: any) => ({
          severity: d.severity === 1 ? monaco.MarkerSeverity.Error
            : d.severity === 2 ? monaco.MarkerSeverity.Warning
            : d.severity === 3 ? monaco.MarkerSeverity.Info
            : monaco.MarkerSeverity.Hint,
          message: d.message,
          source: d.source || 'LSP',
          startLineNumber: d.range.start.line + 1,
          startColumn: d.range.start.character + 1,
          endLineNumber: d.range.end.line + 1,
          endColumn: d.range.end.character + 1,
          tags: d.tags,
        })))
      }).then(fn => { unlistenDiagnostics = fn })
    })

    return () => {
      cancelled = true
      disposables.forEach(d => d.dispose())
      unlistenDiagnostics?.()
    }
  }, [workspacePath])
}

// ── EditorInstance (single Monaco editor) ──────────────────────────

function EditorInstance({ file, isActive }: { file: { path: string; content: string }; isActive: boolean }) {
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(false)
  const updateEditingFileContent = useStore((s) => s.updateEditingFileContent)
  const addToast = useToastStore((s) => s.addToast)
  const tabSize = useStore((s) => s.tabSize)

  // LSP lifecycle
  const serverIdRef = useRef<string | null>(null)
  const versionRef = useRef(0)
  const isFirstRenderRef = useRef(true)
  const fileUriRef = useRef(pathToUri(file.path))

  const ext = getExt(file.path)
  const lang = extToLang(ext)

  const handleMount: OnMount = (editor) => {
    editorRef.current = editor

    // Track editor selection for auto-context
    editor.onDidChangeCursorSelection((e) => {
      const text = editor.getModel()?.getValueInRange(e.selection) || ''
      useStore.getState().setEditorSelection(text)
    })

    editor.addAction({
      id: 'claude-send-selection',
      label: '发送选中代码给 Claude',
      contextMenuGroupId: 'modification',
      contextMenuOrder: 1,
      run: () => {
        const selection = editor.getSelection()
        if (!selection || selection.isEmpty()) return
        const text = editor.getModel()?.getValueInRange(selection)
        if (!text) return
        const fileName = getFilename(file.path)
        window.dispatchEvent(new CustomEvent('claude-insert-text', {
          detail: JSON.stringify({ text, file: file.path, fileName }),
        }))
        addToast({
          type: 'info',
          title: '代码已添加到输入框',
          message: fileName ? `${fileName} — ${text.slice(0, 30)}...` : '',
          duration: 2000,
        })
      },
    })

    editor.addAction({
      id: 'claude-format-code',
      label: '格式化代码',
      contextMenuGroupId: 'modification',
      contextMenuOrder: 2,
      run: () => {
        window.dispatchEvent(new CustomEvent('claude-format-code'))
      },
    })

    editor.addAction({
      id: 'claude-rename-symbol',
      label: '重命名符号 (F2)',
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 1,
      run: () => {
        editor.trigger('keyboard', 'editor.action.rename', null)
      },
    })

    editor.addAction({
      id: 'claude-quick-outline',
      label: '快速大纲搜索 (Ctrl+Shift+O)',
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 2,
      run: () => {
        editor.trigger('keyboard', 'editor.action.quickOutline', null)
      },
    })

    editor.addAction({
      id: 'claude-copy-line-up',
      label: '复制行向上',
      contextMenuGroupId: 'modification',
      contextMenuOrder: 3,
      run: () => {
        editor.trigger('keyboard', 'editor.action.copyLinesUpAction', null)
      },
    })

    // Register snippets as completion items
    const model = editor.getModel()
    if (model) {
      const langId = model.getLanguageId()
      const disposable = (window as any).monaco?.languages?.registerCompletionItemProvider?.(
        langId,
        {
          triggerCharacters: [],
          provideCompletionItems: async (model: any, position: any) => {
            try {
              const raw = await readSnippets()
              const snippets = JSON.parse(raw)
              if (!Array.isArray(snippets) || snippets.length === 0) {
                return { suggestions: [] }
              }
              const monaco = (window as any).monaco
              const word = model.getWordUntilPosition(position)
              const range = {
                startLineNumber: position.lineNumber,
                endLineNumber: position.lineNumber,
                startColumn: word.startColumn,
                endColumn: word.endColumn,
              }
              const suggestions = snippets
                .filter((s: any) => s?.prefix)
                .map((s: any) => ({
                  label: s.prefix,
                  kind: monaco.languages.CompletionItemKind.Snippet,
                  detail: s.description || s.prefix,
                  insertText: s.body.join('\n'),
                  insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                  range,
                }))
              return { suggestions }
            } catch (err) {
              logError('EditorPanel', 'read snippets failed', err)
              return { suggestions: [] }
            }
          },
        }
      )
      if (disposable) {
        ;(editor as any).__snippetsDisposable = disposable
      }
    }

    // Gutter click → toggle breakpoint
    editor.onMouseDown((e: any) => {
      const target = e.target
      if (!target?.position) return
      // GUTTER_GLYPH_MARGIN = 2, GUTTER_LINE_NUMBERS = 4
      if (target.type !== 2 && target.type !== 4) return
      const line = target.position.lineNumber
      const bps = useDebugStore.getState().breakpoints
      const existing = bps.find(b => b.file === file.path && b.line === line)
      if (existing) {
        useDebugStore.getState().removeBreakpoint(existing.id)
      } else {
        useDebugStore.getState().addBreakpoint({
          id: `bp-${file.path}:${line}-${Date.now()}`,
          file: file.path,
          line,
          enabled: true,
        })
      }
    })

    // Initial breakpoint decorations
    const monaco = (window as any).monaco
    if (monaco) {
      const bps = useDebugStore.getState().breakpoints.filter(b => b.file === file.path)
      const decos = bps.map(bp => ({
        range: new monaco.Range(bp.line, 1, bp.line, 1),
        options: {
          isWholeLine: true,
          glyphMarginClassName: bp.enabled ? 'breakpoint-glyph' : 'breakpoint-glyph-disabled',
          glyphMarginHoverMessage: { value: '断点' },
        },
      }))
      ;(editor as any).__bpDecorations = editor.deltaDecorations(
        (editor as any).__bpDecorations || [],
        decos,
      )
    }

    setMounted(true)
  }

  const handleChange = useCallback((val: string | undefined) => {
    if (val !== undefined) {
      updateEditingFileContent(file.path, val)
    }
  }, [file.path, updateEditingFileContent])

  // ── LSP: didOpen on mount / didClose on unmount ──
  useEffect(() => {
    const uri = pathToUri(file.path)
    fileUriRef.current = uri
    versionRef.current = 1
    isFirstRenderRef.current = true

    const ws = useStore.getState().workspacePath
    if (!ws) return

    lspStartServer(lang, ws).then((sid) => {
      serverIdRef.current = sid
      lspNotification(sid, 'textDocument/didOpen', {
        textDocument: { uri, languageId: lang, version: 1, text: file.content },
      }).catch((err) => logError('EditorPanel', 'LSP didOpen failed', err))
    }).catch((err) => logError('EditorPanel', 'LSP start server failed', err))

    return () => {
      if (serverIdRef.current) {
        lspNotification(serverIdRef.current, 'textDocument/didClose', {
          textDocument: { uri },
        }).catch((err) => logError('EditorPanel', 'LSP didClose failed', err))
        serverIdRef.current = null
      }
    }
  }, [file.path])

  // ── LSP: debounced didChange ──
  useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false
      return
    }

    const timer = setTimeout(() => {
      if (!serverIdRef.current) return
      versionRef.current++
      lspNotification(serverIdRef.current, 'textDocument/didChange', {
        textDocument: { uri: fileUriRef.current, version: versionRef.current },
        contentChanges: [{ text: file.content }],
      }).catch((err) => logError('EditorPanel', 'LSP didChange failed', err))
    }, 400)

    return () => clearTimeout(timer)
  }, [file.content])

  // ── Git gutter diff decorations ──
  useEffect(() => {
    const editor = editorRef.current
    const ws = useStore.getState().workspacePath
    if (!editor || !ws) return

    let cancelled = false
    let currentDecorations: string[] = []

    ipcGitDiff(ws, file.path, false).then((diff) => {
      if (cancelled || diff === '(no diff)') return

      const monaco = (window as any).monaco
      if (!monaco) return

      // Parse diff to find added/modified lines
      const addedLines = new Set<number>()
      const modifiedLines = new Set<number>()
      const lines = diff.split('\n')
      let currentLine = 0
      let hunkHasMinus = false
      let hunkPlusLines: number[] = []

      for (const line of lines) {
        if (line.startsWith('@@')) {
          // Flush previous hunk
          if (hunkHasMinus) {
            for (const l of hunkPlusLines) modifiedLines.add(l)
          } else {
            for (const l of hunkPlusLines) addedLines.add(l)
          }
          hunkHasMinus = false
          hunkPlusLines = []
          // @@ -a,b +c,d @@
          const match = line.match(/\+(\d+)(?:,(\d+))?/)
          if (match) currentLine = parseInt(match[1]) - 1
          continue
        }
        if (line.startsWith('-') && !line.startsWith('---')) {
          hunkHasMinus = true
        } else if (line.startsWith('+') && !line.startsWith('+++')) {
          currentLine++
          hunkPlusLines.push(currentLine)
        } else if (!line.startsWith('\\')) {
          currentLine++
        }
      }
      // Flush last hunk
      if (hunkHasMinus) {
        for (const l of hunkPlusLines) modifiedLines.add(l)
      } else {
        for (const l of hunkPlusLines) addedLines.add(l)
      }

      const decorations: any[] = []
      for (const line of addedLines) {
        if (!modifiedLines.has(line)) {
          decorations.push({
            range: new monaco.Range(line, 1, line, 1),
            options: {
              isWholeLine: true,
              glyphMarginClassName: 'diff-added-glyph',
              linesDecorationsClassName: 'diff-added-line',
            },
          })
        }
      }
      for (const line of modifiedLines) {
        decorations.push({
          range: new monaco.Range(line, 1, line, 1),
          options: {
            isWholeLine: true,
            glyphMarginClassName: 'diff-modified-glyph',
            linesDecorationsClassName: 'diff-modified-line',
          },
        })
      }

      currentDecorations = editor.deltaDecorations(currentDecorations, decorations)
    }).catch((err) => logError('EditorPanel', 'git diff failed', err))

    return () => {
      cancelled = true
      if (editor && currentDecorations.length > 0) {
        currentDecorations = editor.deltaDecorations(currentDecorations, [])
      }
    }
  }, [file.path, mounted])

  // Remount editor when file path changes (different model)
  if (!isActive && !mounted) return null

  return (
    <div ref={containerRef} className="flex-1 overflow-hidden">
      <Editor
        key={file.path}
        path={pathToUri(file.path)}
        defaultLanguage={lang}
        value={file.content}
        theme="vs-dark"
        onChange={handleChange}
        onMount={handleMount}
        options={{
          readOnly: false,
          minimap: { enabled: true, scale: 1, showSlider: 'mouseover' },
          scrollBeyondLastLine: false,
          fontSize: 13,
          lineNumbers: 'on',
          tabSize,
          wordWrap: 'on',
          folding: true,
          automaticLayout: true,
          cursorBlinking: 'smooth',
          smoothScrolling: true,
          renderWhitespace: 'selection',
          bracketPairColorization: { enabled: true },
          padding: { top: 8 },
          colorDecorators: true,
          codeLens: true,
          inlayHints: { enabled: 'on' },
          stickyScroll: { enabled: true },
        }}
        loading={null}
      />
    </div>
  )
}

// ── EditorPanel (main) ─────────────────────────────────────────────

export default function EditorPanel() {
  const editingFiles = useStore((s) => s.editingFiles)
  const activeEditingFilePath = useStore((s) => s.activeEditingFilePath)
  const closeEditingFile = useStore((s) => s.closeEditingFile)
  const setActiveEditingFile = useStore((s) => s.setActiveEditingFile)
  const updateEditingFileContent = useStore((s) => s.updateEditingFileContent)
  const addToast = useToastStore((s) => s.addToast)
  const workspacePath = useStore((s) => s.workspacePath)

  // LSP providers (registered once per workspace)
  useLspProviders(workspacePath)

  // Split view state
  const [splitMode, setSplitMode] = useState<'none' | 'horizontal' | 'vertical'>('none')
  const [splitFile, setSplitFile] = useState<string | null>(null)
  const [showOutline, setShowOutline] = useState(true)
  const [previewMode, setPreviewMode] = useState(false)

  const activeFile = editingFiles.find(f => f.path === activeEditingFilePath)

  // ── Dirty tracking ──
  const originalsRef = useRef<Record<string, string>>({})
  const prevFilesRef = useRef<string[]>([])
  const [dirtySet, setDirtySet] = useState<Set<string>>(new Set())
  const [previewSet, setPreviewSet] = useState<Set<string>>(new Set())
  useEffect(() => {
    const prev = prevFilesRef.current
    const newFiles = editingFiles.filter(f => !prev.includes(f.path))
    // New files start in preview mode (except first load)
    if (prev.length > 0 && newFiles.length > 0) {
      setPreviewSet(s => { const n = new Set(s); newFiles.forEach(f => n.add(f.path)); return n })
    }
    prevFilesRef.current = editingFiles.map(f => f.path)
    // Track original content
    for (const f of editingFiles) {
      if (!(f.path in originalsRef.current)) {
        originalsRef.current[f.path] = f.content
      }
    }
    // Compute dirty set
    const dirty: string[] = []
    for (const f of editingFiles) {
      if (originalsRef.current[f.path] !== f.content) {
        dirty.push(f.path)
      }
    }
    setDirtySet(new Set(dirty))
  }, [editingFiles])

  // ── Image viewer state ──
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null)
  const [imageLoading, setImageLoading] = useState(false)
  useEffect(() => {
    if (!activeFile || !isImage(activeFile.path)) {
      setImageDataUrl(null)
      setImageLoading(false)
      return
    }
    let cancelled = false
    setImageLoading(true)
    ;(async () => {
      try {
        const { readFileBase64 } = await import('../lib/ipc')
        const b64 = await readFileBase64(activeFile.path)
        if (!cancelled) {
          const ext = getExt(activeFile.path).toLowerCase()
          const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`
          setImageDataUrl(`data:${mime};base64,${b64}`)
        }
      } catch (err) { logError('EditorPanel', 'read image failed', err); setImageDataUrl(null) }
      if (!cancelled) setImageLoading(false)
    })()
    return () => { cancelled = true }
  }, [activeFile?.path])

  // ── Auto-save + format-on-save ──
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveFile = useCallback(async (file: { path: string; content: string }) => {
    try {
      const { writeFile } = await import('../lib/ipc')
      if (useStore.getState().formatOnSave) {
        const { formatCode } = await import('../lib/ipc')
        const formatted = await formatCode(file.path, file.content)
        useStore.getState().updateEditingFileContent(file.path, formatted)
        await writeFile(file.path, formatted)
      } else {
        await writeFile(file.path, file.content)
      }
      // Reset original so dirty dot disappears
      originalsRef.current[file.path] = file.content
    } catch (err) { logError('EditorPanel', 'save file failed', err) }
  }, [])

  useEffect(() => {
    const s = useStore.getState()
    if (!s.autoSave || !activeFile || isImage(activeFile.path)) return
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    autoSaveTimerRef.current = setTimeout(() => {
      saveFile(activeFile)
    }, s.autoSaveDelay)
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    }
  }, [activeFile?.content, activeFile?.path])

  // Parse outline for active file
  const outlineSymbols = useMemo(() => {
    if (!activeFile) return []
    const ext = getExt(activeFile.path)
    const lang = extToLang(ext)
    return parseOutline(activeFile.content, lang)
  }, [activeFile?.content, activeFile?.path])

  // Open second file in split
  const handleSplitOpen = useCallback(() => {
    if (splitMode === 'none') {
      setSplitMode('horizontal')
      // Auto-pick the next tab
      const others = editingFiles.filter(f => f.path !== activeEditingFilePath)
      if (others.length > 0) {
        setSplitFile(others[0].path)
      }
    } else {
      // Cycle split orientation or close
      if (splitMode === 'horizontal') {
        setSplitMode('vertical')
      } else {
        setSplitMode('none')
        setSplitFile(null)
      }
    }
  }, [splitMode, editingFiles, activeEditingFilePath])

  const splitFileData = useMemo(() => {
    if (!splitFile) return null
    return editingFiles.find(f => f.path === splitFile) || null
  }, [splitFile, editingFiles])

  const handleCloseAll = useCallback(() => {
    // Close all files via store
    for (const f of [...editingFiles]) {
      closeEditingFile(f.path)
    }
    setSplitMode('none')
    setSplitFile(null)
  }, [editingFiles, closeEditingFile])

  // Listen for claude-format-code event (from keybindings)
  useEffect(() => {
    const handler = async () => {
      const file = useStore.getState().editingFiles.find(f => f.path === useStore.getState().activeEditingFilePath)
      if (!file) return
      try {
        const formatted = await formatCode(file.path, file.content)
        useStore.getState().updateEditingFileContent(file.path, formatted)
        useToastStore.getState().addToast({ type: 'success', title: '格式化完成', duration: 2000 })
      } catch (e: any) {
        useToastStore.getState().addToast({ type: 'error', title: '格式化失败', message: e?.message || String(e), duration: 3000 })
      }
    }
    window.addEventListener('claude-format-code', handler)
    return () => window.removeEventListener('claude-format-code', handler)
  }, [])

  if (editingFiles.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-4 text-center">
        <FileCode size={40} style={{ color: 'var(--text-muted)', opacity: 0.3 }} />
        <p className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>
          在文件树中点击文件以编辑
        </p>
        <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>
          或从代码块点击 "在编辑器中打开"
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <TabBar
        files={editingFiles}
        activePath={activeEditingFilePath}
        onSelect={setActiveEditingFile}
        onClose={(path) => {
          closeEditingFile(path)
          if (splitFile === path) {
            setSplitFile(null)
            setSplitMode('none')
          }
        }}
        onCloseAll={handleCloseAll}
        dirtyFiles={dirtySet}
        previewFiles={previewSet}
        onSplitOpen={(path) => {
          setSplitMode('horizontal')
          setSplitFile(path)
        }}
      />

      {/* Toolbar: split + outline buttons */}
      <div
        className="flex items-center justify-between px-2 py-1 shrink-0"
        style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-color)' }}
      >
        <span className="text-[10px] truncate max-w-[300px]" style={{ color: 'var(--text-muted)' }}>
          {activeFile?.path || ''}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={async () => {
              if (!activeFile) return
              try {
                const formatted = await formatCode(activeFile.path, activeFile.content)
                updateEditingFileContent(activeFile.path, formatted)
                addToast({ type: 'success', title: '格式化完成', duration: 2000 })
              } catch (e: any) {
                addToast({ type: 'error', title: '格式化失败', message: e?.message || String(e), duration: 3000 })
              }
            }}
            className="p-1 rounded cursor-pointer hover:opacity-70"
            style={{ color: 'var(--text-muted)' }}
            title="格式化代码 (Ctrl+Shift+F)"
          >
            <Wand2 size={13} />
          </button>
          <button
            onClick={() => setShowOutline(!showOutline)}
            className="p-1 rounded cursor-pointer hover:opacity-70"
            style={{ color: showOutline ? 'var(--accent)' : 'var(--text-muted)' }}
            title="大纲"
          >
            <Layers size={13} />
          </button>
          {activeFile && getExt(activeFile.path) === 'md' && (
            <button
              onClick={() => setPreviewMode(!previewMode)}
              className="p-1 rounded cursor-pointer hover:opacity-70"
              style={{ color: previewMode ? 'var(--accent)' : 'var(--text-muted)' }}
              title="Markdown 预览"
            >
              <Eye size={13} />
            </button>
          )}
          <button
            onClick={handleSplitOpen}
            className="p-1 rounded cursor-pointer hover:opacity-70"
            style={{ color: splitMode !== 'none' ? 'var(--accent)' : 'var(--text-muted)' }}
            title="分屏 (切换横/纵)"
          >
            {splitMode === 'vertical' ? <LayoutPanelLeft size={13} /> : <LayoutPanelTop size={13} />}
          </button>
        </div>
      </div>

      {/* Editor area */}
      <div className="flex-1 flex overflow-hidden">
        {splitMode === 'none' && previewMode && activeFile && getExt(activeFile.path) === 'md' ? (
          /* Single editor + Markdown preview side by side */
          <Group orientation="horizontal" className="flex-1">
            <Panel defaultSize={50} minSize={30}>
              {activeFile && <EditorInstance file={activeFile} isActive={true} />}
            </Panel>
            <Panel defaultSize={50} minSize={30}>
              <div className="h-full overflow-y-auto" style={{ borderLeft: '1px solid var(--border-color)', background: 'var(--bg-primary)' }}>
                <div
                  className="p-4 text-sm leading-relaxed"
                  style={{ color: 'var(--text-primary)' }}
                >
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeRaw]}
                    components={{
                      h1: ({ children }) => (
                        <h1 className="text-xl font-bold mb-3 mt-5 pb-1" style={{ borderBottom: '1px solid var(--border-color)' }}>{children}</h1>
                      ),
                      h2: ({ children }) => (
                        <h2 className="text-lg font-bold mb-2 mt-4 pb-0.5" style={{ borderBottom: '1px solid var(--border-color)' }}>{children}</h2>
                      ),
                      h3: ({ children }) => <h3 className="text-base font-bold mb-1 mt-3">{children}</h3>,
                      h4: ({ children }) => <h4 className="text-sm font-bold mb-1 mt-2">{children}</h4>,
                      p: ({ children }) => <p className="mb-3">{children}</p>,
                      a: ({ href, children }) => (
                        <a href={href} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>{children}</a>
                      ),
                      code: ({ className, children, ...props }) => {
                        const isInline = !className
                        if (isInline) {
                          return <code className="px-1 py-0.5 rounded text-[11px]" style={{ background: 'var(--code-bg)', color: 'var(--accent)' }}>{children}</code>
                        }
                        return (
                          <pre className="p-3 rounded-lg mb-3 overflow-x-auto text-[11px]" style={{ background: 'var(--code-bg)' }}>
                            <code className={className} {...props}>{children}</code>
                          </pre>
                        )
                      },
                      ul: ({ children }) => <ul className="list-disc pl-5 mb-3 space-y-1">{children}</ul>,
                      ol: ({ children }) => <ol className="list-decimal pl-5 mb-3 space-y-1">{children}</ol>,
                      li: ({ children }) => <li>{children}</li>,
                      blockquote: ({ children }) => (
                        <blockquote className="pl-3 italic mb-3" style={{ borderLeft: '3px solid var(--accent)', color: 'var(--text-muted)' }}>{children}</blockquote>
                      ),
                      hr: () => <hr className="my-4" style={{ borderColor: 'var(--border-color)' }} />,
                      table: ({ children }) => (
                        <div className="overflow-x-auto mb-3">
                          <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>{children}</table>
                        </div>
                      ),
                      th: ({ children }) => <th className="px-3 py-1.5 text-left font-semibold" style={{ border: '1px solid var(--border-color)', background: 'var(--bg-elevated)' }}>{children}</th>,
                      td: ({ children }) => <td className="px-3 py-1.5" style={{ border: '1px solid var(--border-color)' }}>{children}</td>,
                      img: ({ src, alt }) => (
                        <img src={src} alt={alt || ''} className="max-w-full rounded-lg mb-3" style={{ maxHeight: 400 }} />
                      ),
                    }}
                  >
                    {activeFile.content}
                  </ReactMarkdown>
                </div>
              </div>
            </Panel>
          </Group>
        ) : splitMode === 'none' && activeFile && isImage(activeFile.path) ? (
          /* Image viewer */
          <div className="flex-1 flex items-center justify-center overflow-auto" style={{ background: 'var(--input-bg)' }}>
            {imageLoading ? (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>加载中...</p>
            ) : imageDataUrl ? (
              <img src={imageDataUrl} alt={getFilename(activeFile.path)} className="max-w-full max-h-full object-contain p-4" />
            ) : (
              <div className="text-center">
                <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>{getFilename(activeFile.path)}</p>
                <p className="text-[10px]" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>无法加载图片预览</p>
              </div>
            )}
          </div>
        ) : splitMode === 'none' ? (
          /* Single editor */
          <div className="flex-1 flex overflow-hidden">
            <div className="flex-1 flex flex-col overflow-hidden">
              {activeFile && <EditorInstance file={activeFile} isActive={true} />}
            </div>
            {showOutline && outlineSymbols.length > 0 && (
              <OutlinePanel
                symbols={outlineSymbols}
                onSelect={(line) => {
                  // Simple scroll: we trigger the editor to go to line
                  // Re-mounting would be heavy, so we dispatch to the editor
                  const el = document.querySelector('[data-editor-instance]')
                  el?.dispatchEvent(new CustomEvent('goto-line', { detail: { line } }))
                }}
                onClose={() => setShowOutline(false)}
              />
            )}
          </div>
        ) : (
          /* Split view */
          <Group orientation={splitMode === 'horizontal' ? 'horizontal' : 'vertical'} className="flex-1">
            <Panel defaultSize={50} minSize={30}>
              {activeFile && <EditorInstance file={activeFile} isActive={true} />}
            </Panel>
            <Panel defaultSize={50} minSize={30}>
              {splitFileData ? (
                <EditorInstance file={splitFileData} isActive={true} />
              ) : (
                <div className="flex items-center justify-center h-full text-xs" style={{ color: 'var(--text-muted)' }}>
                  在标签栏点击文件以在分屏中打开
                </div>
              )}
            </Panel>
          </Group>
        )}
      </div>
    </div>
  )
}
