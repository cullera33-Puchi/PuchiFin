import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './index.css'
import { instalarCapturaErrores, registrar } from './lib/registro'
import { aplicarTema, seguirSistema } from './lib/tema'
import { APP_VERSION } from './lib/version'

aplicarTema()
seguirSistema()
// Sin zoom con dos dedos: la app se comporta como nativa
document.addEventListener('gesturestart', (e) => e.preventDefault())
document.addEventListener(
  'touchmove',
  (e) => {
    if (e.touches.length > 1) e.preventDefault()
  },
  { passive: false },
)

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
