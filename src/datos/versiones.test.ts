/**
 * Garantía para el usuario: al publicar una versión nueva, lo que ya tiene en el iPhone no se rompe.
 * Un archivo de una versión anterior (esquema 3, v0.6.0) con movimientos categorizados a mano, por
 * regla y aprendidos pasa por la migración y por la lógica de la versión nueva: ninguna categoría,
 * tipo, nota ni conciliación cambia; solo lo pendiente de categorizar puede recibir las reglas nuevas.
 */
import { describe, expect, it } from 'vitest'
import { actualizarLogica, esPendiente } from '../importacion/pendientes'
import { generarDatosPrueba } from '../lib/datosPrueba'
import type { BaseDatos } from '../lib/tipos'
import { crearArchivo, leerArchivo } from './archivo'
import { datosIniciales } from './operaciones'

function archivoAntiguo(): string {
  const db = datosIniciales()
  const prueba = generarDatosPrueba({ cuentas: db.cuentas, categorias: db.categorias, desde: '2026-10-01', hasta: '2026-11-30' })
  const movimientos = prueba.movimientos.map((m, i) =>
    // Algunos corregidos a mano, otros sin categoría (pendientes) y otros con nota
    i % 7 === 0 ? { ...m, categoria_id: db.categorias[3].id, origen_categoria: 'manual' as const } : i % 11 === 0 ? { ...m, categoria_id: null, origen_categoria: null } : i % 13 === 0 ? { ...m, nota: 'revisado' } : m,
  )
  const actual: BaseDatos = { ...db, ...prueba, movimientos }
  // Como lo guardaba la v0.6.0: esquema 3, sin los campos que llegaron después
  const archivo = JSON.parse(JSON.stringify(crearArchivo(actual)))
  archivo.datos.esquema = 3
  archivo.version_app = '0.6.0'
  delete archivo.datos.ajustes.version_logica
  for (const c of archivo.datos.cuentas) delete c.saldo_confirmado
  return JSON.stringify(archivo)
}

describe('compatibilidad entre versiones', () => {
  const texto = archivoAntiguo()
  const antes = JSON.parse(texto).datos as BaseDatos

  it('un archivo de la v0.6.0 se importa y se adapta al esquema actual', () => {
    const a = leerArchivo(texto)
    expect(a.datos.esquema).toBeGreaterThanOrEqual(5)
    expect(a.datos.movimientos).toHaveLength(antes.movimientos.length)
    expect(a.datos.cuentas.every((c) => c.saldo_confirmado === null)).toBe(true)
  })

  it('la versión nueva no toca nada de lo categorizado ni las conciliaciones', () => {
    const migrado = leerArchivo(texto).datos
    const r = actualizarLogica(migrado, '9.9.9')
    const porId = new Map(r.db.movimientos.map((m) => [m.id, m]))
    for (const m of antes.movimientos) {
      const despues = porId.get(m.id)!
      expect(despues.nota).toBe(m.nota)
      if (esPendiente({ ...despues, ...m })) continue
      expect({ categoria_id: despues.categoria_id, tipo: despues.tipo, origen: despues.origen_categoria, mes: despues.mes_imputacion }).toEqual({
        categoria_id: m.categoria_id,
        tipo: m.tipo,
        origen: m.origen_categoria,
        mes: m.mes_imputacion ?? null,
      })
    }
    expect(r.db.conciliaciones).toEqual(antes.conciliaciones)
  })
})
