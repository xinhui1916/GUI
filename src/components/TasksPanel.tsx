import { useState, useEffect } from 'react'
import { Play, RefreshCw, AlertCircle, CheckCircle, Terminal } from 'lucide-react'
import { useStore } from '../stores/useStore'
import { readFile, runTask } from '../lib/ipc'
import { useToastStore } from '../stores/toastStore'
import { logError } from '../lib/logger'

interface TaskConfig {
  label?: string
  type?: string
  command?: string
  args?: string[] | string
  options?: { cwd?: string }
  group?: string
  dependsOn?: string[]
  presentation?: { reveal?: string }
}

interface TasksJson {
  version?: string
  tasks?: TaskConfig[]
}

export default function TasksPanel() {
  const workspacePath = useStore((s) => s.workspacePath)
  const addToast = useToastStore((s) => s.addToast)
  const [tasks, setTasks] = useState<TaskConfig[]>([])
  const [running, setRunning] = useState<string | null>(null)
  const [output, setOutput] = useState<{ task: string; text: string } | null>(null)

  useEffect(() => {
    if (!workspacePath) return
    loadTasks()
  }, [workspacePath])

  const loadTasks = async () => {
    if (!workspacePath) return
    try {
      const raw = await readFile(`${workspacePath}\\.vscode\\tasks.json`)
      const parsed: TasksJson = JSON.parse(raw)
      setTasks(parsed.tasks || [])
    } catch (err) {
      logError('TasksPanel', 'load tasks failed', err)
      setTasks([])
    }
  }

  const run = async (task: TaskConfig) => {
    if (!workspacePath) return
    const cmd = task.command || ''
    setRunning(task.label || cmd)
    setOutput(null)
    try {
      const result = await runTask(workspacePath, cmd)
      setOutput({ task: task.label || cmd, text: result })
      addToast({ type: 'success', title: '任务完成', message: task.label || cmd, duration: 3000 })
    } catch (e: any) {
      setOutput({ task: task.label || cmd, text: String(e) })
      addToast({ type: 'error', title: '任务失败', message: String(e), duration: 4000 })
    } finally {
      setRunning(null)
    }
  }

  const taskIcon = (task: TaskConfig) => {
    if (task.group === 'build' || task.group === 'test') {
      return <AlertCircle size={11} style={{ color: 'var(--accent)' }} />
    }
    return <Terminal size={11} style={{ color: 'var(--text-muted)' }} />
  }

  return (
    <div className="flex flex-col h-full text-xs">
      <div className="flex items-center justify-between px-2 py-1.5 font-semibold shrink-0" style={{ color: 'var(--panel-header)', borderBottom: '1px solid var(--border-color)' }}>
        <span>任务</span>
        {workspacePath && (
          <button onClick={loadTasks} className="p-0.5 cursor-pointer hover:opacity-70" style={{ color: 'var(--text-muted)' }}>
            <RefreshCw size={10} />
          </button>
        )}
      </div>
      {!workspacePath ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>请先设置工作区</p>
        </div>
      ) : tasks.length === 0 ? (
        <div className="flex-1 overflow-y-auto">
          <p className="px-3 py-4 text-center" style={{ color: 'var(--text-muted)' }}>
            未在 .vscode/tasks.json 中找到任务
          </p>
          <p className="px-3 text-[10px] text-center" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>
            在工作区创建 .vscode/tasks.json 文件来定义任务
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {tasks.map((task, i) => (
            <div key={i} className="flex items-center gap-2 px-2 py-1.5" style={{ borderBottom: '1px solid var(--border-color)' }}>
              {taskIcon(task)}
              <div className="flex-1 min-w-0">
                <div className="truncate" style={{ color: 'var(--text-secondary)' }}>{task.label || task.command}</div>
                {task.command && (
                  <div className="text-[9px] font-mono" style={{ color: 'var(--text-muted)' }}>{task.command}</div>
                )}
              </div>
              <button
                onClick={() => run(task)}
                disabled={running !== null}
                className="p-1 rounded cursor-pointer hover:opacity-70 disabled:opacity-30"
                style={{ color: 'var(--accent)' }}
                title="运行任务"
              >
                {running === (task.label || task.command) ? (
                  <span className="animate-spin inline-block"><RefreshCw size={11} /></span>
                ) : (
                  <Play size={11} />
                )}
              </button>
            </div>
          ))}
        </div>
      )}
      {output && (
        <div className="shrink-0 max-h-[120px] overflow-y-auto p-2 font-mono text-[10px] leading-relaxed" style={{ background: 'var(--input-bg)', borderTop: '1px solid var(--border-color)' }}>
          <div className="flex items-center gap-1 mb-1">
            <CheckCircle size={10} style={{ color: 'var(--accent)' }} />
            <span style={{ color: 'var(--text-secondary)' }}>{output.task}</span>
          </div>
          <pre style={{ color: 'var(--text-primary)', whiteSpace: 'pre-wrap', margin: 0 }}>{output.text}</pre>
        </div>
      )}
    </div>
  )
}
