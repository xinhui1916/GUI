import { useState, useEffect, useCallback } from 'react'
import { Play, Loader2 } from 'lucide-react'
import { useStore } from '../stores/useStore'
import { useToastStore } from '../stores/toastStore'
import { runTask } from '../lib/ipc'
import { logError } from '../lib/logger'

interface ScriptEntry {
  name: string
  command: string
}

export default function NpmScriptsPanel() {
  const workspacePath = useStore((s) => s.workspacePath)
  const addToast = useToastStore((s) => s.addToast)
  const [scripts, setScripts] = useState<ScriptEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [running, setRunning] = useState<string | null>(null)
  const [output, setOutput] = useState<{ script: string; text: string } | null>(null)

  const loadScripts = useCallback(async () => {
    if (!workspacePath) return
    setLoading(true)
    try {
      const { readFile } = await import('../lib/ipc')
      const raw = await readFile(workspacePath + '/package.json')
      const pkg = JSON.parse(raw)
      const scriptMap = pkg.scripts
      if (scriptMap && typeof scriptMap === 'object') {
        const entries: ScriptEntry[] = []
        for (const [name, cmd] of Object.entries(scriptMap)) {
          entries.push({ name, command: String(cmd) })
        }
        setScripts(entries)
      } else {
        setScripts([])
      }
    } catch (err) {
      logError('NpmScriptsPanel', 'load npm scripts failed', err)
      setScripts([])
    }
    setLoading(false)
  }, [workspacePath])

  useEffect(() => {
    if (workspacePath) loadScripts()
  }, [workspacePath, loadScripts])

  const handleRun = async (name: string) => {
    if (!workspacePath) return
    setRunning(name)
    setOutput(null)
    try {
      const result = await runTask(workspacePath, `npm run ${name}`)
      setOutput({ script: name, text: result })
      addToast({ type: 'success', title: `${name} 已完成`, duration: 2000 })
    } catch (e: any) {
      setOutput({ script: name, text: e?.message || String(e) })
      addToast({ type: 'error', title: `${name} 失败`, message: e?.message, duration: 3000 })
    }
    setRunning(null)
  }

  if (!workspacePath) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>请先设置工作区</p>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={16} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
        </div>
      ) : scripts.length === 0 ? (
        <p className="text-xs text-center py-8" style={{ color: 'var(--text-muted)' }}>未找到 npm 脚本</p>
      ) : (
        scripts.map((s) => (
          <div key={s.name}
            className="flex items-center gap-2 px-2 py-1.5 rounded text-xs group cursor-pointer hover:opacity-80"
            style={{ color: 'var(--text-secondary)' }}
            onClick={() => handleRun(s.name)}
          >
            <button
              disabled={running === s.name}
              className="p-0.5 rounded cursor-pointer disabled:opacity-40 shrink-0"
              style={{ color: 'var(--accent)' }}
            >
              {running === s.name ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />}
            </button>
            <span className="font-medium shrink-0" style={{ color: 'var(--text-primary)' }}>{s.name}</span>
            <span className="truncate text-[10px]" style={{ color: 'var(--text-muted)' }}>{s.command}</span>
          </div>
        ))
      )}

      {output && (
        <div className="mt-2 rounded-lg overflow-hidden" style={{ border: '1px solid var(--border-color)' }}>
          <div className="flex items-center justify-between px-2 py-0.5 text-[10px]"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
            <span>输出: {output.script}</span>
            <button onClick={() => setOutput(null)} className="p-0.5 rounded cursor-pointer hover:opacity-70">✕</button>
          </div>
          <pre className="text-[10px] p-2 max-h-[150px] overflow-y-auto font-mono leading-relaxed"
            style={{ background: 'var(--code-bg)', color: 'var(--text-primary)' }}>{output.text}</pre>
        </div>
      )}
    </div>
  )
}
