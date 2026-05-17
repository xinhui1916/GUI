import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary'
import { useStore } from './stores/useStore'

// Configure Monaco Editor workers for IntelliSense (completion, hover, diagnostics)
import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'

// Use Vite's ?worker imports for Monaco worker files
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker.js?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker.js?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker.js?worker'
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker.js?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker.js?worker'

self.MonacoEnvironment = {
  getWorker(_, label) {
    if (label === 'typescript' || label === 'javascript') {
      return new tsWorker()
    }
    if (label === 'json') {
      return new jsonWorker()
    }
    if (label === 'css' || label === 'scss' || label === 'less') {
      return new cssWorker()
    }
    if (label === 'html' || label === 'handlebars' || label === 'razor') {
      return new htmlWorker()
    }
    return new editorWorker()
  },
}

loader.config({ monaco })

// Expose store for Playwright testing
if (typeof window !== 'undefined') {
  ;(window as any).__ZUSTAND_STORE__ = useStore
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
