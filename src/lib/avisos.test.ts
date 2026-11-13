import { describe, expect, it } from 'vitest'
import { datosIniciales } from '../datos/operaciones'
import { generarDatosPrueba } from './datosPrueba'
import { avisoExportacion } from './avisos'
import type { Movimiento } from './tipos'

describe('avisoExportacion', () => {
  const db = datosIniciales()
  const prueba = generarDatosPrueba({ cuentas: db.cuentas, categorias: db.categorias, desde: '2026-10-01', hasta: '2026-10-31' })
  const real: Movimiento = { ...prueba.movimientos[0], id: 'real', importacion_id: null }

  it('no avisa sin datos o con solo datos de prueba', () => {
    expect(avisoExportacion(db, null)).toBeNull()
    expect(avisoExportacion({ ...db, ...prueba }, null)).toBeNull()
  })

  it('avisa si hay datos reales sin exportar o la exportación es antigua', () => {
    const conReal = { ...db, movimientos: [real] }
    expect(avisoExportacion(conReal, null)).toMatch(/Todavía no/)
    expect(avisoExportacion(conReal, '2026-11-01T10:00:00Z', new Date('2026-11-20T10:00:00Z'))).toMatch(/hace 19 días/)
    expect(avisoExportacion(conReal, '2026-11-10T10:00:00Z', new Date('2026-11-20T10:00:00Z'))).toBeNull()
  })
})
