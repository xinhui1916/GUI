import type { Message } from '../stores/useStore'

function renderContent(content: string) {
  const parts = content.split(/(```[\s\S]*?```)/)
  return parts.map((part, i) => {
    if (part.startsWith('```') && part.endsWith('```')) {
      const inner = part.slice(3, -3)
      const newlineIdx = inner.indexOf('\n')
      const lang = newlineIdx > -1 ? inner.slice(0, newlineIdx).trim() : ''
      const body = newlineIdx > -1 ? inner.slice(newlineIdx + 1) : lang || ''
      // If the "lang" was actually the body (no newline after ```lang)
      const code = (lang && newlineIdx > -1) ? body : inner
      const displayLang = (lang && newlineIdx > -1) ? lang : ''
      return (
        <div key={i} className="my-2">
          {displayLang && (
            <div
              className="text-[10px] px-3 pt-1.5 pb-0.5 font-medium rounded-t-md"
              style={{ background: 'var(--code-bg)', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-color)' }}
            >
              {displayLang}
            </div>
          )}
          <pre className="my-0 rounded-none" style={displayLang ? { borderTopLeftRadius: 0, borderTopRightRadius: 0 } : undefined}>
            <code>{code}</code>
          </pre>
        </div>
      )
    }
    // Inline code
    const lines = part.split('\n')
    return (
      <div key={i}>
        {lines.map((line, j) => (
          <p key={j} className="text-sm leading-relaxed mb-1 last:mb-0" style={{ color: 'var(--text-primary)' }}>
            {line.split(/(`[^`]+`)/).map((seg, k) => {
              if (seg.startsWith('`') && seg.endsWith('`')) {
                return (
                  <code
                    key={k}
                    className="text-xs px-1 py-0.5 rounded"
                    style={{ background: 'var(--code-bg)', color: 'var(--accent)' }}
                  >
                    {seg.slice(1, -1)}
                  </code>
                )
              }
              return seg
            })}
          </p>
        ))}
      </div>
    )
  })
}

export default function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user'

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`} style={{ maxWidth: '85%', alignSelf: isUser ? 'flex-end' : 'flex-start' }}>
      {/* Avatar */}
      <div
        className="w-7 h-7 rounded-md flex items-center justify-center text-sm font-bold shrink-0"
        style={{
          background: isUser ? 'var(--accent)' : 'var(--titlebar-bg)',
          color: isUser ? '#fff' : 'var(--badge-text)',
          border: isUser ? 'none' : '1px solid var(--border-light)',
        }}
      >
        {isUser ? 'U' : 'C'}
      </div>

      {/* Bubble */}
      <div
        className="rounded-lg px-3.5 py-2.5"
        style={{
          background: isUser ? 'var(--bubble-user-bg)' : 'var(--bubble-assistant-bg)',
          border: `1px solid ${isUser ? 'var(--bubble-user-border)' : 'var(--bubble-assistant-border)'}`,
        }}
      >
        {renderContent(message.content)}

        {/* File tags */}
        {message.files && message.files.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {message.files.map((f) => (
              <span
                key={f}
                className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded"
                style={{
                  background: 'var(--badge-bg)',
                  color: 'var(--badge-text)',
                  border: '1px solid var(--badge-border)',
                }}
              >
                <span className="opacity-70">📄</span>
                {f}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
