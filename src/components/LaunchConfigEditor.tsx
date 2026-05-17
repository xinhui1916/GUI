import { useState } from 'react'
import { Plus, Trash2, Play } from 'lucide-react'
import { useDebugStore, type LaunchConfig } from '../stores/debugStore'
import { useToastStore } from '../stores/toastStore'

const DEFAULT_CONFIGS: LaunchConfig[] = [
  { name: 'Python: 当前文件', type: 'python', request: 'launch', program: '${file}', stopOnEntry: false },
  { name: 'Node.js: 当前文件', type: 'node', request: 'launch', program: '${file}', runtimeExecutable: 'node' },
  { name: 'Node.js: 调试附加', type: 'node', request: 'attach', address: 'localhost', port: 9229 },
  { name: 'C++ (LLDB): 调试', type: 'cppdbg', request: 'launch', program: '${workspaceFolder}/target/debug/app' },
]

export default function LaunchConfigEditor() {
  const launchConfigs = useDebugStore((s) => s.launchConfigs)
  const addLaunchConfig = useDebugStore((s) => s.addLaunchConfig)
  const removeLaunchConfig = useDebugStore((s) => s.removeLaunchConfig)
  const addToast = useToastStore((s) => s.addToast)
  const [showAdd, setShowAdd] = useState(false)
  const [newConfig, setNewConfig] = useState<Partial<LaunchConfig>>({})

  const allConfigs = launchConfigs.length > 0 ? launchConfigs : DEFAULT_CONFIGS

  const handleAdd = () => {
    if (!newConfig.name) return
    addLaunchConfig({
      name: newConfig.name,
      type: newConfig.type || 'python',
      request: newConfig.request || 'launch',
      program: newConfig.program,
      args: newConfig.args,
      cwd: newConfig.cwd,
      runtimeExecutable: newConfig.runtimeExecutable,
      stopOnEntry: newConfig.stopOnEntry,
    })
    setNewConfig({})
    setShowAdd(false)
    addToast({ type: 'success', title: '配置已添加', duration: 2000 })
  }

  const launchDebug = (config: LaunchConfig) => {
    // Store the selected config and signal to start debugging
    window.dispatchEvent(new CustomEvent('debug-start', { detail: config }))
    addToast({ type: 'info', title: `调试启动: ${config.name}`, duration: 2000 })
  }

  return (
    <div className="flex flex-col h-full text-xs">
      <div className="flex items-center justify-between px-2 py-1.5 font-semibold shrink-0" style={{ color: 'var(--panel-header)', borderBottom: '1px solid var(--border-color)' }}>
        <span>启动配置</span>
        <button onClick={() => setShowAdd(!showAdd)} className="p-0.5 cursor-pointer hover:opacity-70" style={{ color: 'var(--accent)' }}>
          <Plus size={12} />
        </button>
      </div>

      {showAdd && (
        <div className="p-2 space-y-1" style={{ borderBottom: '1px solid var(--border-color)', background: 'var(--bg-elevated)' }}>
          <input placeholder="名称" value={newConfig.name || ''} onChange={(e) => setNewConfig({ ...newConfig, name: e.target.value })}
            className="w-full px-1.5 py-0.5 text-[10px] rounded outline-none" style={{ background: 'var(--input-bg)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }} />
          <select value={newConfig.type || 'python'} onChange={(e) => setNewConfig({ ...newConfig, type: e.target.value })}
            className="w-full px-1.5 py-0.5 text-[10px] rounded outline-none" style={{ background: 'var(--input-bg)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}>
            <option value="python">Python</option>
            <option value="node">Node.js</option>
            <option value="cppdbg">C++ (LLDB)</option>
          </select>
          <input placeholder="program" value={newConfig.program || ''} onChange={(e) => setNewConfig({ ...newConfig, program: e.target.value })}
            className="w-full px-1.5 py-0.5 text-[10px] rounded outline-none" style={{ background: 'var(--input-bg)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }} />
          <button onClick={handleAdd} className="w-full py-0.5 text-[10px] rounded cursor-pointer" style={{ background: 'var(--accent)', color: '#fff' }}>
            添加
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {allConfigs.map((config) => (
          <div key={config.name} className="flex items-center gap-1.5 px-2 py-1.5 border-b cursor-pointer hover:opacity-80"
            style={{ borderColor: 'var(--border-color)' }}
            onClick={() => launchDebug(config)}
          >
            <Play size={11} style={{ color: 'var(--accent)' }} />
            <div className="flex-1 min-w-0">
              <div className="truncate" style={{ color: 'var(--text-secondary)' }}>{config.name}</div>
              <div className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
                {config.type} · {config.request}
              </div>
            </div>
            <button onClick={(e) => { e.stopPropagation(); removeLaunchConfig(config.name) }}
              className="p-0.5 cursor-pointer hover:opacity-70 opacity-0 hover:opacity-100"
              style={{ color: 'var(--text-muted)' }}>
              <Trash2 size={10} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
