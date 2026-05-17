import { useState, useEffect, useCallback } from 'react'
import { Plus, X, FileCode, Trash2 } from 'lucide-react'
import { readSnippets, writeSnippets } from '../lib/ipc'
import { useToastStore } from '../stores/toastStore'

interface Snippet {
  prefix: string
  body: string[]
  description: string
}

export default function SnippetsPanel() {
  const [snippets, setSnippets] = useState<Snippet[]>([])
  const [loading, setLoading] = useState(true)
  const [showEditor, setShowEditor] = useState(false)
  const [editIdx, setEditIdx] = useState<number | null>(null)
  const [prefix, setPrefix] = useState('')
  const [body, setBody] = useState('')
  const [description, setDescription] = useState('')
  const addToast = useToastStore((s) => s.addToast)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const raw = await readSnippets()
      setSnippets(JSON.parse(raw))
    } catch (e: any) {
      addToast({ type: 'error', title: '读取 snippets 失败', message: e?.message, duration: 3000 })
    }
    setLoading(false)
  }, [addToast])

  useEffect(() => { load() }, [load])

  const save = useCallback(async (updated: Snippet[]) => {
    try {
      await writeSnippets(JSON.stringify(updated, null, 2))
      setSnippets(updated)
      addToast({ type: 'success', title: 'Snippets 已保存', duration: 2000 })
    } catch (e: any) {
      addToast({ type: 'error', title: '保存失败', message: e?.message, duration: 3000 })
    }
  }, [addToast])

  const openNew = () => {
    setEditIdx(null)
    setPrefix('')
    setBody('')
    setDescription('')
    setShowEditor(true)
  }

  const openEdit = (idx: number) => {
    const s = snippets[idx]
    setEditIdx(idx)
    setPrefix(s.prefix)
    setBody(s.body.join('\n'))
    setDescription(s.description)
    setShowEditor(true)
  }

  const handleSave = () => {
    if (!prefix.trim() || !body.trim()) return
    const snippet: Snippet = {
      prefix: prefix.trim(),
      body: body.split('\n').map(l => l.trimEnd()),
      description: description.trim(),
    }
    const updated = [...snippets]
    if (editIdx !== null) {
      updated[editIdx] = snippet
    } else {
      updated.push(snippet)
    }
    save(updated)
    setShowEditor(false)
    setEditIdx(null)
  }

  const handleDelete = (idx: number) => {
    const updated = snippets.filter((_, i) => i !== idx)
    save(updated)
  }

  if (loading) {
    return <p className="text-xs text-center py-4" style={{ color: 'var(--text-muted)' }}>加载中...</p>
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
          {snippets.length} 个 snippets
        </span>
        <button onClick={openNew}
          className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded cursor-pointer"
          style={{ background: 'var(--accent)', color: '#fff', border: 'none' }}>
          <Plus size={10} /> 新建
        </button>
      </div>

      {/* Editor */}
      {showEditor && (
        <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border-color)' }}>
          <div className="flex items-center justify-between px-2 py-1" style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-color)' }}>
            <span className="text-[10px] font-semibold" style={{ color: 'var(--panel-header)' }}>
              {editIdx !== null ? '编辑 Snippet' : '新建 Snippet'}
            </span>
            <button onClick={() => setShowEditor(false)} className="p-0.5 rounded cursor-pointer hover:opacity-70" style={{ color: 'var(--text-muted)' }}><X size={11} /></button>
          </div>
          <div className="p-2 space-y-2">
            <input value={prefix} onChange={(e) => setPrefix(e.target.value)}
              placeholder="触发前缀 (如: for)"
              className="w-full px-2 py-1 text-[11px] rounded outline-none"
              style={{ background: 'var(--input-bg)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }} />
            <input value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="描述 (可选)"
              className="w-full px-2 py-1 text-[11px] rounded outline-none"
              style={{ background: 'var(--input-bg)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }} />
            <textarea value={body} onChange={(e) => setBody(e.target.value)}
              placeholder="代码内容 (多行，支持 $1, $2 作为光标位置)"
              rows={4}
              className="w-full px-2 py-1 text-[11px] rounded outline-none resize-none font-mono"
              style={{ background: 'var(--input-bg)', border: '1px solid var(--border-color)', color: 'var(--text-primary)' }} />
            <button onClick={handleSave} disabled={!prefix.trim() || !body.trim()}
              className="w-full py-1 text-[11px] font-medium rounded cursor-pointer disabled:opacity-40"
              style={{ background: 'var(--accent)', color: '#fff', border: 'none' }}>
              保存
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {snippets.length === 0 && !showEditor && (
        <p className="text-[10px] text-center py-4" style={{ color: 'var(--text-muted)' }}>
          无 snippets，点击上方按钮创建
        </p>
      )}
      {snippets.map((s, i) => (
        <div key={i} className="flex items-start gap-1.5 px-2 py-1.5 rounded text-xs group"
          style={{ color: 'var(--text-secondary)', background: 'var(--bg-elevated)', border: '1px solid var(--border-color)' }}>
          <FileCode size={12} className="mt-0.5 shrink-0" style={{ color: 'var(--accent)' }} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-medium text-[11px]" style={{ color: 'var(--text-primary)' }}>{s.prefix}</span>
              {s.description && (
                <span className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>— {s.description}</span>
              )}
            </div>
            <pre className="text-[10px] mt-0.5 truncate font-mono" style={{ color: 'var(--text-muted)' }}>
              {s.body.join(' | ')}
            </pre>
          </div>
          <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100">
            <button onClick={() => openEdit(i)}
              className="p-0.5 rounded cursor-pointer hover:opacity-70" style={{ color: 'var(--text-muted)' }} title="编辑">
              <FileCode size={10} />
            </button>
            <button onClick={() => handleDelete(i)}
              className="p-0.5 rounded cursor-pointer hover:opacity-70" style={{ color: 'var(--text-muted)' }} title="删除">
              <Trash2 size={10} />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
