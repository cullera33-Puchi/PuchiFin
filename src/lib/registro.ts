/**
 * Registro de errores y eventos de la app, guardado en el dispositivo (localStorage, 400 entradas).
 * El usuario lo copia o lo comparte desde Ajustes, Herramientas, para pegarlo en el chat al depurar.
 *
 * Nunca debe llevar datos personales: solo recuentos, identificadores internos y mensajes técnicos.
 * Como red de seguridad, cualquier IBAN, tarjeta o DNI que llegue aquí se enmascara al guardarlo.
 * Toda operación nueva relevante (importación, copia, restauración, sincronización) se anota aquí.
 */
import { enmascararIdentificativos } from './identificativos'
import { APP_VERSION } from './version'

export type Nivel = 'info' | 'aviso' | 'error'

export interface Entrada {
  t: string
  l: Nivel
  m: string
  x?: string
}

export const CLAVE_REGISTRO = 'puchifin-registro'
export const MAX_ENTRADAS = 400

let entradas: Entrada[] = leer()
const oyentes = new Set<() => void>()

function leer(): Entrada[] {
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE_REGISTRO) ?? '[]')
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

function guardar() {
  try {
    if (entradas.length) localStorage.setItem(CLAVE_REGISTRO, JSON.stringify(entradas))
    else localStorage.removeItem(CLAVE_REGISTRO)
  } catch {
    // Sin almacenamiento (modo privado): el registro vive solo en memoria
  }
  oyentes.forEach((f) => f())
}

export function registrar(nivel: Nivel, mensaje: string, extra?: unknown): void {
  const e: Entrada = { t: new Date().toISOString(), l: nivel, m: enmascararIdentificativos(String(mensaje)) }
  if (extra !== undefined) {
    let x: string
    try {
      x = typeof extra === 'string' ? extra : JSON.stringify(extra)
    } catch {
      x = String(extra)
    }
    e.x = enmascararIdentificativos(x)
  }
  entradas = [...entradas, e].slice(-MAX_ENTRADAS)
  guardar()
}

export function entradasRegistro(): readonly Entrada[] {
  return entradas
}

/** Borra el registro y devuelve lo borrado, para poder deshacer */
export function borrarRegistro(): Entrada[] {
  const antes = entradas
  entradas = []
  guardar()
  return antes
}

/** Deshace un borrado: lo anotado mientras tanto queda detrás de lo recuperado */
export function recuperarRegistro(antes: Entrada[]): void {
  entradas = [...antes, ...entradas].slice(-MAX_ENTRADAS)
  guardar()
}

export function suscribirRegistro(f: () => void): () => void {
  oyentes.add(f)
  return () => oyentes.delete(f)
}

function modo(): string {
  try {
    const standalone =
      (navigator as Navigator & { standalone?: boolean }).standalone === true ||
      matchMedia('(display-mode: standalone)').matches
    return standalone ? 'instalada' : 'navegador'
  } catch {
    return '?'
  }
}

/** Texto para pegar en el chat: cabecera con versión y dispositivo, y una línea por entrada */
export function textoRegistro(resumenDatos?: string): string {
  const cabecera = [`PuchiFin v${APP_VERSION}`, modo(), navigator.userAgent, new Date().toString(), resumenDatos]
    .filter(Boolean)
    .join(' | ')
  const lineas = entradas.map((e) => {
    const t = e.t.replace('T', ' ').slice(5, 19)
    return `${t} [${e.l}] ${e.m}${e.x ? ` | ${e.x}` : ''}`
  })
  return `${cabecera}\n${lineas.length ? lineas.join('\n') : '(sin entradas)'}`
}

let instalado = false

/** Captura errores no controlados, promesas rechazadas y console.error */
export function instalarCapturaErrores(): void {
  if (instalado) return
  instalado = true
  window.addEventListener('error', (e) =>
    registrar('error', e.message || 'Error', `${(e.filename || '').split('/').pop()}:${e.lineno}:${e.colno}${e.error?.stack ? `\n${e.error.stack}` : ''}`),
  )
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason as { message?: string; stack?: string } | undefined
    registrar('error', `Promesa rechazada: ${r?.message ?? String(e.reason)}`, r?.stack)
  })
  const original = console.error.bind(console)
  console.error = (...args: unknown[]) => {
    registrar('error', args.map((a) => (a as { message?: string })?.message ?? String(a)).join(' '))
    original(...args)
  }
}
