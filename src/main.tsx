import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { useStore } from './stores/useStore'

// Expose store for Playwright testing
if (typeof window !== 'undefined') {
  ;(window as any).__ZUSTAND_STORE__ = useStore
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
