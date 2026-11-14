/**
 * Archivos exportados como los guardaban las versiones anteriores (esquemas 3, 5, 7, 8, 9, 10, 11 y 12), con datos
 * inventados. Las pruebas de navegador (tests/e2e) los importan en la app para comprobar que se siguen
 * leyendo. npm run archivos:prueba los regenera; npm test solo comprueba que se leen.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { crearArchivo, leerArchivo } from '../src/datos/archivo'
import { datosIniciales } from '../src/datos/operaciones'
import { generarDatosPrueba } from '../src/lib/datosPrueba'
import { VERSION_ESQUEMA } from '../src/lib/tipos'

let n = 0
function archivo(esquema: number): string {
  const db = datosIniciales()
  const p = generarDatosPrueba({ cuentas: db.cuentas, categorias: db.categorias, desde: '2026-09-01', hasta: '2026-11-13', nuevoId: () => `e${esquema}-${++n}` })
  // Como datos reales: que no los borre «Eliminar datos de prueba»
  const importaciones = p.importaciones.map((i) => ({ ...i, origen: i.cuenta_id === db.cuentas[2].id ? 'bbva_tarjeta' : 'bbva_cuenta' }))
  const a = JSON.parse(JSON.stringify(crearArchivo({ ...db, ...p, importaciones } as typeof db)))
  a.datos.esquema = esquema
  a.version_app = { 3: '0.6.0', 5: '0.8.0', 7: '0.13.0', 8: '0.14.0', 9: '0.22.0', 10: '0.23.0', 11: '0.24.0', 12: '0.33.0' }[esquema]
  // Quita lo que llegó después de ese esquema
  if (esquema === 12)
    a.datos.ajustes.nominas = [{ id: 'n1', nombre: 'Mi nómina', neto_mensual: 2500, pagas: [{ mes: 6, importe: 2500 }], desde: null, hasta: null, incluida: true, bonus: { mes: 7, importe: 3000 } }]
  for (const m of a.datos.movimientos) delete m.tipo_manual
  if (esquema === 11) a.datos.ajustes.nominas = [{ id: 'n1', nombre: 'Mi nómina', neto_mensual: 2500, pagas: [{ mes: 6, importe: 2500 }], desde: null, hasta: null, incluida: true }]
  if (esquema < 11) delete a.datos.ajustes.nominas
  if (esquema < 10)
    for (const c of a.datos.compromisos) {
      delete c.cuenta_colchon_id
      c.base_colchon = 'saldo_conjunto'
    }
  if (esquema < 9) for (const m of a.datos.movimientos) delete m.cuadre_confirmado
  if (esquema < 8) Object.assign(a.datos.ajustes, { fecha_inicio: '2026-09-01', fecha_corte_fintonic: '2026-08-31' })
  if (esquema < 5) delete a.datos.ajustes.version_logica
  if (esquema < 4) for (const c of a.datos.cuentas) delete c.saldo_confirmado
  return JSON.stringify(a, null, 1)
}

describe('archivos de esquemas anteriores', () => {
  it.each([3, 5, 7, 8, 9, 10, 11, 12])('el del esquema %i se lee y se adapta al actual', (esquema) => {
    const texto = archivo(esquema)
    const a = leerArchivo(texto)
    expect(a.datos.esquema).toBe(VERSION_ESQUEMA)
    expect(a.datos.movimientos.length).toBeGreaterThan(100)
    // Esquema 12: bonus en cada nómina, sin dato si no lo había
    if (esquema < 12) expect(a.datos.ajustes.nominas.every((n) => n.bonus === null)).toBe(true)
    else expect(a.datos.ajustes.nominas[0].bonus).toEqual({ mes: 7, importe: 3000 })
    // Esquema 10: el colchón de la deuda, sobre la Cuenta 2
    expect(a.datos.compromisos[0]).toMatchObject({ base_colchon: 'cuenta', cuenta_colchon_id: a.datos.cuentas.find((c) => c.alias === 'Cuenta 2')!.id })
    if (process.env.GENERAR_ARCHIVOS) {
      mkdirSync('tests/fixtures/archivos', { recursive: true })
      writeFileSync(`tests/fixtures/archivos/esquema-${esquema}.json`, texto)
    }
  })
})
