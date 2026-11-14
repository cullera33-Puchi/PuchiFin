/**
 * Modo discreto (v0.33.0): oculta los importes en toda la app, para abrirla delante de otros. Lo que sale
 * de la app (PDF, Excel, textos para Claude) lleva siempre las cifras reales. Se recuerda en el dispositivo
 * con la misma clave que el ojo de «Tu posición», que pasa a activar este modo.
 */
const CLAVE = 'puchifin-posicion-oculta'
const oyentes = new Set<() => void>()

function leer(): boolean {
  try {
    return localStorage.getItem(CLAVE) === '1'
  } catch {
    return false
  }
}

let activo = leer()
/** Mientras se genera algo que sale de la app, las cifras van sin ocultar */
let exportando = 0

export const esDiscreto = () => activo && exportando === 0

export function fijarDiscreto(v: boolean) {
  activo = v
  try {
    localStorage.setItem(CLAVE, v ? '1' : '0')
  } catch {
    // sin almacenamiento: solo en esta sesión
  }
  oyentes.forEach((f) => f())
}

export function suscribirDiscreto(f: () => void) {
  oyentes.add(f)
  return () => {
    oyentes.delete(f)
  }
}

/** Ejecuta la generación de un PDF, un Excel o un texto con las cifras reales */
export function sinDiscreto<T>(f: () => T): T {
  exportando++
  try {
    return f()
  } finally {
    exportando--
  }
}

export const CIFRA_OCULTA = '•••• €'
