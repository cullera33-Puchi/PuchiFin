import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './index.css'
import { instalarCapturaErrores, registrar } from './lib/registro'
import { APP_VERSION } from './lib/version'

instalarCapturaErrores()
{
  let modo = 'navegador'
  try {
    if ((navigator as Navigator & { standalone?: boolean }).standalone || matchMedia('(display-mode: standalone)').matches) modo = 'instalada'
  } catch {
    // sin matchMedia
  }
  registrar('info', `Inicio v${APP_VERSION} (${modo})`)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
