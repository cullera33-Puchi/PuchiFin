/**
 * Cálculos guardados por versión de los datos (v0.32.0). Cada cambio crea un objeto `BaseDatos` nuevo, así
 * que lo calculado con uno sirve mientras no cambie: al pasar de pestaña o de mes no se repite. Las
 * entradas se liberan solas cuando esa versión de los datos deja de usarse (WeakMap).
 *
 * Algunos resultados llevan textos con importes (avisos, nombres de PayPal): se guardan aparte con y sin
 * el modo discreto, para que activarlo o quitarlo no deje cifras a la vista ni ocultas de más (v0.34.0).
 */
import { esDiscreto } from './discreto'
import type { BaseDatos } from './tipos'

export function porVersion<T>(calcular: (db: BaseDatos) => T): (db: BaseDatos) => T {
  const guardado = new WeakMap<BaseDatos, Map<boolean, T>>()
  return (db) => {
    let m = guardado.get(db)
    if (!m) guardado.set(db, (m = new Map()))
    const modo = esDiscreto()
    if (m.has(modo)) return m.get(modo) as T
    const r = calcular(db)
    m.set(modo, r)
    return r
  }
}

/** Igual, con una clave más (el mes, por ejemplo) */
export function porVersionYClave<T>(calcular: (db: BaseDatos, clave: string) => T): (db: BaseDatos, clave: string) => T {
  const guardado = new WeakMap<BaseDatos, Map<string, T>>()
  return (db, clave) => {
    let m = guardado.get(db)
    if (!m) guardado.set(db, (m = new Map()))
    const k = `${esDiscreto() ? 'd' : 'c'}|${clave}`
    if (m.has(k)) return m.get(k) as T
    const r = calcular(db, clave)
    m.set(k, r)
    return r
  }
}
