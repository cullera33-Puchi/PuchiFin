import { describe, expect, it } from 'vitest'
import { datosIniciales } from '../datos/operaciones'
import { normalizarConcepto } from './conceptos'
import { cuadrarLiquidaciones } from './tarjeta'
import type { BaseDatos, Movimiento } from './tipos'

const db0 = datosIniciales()
const principal = db0.cuentas[0].id
const tarjeta = db0.cuentas.find((c) => c.tipo === 'tarjeta_credito')!.id
const regla = db0.reglas.find((r) => r.nombre === 'Liquidación de tarjeta')!.id
let n = 0
const mov = (cuenta: string, fecha: string, importe: number, concepto = `COMPRA ${n}`, extra: Partial<Movimiento> = {}): Movimiento => ({
  id: `m${++n}`, cuenta_id: cuenta, importacion_id: null, fecha_operacion: fecha, fecha_valor: null, concepto_original: concepto,
  concepto_limpio: concepto, concepto_normalizado: normalizarConcepto(concepto), ocurrencia: 1, importe, saldo: null, categoria_id: null,
  tipo: 'normal', regla_id: null, origen_categoria: null, nota: null, reembolso_cerrado: false, mes_imputacion: null, poblacion: null,
  revisado_empleado: false, created_at: '', ...extra,
})
const liq = (fecha: string, importe: number) => mov(principal, fecha, importe, 'LIQUIDACION TARJETA CREDITO', { tipo: 'traspaso_interno', regla_id: regla })

// Ciclo de BBVA del 4 de un mes al 3 del siguiente, cargado el día 5
const compras = [
  mov(tarjeta, '2026-10-01', -12.5), mov(tarjeta, '2026-10-03', -7.5), // ciclo anterior (liquidado el 5 de octubre)
  mov(tarjeta, '2026-10-04', -30), mov(tarjeta, '2026-10-15', -45.2), mov(tarjeta, '2026-10-20', 10), // devolución
  mov(tarjeta, '2026-10-31', -60), mov(tarjeta, '2026-11-02', -20.8), mov(tarjeta, '2026-11-03', -4),
  mov(tarjeta, '2026-11-06', -15), // ya del ciclo siguiente
]
const db: BaseDatos = { ...db0, movimientos: [...compras, liq('2026-10-05', -120), liq('2026-11-05', -150)] }

describe('cuadrarLiquidaciones', () => {
  const r = cuadrarLiquidaciones(db)

  it('encuentra el periodo de liquidación aunque no sea el mes natural', () => {
    expect(r[1]).toMatchObject({ estado: 'cuadra', desde: '2026-10-04', hasta: '2026-11-03', compras: -150, diferencia: 0 })
  })

  it('el primer cargo liquida compras de antes de la fecha de inicio: no se marca como error', () => {
    expect(r[0].estado).toBe('anterior_al_inicio')
  })

  it('si falta una compra, da la diferencia', () => {
    const sin = { ...db, movimientos: db.movimientos.filter((m) => m.fecha_operacion !== '2026-10-15') }
    const x = cuadrarLiquidaciones(sin)[1]
    expect(x.estado).toBe('no_cuadra')
    expect(x.diferencia).not.toBe(0)
  })

  it('sin compras de la tarjeta importadas, pide importarla', () => {
    const sin = { ...db, movimientos: db.movimientos.filter((m) => m.cuenta_id !== tarjeta) }
    expect(cuadrarLiquidaciones(sin)[1].estado).toBe('sin_tarjeta')
  })

  it('los abonos de la liquidación en el propio Excel de la tarjeta no cuentan como compras', () => {
    const abono = mov(tarjeta, '2026-10-25', 120, 'ABONO LIQUIDACION TARJETA', { tipo: 'traspaso_interno' })
    expect(cuadrarLiquidaciones({ ...db, movimientos: [...db.movimientos, abono] })[1].estado).toBe('cuadra')
  })
})
