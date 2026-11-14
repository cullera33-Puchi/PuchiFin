/**
 * Cálculos guardados por versión de los datos (v0.32.0). Cada cambio crea un objeto `BaseDatos` nuevo, así
 * que lo calculado con uno sirve mientras no cambie: al pasar de pestaña o de mes no se repite. Las
 * entradas se liberan solas cuando esa versión de los datos deja de usarse (WeakMap).
 */
import type { BaseDatos } from './tipos'

export function porVersion<T>(calcular: (db: BaseDatos) => T): (db: BaseDatos) => T {
  const guardado = new WeakMap<BaseDatos, T>()
  return (db) => {
    if (guardado.has(db)) return guardado.get(db) as T
    const r = calcular(db)
    guardado.set(db, r)
    return r
  }
}

/** Igual, con una clave más (el mes, por ejemplo) */
export function porVersionYClave<T>(calcular: (db: BaseDatos, clave: string) => T): (db: BaseDatos, clave: string) => T {
  const guardado = new WeakMap<BaseDatos, Map<string, T>>()
  return (db, clave) => {
    let m = guardado.get(db)
    if (!m) guardado.set(db, (m = new Map()))
    if (m.has(clave)) return m.get(clave) as T
    const r = calcular(db, clave)
    m.set(clave, r)
    return r
  }
}
