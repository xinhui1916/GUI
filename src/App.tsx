import { useEffect } from 'react'
import { useStore } from './stores/useStore'
import { onClaudeChunk, onClaudeDone, onClaudeError } from './lib/ipc'
import Titlebar from './components/Titlebar'
import Sidebar from './components/Sidebar'
import ChatPanel from './components/ChatPanel'
import RightPanel from './components/RightPanel'

function App() {
  useEffect(() => {
    const saved = localStorage.getItem('claude-desktop-theme')
    if (saved) {
      document.documentElement.setAttribute('data-theme', saved)
      useStore.getState().setTheme(saved as any)
    }
  }, [])

  // Tauri IPC event listeners
  useEffect(() => {
    let unlistenChunk: (() => void) | undefined
    let unlistenDone: (() => void) | undefined
    let unlistenError: (() => void) | undefined

    async function setup() {
      unlistenChunk = await onClaudeChunk((text) => {
        useStore.getState().appendStreamChunk(text)
      })
      unlistenDone = await onClaudeDone(() => {
        useStore.getState().finalizeStream()
      })
      unlistenError = await onClaudeError((error) => {
        console.error('Claude error:', error)
        useStore.getState().finalizeStream()
      })
    }
    setup()

    return () => {
      unlistenChunk?.()
      unlistenDone?.()
      unlistenError?.()
    }
  }, [])

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
      <Titlebar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <ChatPanel />
        <RightPanel />
      </div>
    </div>
  )
}

export default App
