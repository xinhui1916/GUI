import { useMemo } from 'react'
import { GitBranch, Wifi, WifiOff, Terminal, Database, Wrench, Type, Indent, Pilcrow } from 'lucide-react'
import { useStore } from '../stores/useStore'
import { useUiStore } from '../stores/uiStore'

function indentName(size: number): string {
  return `空格: ${size}`
}

export default function StatusBar() {
  const activeSessionId = useStore((s) => s.activeSessionId)
  const sessions = useStore((s) => s.sessions)
  const model = useStore((s) => s.model)
  const backendMode = useStore((s) => s.backendMode)
  const claudeVersion = useStore((s) => s.claudeVersion)
  const toolsEnabled = useStore((s) => s.toolsEnabled)
  const isStreaming = useStore((s) => s.isStreaming)
  const workspacePath = useStore((s) => s.workspacePath)
  const editingFiles = useStore((s) => s.editingFiles)
  const activeEditingFilePath = useStore((s) => s.activeEditingFilePath)
  const openSettings = useUiStore((s) => s.openSettings)

  const session = useMemo(() => sessions.find(s => s.id === activeSessionId), [sessions, activeSessionId])

  const branch = workspacePath ? 'main' : null

  const usage = session?.usage
  const tokenInfo = usage ? `${(usage.input_tokens / 1000).toFixed(0)}k/${(usage.output_tokens / 1000).toFixed(0)}k` : null

  // Editor status from active file
  const editorStatus = useMemo(() => {
    const activeFile = editingFiles.find(f => f.path === activeEditingFilePath)
    if (!activeFile) return null
    const ext = activeFile.path.includes('.') ? activeFile.path.split('.').pop() || '' : ''
    const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico'])
    const langName: Record<string, string> = {
      ts: 'TypeScript', tsx: 'TypeScript JSX', js: 'JavaScript', jsx: 'JavaScript JSX',
      rs: 'Rust', py: 'Python', go: 'Go', md: 'Markdown', json: 'JSON',
      html: 'HTML', css: 'CSS', c: 'C', cpp: 'C++', yaml: 'YAML',
      sh: 'Shell', sql: 'SQL', vue: 'Vue', svelte: 'Svelte',
    }
    return {
      lang: langName[ext] || ext.toUpperCase() || '纯文本',
      isImage: IMAGE_EXTS.has(ext),
      lineEnding: activeFile.content.includes('\r\n') ? 'CRLF' : 'LF',
      size: activeFile.content.length,
    }
  }, [editingFiles, activeEditingFilePath])

  return (
    <div
      className="flex items-center justify-between h-[22px] px-3 text-[11px] select-none shrink-0"
      style={{
        background: 'var(--accent)',
        color: '#fff',
        borderTop: '1px solid rgba(255,255,255,0.1)',
      }}
    >
      {/* Left side */}
      <div className="flex items-center gap-3">
        {branch && (
          <span className="flex items-center gap-1 opacity-80 hover:opacity-100 cursor-pointer transition-opacity">
            <GitBranch size={11} />
            <span>{branch}</span>
          </span>
        )}
        {tokenInfo && (
          <span className="opacity-70" title="输入/输出 tokens">
            {tokenInfo}
          </span>
        )}
        {editorStatus && !editorStatus.isImage && (
          <>
            <span className="flex items-center gap-1 opacity-70" title="语言模式">
              <Type size={11} />
              <span>{editorStatus.lang}</span>
            </span>
            <span className="flex items-center gap-1 opacity-70" title="缩进">
              <Indent size={11} />
              <span>{indentName(useStore.getState().tabSize)}</span>
            </span>
            <span className="flex items-center gap-1 opacity-70" title="行尾序列">
              <Pilcrow size={11} />
              <span>{editorStatus.lineEnding}</span>
            </span>
          </>
        )}
      </div>

      {/* Right side */}
      <div className="flex items-center gap-3">
        <span
          className="flex items-center gap-1 opacity-80 hover:opacity-100 cursor-pointer transition-opacity"
          onClick={openSettings}
          title={`后端模式: ${backendMode === 'cli' ? 'CLI' : 'API'}`}
        >
          {backendMode === 'cli' ? <Terminal size={11} /> : <Database size={11} />}
          <span>{backendMode === 'cli' ? 'CLI' : 'API'}</span>
          {backendMode === 'cli' && claudeVersion && (
            <span className="opacity-60 text-[10px]" title="Claude CLI 版本">{claudeVersion}</span>
          )}
        </span>

        {toolsEnabled && (
          <span
            className="flex items-center gap-1 opacity-80"
            title="工具调用已启用 (文件读写/终端命令)"
          >
            <Wrench size={11} />
          </span>
        )}

        <span
          className="flex items-center gap-1 opacity-80 hover:opacity-100 cursor-pointer transition-opacity"
          title={`模型: ${model}`}
        >
          {isStreaming ? <Wifi size={11} className="animate-pulse" /> : <WifiOff size={11} />}
          <span className="max-w-[120px] truncate">{model}</span>
        </span>

        {workspacePath && (
          <span
            className="opacity-60 hover:opacity-100 cursor-pointer transition-opacity truncate max-w-[200px]"
            title={workspacePath}
            onClick={() => useUiStore.getState().setGlobalSearchOpen(true)}
          >
            {workspacePath.split(/[/\\]/).pop()}
          </span>
        )}
      </div>
    </div>
  )
}
