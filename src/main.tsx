import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { StoreProvider } from './store.tsx'
import { StartupBoundary } from './components/StartupBoundary.tsx'

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
  })
}

import { AuthProvider } from './lib/auth'

// Safari's non-standard gesture events cover installed-PWA pinch gestures that
// are not consistently governed by the viewport meta tag alone.
for (const eventName of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(eventName, event => event.preventDefault(), { passive: false })
}

try {
  const root = document.getElementById('root')
  if (!root) throw new Error('Missing application root')
  createRoot(root).render(
    <StrictMode>
      <StartupBoundary>
        <AuthProvider>
          <StoreProvider>
            <App />
          </StoreProvider>
        </AuthProvider>
      </StartupBoundary>
    </StrictMode>,
  )
  window.__footballTrackerMarkMounted?.()
} catch {
  // The inline index.html fallback was installed before this module loaded.
  window.__footballTrackerBootError?.()
}
