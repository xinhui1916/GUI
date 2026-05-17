import { useMemo } from 'react'
import { diffLines, type Change } from 'diff'

interface DiffViewerProps {
  oldText: string
  newText: string
  fileName?: string
  language?: string
}

export default function DiffViewer({ oldText, newText, fileName, language }: DiffViewerProps) {
  const changes: Change[] = useMemo(
    () => diffLines(oldText, newText),
    [oldText, newText],
  )

  // Track line numbers
  let oldLine = 0
  let newLine = 0

  return (
    <div
      className="rounded-lg overflow-hidden text-xs font-mono my-2"
      style={{
        border: '1px solid var(--border-color)',
        background: 'var(--code-bg)',
      }}
    >
      {/* Header */}
      {fileName && (
        <div
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium"
          style={{
            background: 'var(--bg-elevated)',
            borderBottom: '1px solid var(--border-color)',
            color: 'var(--text-secondary)',
          }}
        >
          <span className="shrink-0">📄</span>
          <span className="truncate">{fileName}</span>
          {language && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded ml-auto"
              style={{
                background: 'var(--badge-bg)',
                color: 'var(--badge-text)',
                border: '1px solid var(--badge-border)',
              }}
            >
              {language}
            </span>
          )}
        </div>
      )}

      {/* Diff lines */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <tbody>
            {changes.map((change, idx) => {
              const lines = change.value.replace(/\n$/, '').split('\n')
              return lines.map((line, lineIdx) => {
                const isAdded = change.added
                const isRemoved = change.removed

                if (!isAdded && !isRemoved) {
                  oldLine++
                  newLine++
                } else if (isAdded) {
                  newLine++
                } else if (isRemoved) {
                  oldLine++
                }

                const bgColor = isAdded
                  ? 'rgba(34, 197, 94, 0.12)'
                  : isRemoved
                  ? 'rgba(239, 68, 68, 0.12)'
                  : 'transparent'

                const prefix = isAdded ? '+' : isRemoved ? '-' : ' '
                const prefixColor = isAdded
                  ? 'rgb(34, 197, 94)'
                  : isRemoved
                  ? 'rgb(239, 68, 68)'
                  : 'var(--text-muted)'

                return (
                  <tr
                    key={`${idx}-${lineIdx}`}
                    style={{ background: bgColor }}
                  >
                    {/* Old line number */}
                    <td
                      className="text-right select-none w-10 px-2 py-0 align-top"
                      style={{
                        color: 'var(--text-muted)',
                        borderRight: '1px solid var(--border-color)',
                        opacity: 0.5,
                        fontSize: '11px',
                        lineHeight: '1.6',
                      }}
                    >
                      {!isAdded ? oldLine : ''}
                    </td>
                    {/* New line number */}
                    <td
                      className="text-right select-none w-10 px-2 py-0 align-top"
                      style={{
                        color: 'var(--text-muted)',
                        borderRight: '1px solid var(--border-color)',
                        opacity: 0.5,
                        fontSize: '11px',
                        lineHeight: '1.6',
                      }}
                    >
                      {!isRemoved ? newLine : ''}
                    </td>
                    {/* Prefix */}
                    <td
                      className="select-none w-4 px-1 py-0 align-top"
                      style={{
                        color: prefixColor,
                        lineHeight: '1.6',
                      }}
                    >
                      {prefix}
                    </td>
                    {/* Content */}
                    <td
                      className="py-0 pr-3 align-top whitespace-pre-wrap break-all"
                      style={{
                        color: 'var(--text-primary)',
                        lineHeight: '1.6',
                        opacity: isAdded || isRemoved ? 1 : 0.7,
                      }}
                    >
                      {line}
                    </td>
                  </tr>
                )
              })
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
