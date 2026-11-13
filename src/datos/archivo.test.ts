import { describe, expect, it } from 'vitest'
import { generarDatosPrueba } from '../lib/datosPrueba'
import type { BaseDatos } from '../lib/tipos'
import { leerArchivo, serializar, validarArchivo } from './archivo'
import { datosIniciales, guardarAjustes, guardarCuenta } from './operaciones'

function datosCompletos(): BaseDatos {
  let db = datosIniciales()
  db = guardarCuenta(db, { alias: 'Ahorro', entidad: 'BBVA', tipo: 'cuenta', activa: false })
  db = guardarAjustes(db, { dias_aviso_reembolso: 45, zona_casa: ['Valencia'] })
  const p = generarDatosPrueba({ cuentas: db.cuentas, categorias: db.categorias, desde: '2026-10-01', hasta: '2026-11-30' })
  return { ...db, ...p, movimientos: p.movimientos.map((m, i) => (i === 3 ? { ...m, nota: 'Revisar con el banco', reembolso_cerrado: true } : m)) }
}

describe('exportar e importar', () => {
  it('importar lo exportado deja todo exactamente igual', () => {
    const db = datosCompletos()
    const recuperado = leerArchivo(serializar(db)).datos
    expect(recuperado).toEqual(db)
  })

  it('rechaza archivos que no son de PuchiFin', () => {
    expect(() => leerArchivo('no es json')).toThrow(/JSON/)
    expect(() => leerArchivo('{"app":"tareas","datos":{}}')).toThrow(/no es una copia/)
    expect(() => leerArchivo('{"app":"puchifin","datos":{"cuentas":{}}}')).toThrow(/dañado/)
  })

  it('rechaza un archivo de una versión más reciente', () => {
    expect(() => validarArchivo({ app: 'puchifin', datos: { esquema: 99 } })).toThrow(/más reciente/)
  })

  it('no importa un archivo con datos identificativos y dice dónde están', () => {
    const db = datosCompletos()
    db.movimientos[0].concepto_original = 'TRANSFERENCIA ES91 2100 0418 4502 0005 1332'
    expect(() => leerArchivo(serializar(db))).toThrow(/IBAN/)
  })

  it('completa las listas que falten', () => {
    const a = validarArchivo({ app: 'puchifin', datos: { cuentas: [] } })
    expect(a.datos.movimientos).toEqual([])
    expect(a.datos.ajustes.fecha_inicio).toBe('2026-10-01')
  })
})
