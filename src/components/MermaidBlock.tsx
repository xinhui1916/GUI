import { useEffect, useState } from 'react'
import mermaid from 'mermaid'
import { logError } from '../lib/logger'

mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  themeVariables: {
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    fontSize: '14px',
  },
})

export default function MermaidBlock({ code }: { code: string }) {
  const [svg, setSvg] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    const id = `mermaid-${Math.random().toString(36).slice(2, 9)}`

    // Detect current theme and update before render
    const theme = document.documentElement.getAttribute('data-theme')
    const isDark: boolean = theme !== 'light' && theme !== 'sepia'
    try { (mermaid as any).updateThemeConfig({ theme: isDark ? 'dark' : 'default' }) } catch (err) { logError('MermaidBlock', 'mermaid theme update failed', err) }

    mermaid.render(id, code)
      .then(({ svg: svgStr }: { svg: string }) => {
        if (!cancelled) setSvg(svgStr)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
        }
      })

    return () => { cancelled = true }
  }, [code])

  if (error) {
    return (
      <details className="my-2 rounded overflow-hidden" style={{ background: 'var(--code-bg)', border: '1px solid var(--border-color)' }}>
        <summary className="text-xs px-3 py-1.5 cursor-pointer font-medium" style={{ color: '#ef4444' }}>
          Mermaid 渲染失败
        </summary>
        <pre className="text-xs p-3 m-0 whitespace-pre-wrap" style={{ color: 'var(--text-muted)' }}>{error}</pre>
        <pre className="text-xs p-3 m-0 whitespace-pre-wrap" style={{ color: 'var(--text-primary)' }}>{code}</pre>
      </details>
    )
  }

  return (
    <div
      className="my-3 flex justify-center overflow-x-auto rounded"
      style={{ background: 'var(--chat-bg)', padding: '12px 8px' }}
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    >
      {!svg && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>渲染中...</span>}
    </div>
  )
}
