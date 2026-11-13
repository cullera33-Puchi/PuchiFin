/**
 * Tema de la app: Automático (el del sistema), Claro u Oscuro. Se guarda en el dispositivo y se
 * aplica con el atributo data-theme de <html>; index.html lo aplica antes de pintar para no parpadear.
 */
export type Tema = 'auto' | 'claro' | 'oscuro'
const CLAVE = 'puchifin-tema'
const OSCURO = '(prefers-color-scheme: dark)'

export function leerTema(): Tema {
  try {
    const t = localStorage.getItem(CLAVE)
    return t === 'claro' || t === 'oscuro' ? t : 'auto'
  } catch {
    return 'auto'
  }
}

function resolver(t: Tema): 'light' | 'dark' {
  if (t === 'claro') return 'light'
  if (t === 'oscuro') return 'dark'
  return matchMedia(OSCURO).matches ? 'dark' : 'light'
}

/** Pone data-theme y el color de la barra de estado del sistema */
export function aplicarTema(t: Tema = leerTema()): void {
  const r = resolver(t)
  document.documentElement.dataset.theme = r
  document.documentElement.style.colorScheme = r
  const metas = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
  metas.forEach((m) => {
    if (t === 'auto') m.content = m.media.includes('dark') ? '#000000' : '#F2F2F7'
    else m.content = r === 'dark' ? '#000000' : '#F2F2F7'
  })
}

export function guardarTema(t: Tema): void {
  try {
    if (t === 'auto') localStorage.removeItem(CLAVE)
    else localStorage.setItem(CLAVE, t)
  } catch {
    // sin almacenamiento: se aplica solo en esta sesión
  }
  aplicarTema(t)
}

/** En Automático, sigue los cambios del sistema con la app abierta */
export function seguirSistema(): void {
  matchMedia(OSCURO).addEventListener('change', () => {
    if (leerTema() === 'auto') aplicarTema('auto')
  })
}
