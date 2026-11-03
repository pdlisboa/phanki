import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App } from './App'
import { ensureBuiltins } from './lib/db'
import { isNative } from './lib/platform'
import { startSyncLoop } from './lib/sync'
import './index.css'

declare global {
  const __APP_VERSION__: string
}

async function boot() {
  await ensureBuiltins()
  void navigator.storage?.persist?.()
  if (isNative) {
    // Android back button navigates inside the app before closing it.
    const { App: CapApp } = await import('@capacitor/app')
    void CapApp.addListener('backButton', ({ canGoBack }) => (canGoBack ? history.back() : void CapApp.exitApp()))
  } else {
    const { registerSW } = await import('virtual:pwa-register')
    registerSW({ immediate: true })
  }
  startSyncLoop()
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>,
  )
}

void boot()
