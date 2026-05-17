import { ChevronRight, ChevronDown } from 'lucide-react'
import { useDebugStore, type Variable } from '../stores/debugStore'
import { dapSendRequest } from '../lib/ipc'
import { logError } from '../lib/logger'

export default function DebugVariables() {
  const sessionId = useDebugStore((s) => s.sessionId)
  const variables = useDebugStore((s) => s.variables)
  const setVariables = useDebugStore((s) => s.setVariables)
  const expandedVariables = useDebugStore((s) => s.expandedVariables)
  const toggleVariable = useDebugStore((s) => s.toggleVariable)

  if (!sessionId) return null

  const loadChildren = async (varRef: number, path: string) => {
    if (varRef === 0) return
    try {
      const result = await dapSendRequest(sessionId, 'variables', { variablesReference: varRef })
      if (result?.variables) {
        setVariables(path, result.variables)
      }
    } catch (err) { logError('DebugVariables', 'load variables failed', err) }
  }

  const handleToggle = (name: string, v: Variable, depth: number) => {
    const key = `${depth}:${name}`
    if (!expandedVariables.has(key) && v.variablesReference > 0) {
      loadChildren(v.variablesReference, key)
    }
    toggleVariable(key)
  }

  return (
    <div className="flex flex-col h-full text-xs">
      <div className="flex items-center justify-between px-2 py-1.5 font-semibold shrink-0" style={{ color: 'var(--panel-header)', borderBottom: '1px solid var(--border-color)' }}>
        <span>变量</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {Object.keys(variables).length === 0 ? (
          <p className="px-2 py-3 text-center" style={{ color: 'var(--text-muted)' }}>无变量</p>
        ) : (
          Object.entries(variables).map(([key, vars]) => (
            <div key={key}>
              {vars.map((v) => (
                <VarRow
                  key={`${key}:${v.name}`}
                  v={v}
                  depth={0}
                  expanded={expandedVariables}
                  onToggle={handleToggle}
                  childrenVars={variables}
                />
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function VarRow({ v, depth, expanded, onToggle, childrenVars }: {
  v: Variable; depth: number; expanded: Set<string>
  onToggle: (name: string, v: Variable, depth: number) => void
  childrenVars: Record<string, Variable[]>
}) {
  const key = `${depth}:${v.name}`
  const hasChildren = v.variablesReference > 0
  const isExpanded = expanded.has(key)
  const children = childrenVars[key]

  return (
    <div>
      <div
        className="flex items-center gap-1 px-2 py-0.5 hover:opacity-80 cursor-pointer"
        style={{ paddingLeft: 8 + depth * 12 }}
        onClick={() => hasChildren && onToggle(v.name, v, depth)}
      >
        {hasChildren ? (
          <span style={{ color: 'var(--text-muted)' }}>{isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}</span>
        ) : (
          <span className="w-[10px]" />
        )}
        <span className="truncate" style={{ color: 'var(--text-secondary)' }}>{v.name}</span>
        {v.type && <span className="text-[10px] italic" style={{ color: 'var(--text-muted)' }}>{v.type}</span>}
        <span className="truncate ml-auto text-right max-w-[150px]" style={{ color: 'var(--text-primary)' }}>{v.value}</span>
      </div>
      {isExpanded && children && children.map((child) => (
        <VarRow
          key={`${key}:${child.name}`}
          v={child}
          depth={depth + 1}
          expanded={expanded}
          onToggle={onToggle}
          childrenVars={childrenVars}
        />
      ))}
    </div>
  )
}
