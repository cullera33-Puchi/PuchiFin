/** Operaciones sobre las reglas de categorización */
import type { BaseDatos } from '../lib/tipos'
import { ErrorDatos } from './operaciones'

export function activarRegla(db: BaseDatos, id: string, activa: boolean): BaseDatos {
  if (!db.reglas.some((r) => r.id === id)) throw new ErrorDatos('Regla no encontrada')
  return { ...db, reglas: db.reglas.map((r) => (r.id === id ? { ...r, activa } : r)) }
}

/** Borra una regla creada por el usuario. Las de la app solo se desactivan */
export function borrarRegla(db: BaseDatos, id: string): BaseDatos {
  const r = db.reglas.find((x) => x.id === id)
  if (!r) throw new ErrorDatos('Regla no encontrada')
  if (r.origen === 'sistema') throw new ErrorDatos('Las reglas de la app no se borran: se desactivan')
  return { ...db, reglas: db.reglas.filter((x) => x.id !== id), movimientos: db.movimientos.map((m) => (m.regla_id === id ? { ...m, regla_id: null } : m)) }
}
