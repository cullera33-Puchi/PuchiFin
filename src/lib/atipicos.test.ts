import { describe, expect, it } from 'vitest'
import { datosIniciales } from '../datos/operaciones'
import { gastosAtipicos } from './atipicos'
import type { BaseDatos, Movimiento } from './tipos'

const db0 = datosIniciales()
const super_ = db0.categorias.find((c) => c.nombre === 'Supermercado')!.id
let n = 0
const mov = (fecha: string, importe: number, concepto: string, extra: Partial<Movimiento> = {}): Movimiento => ({
  id: `m${++n}`, cuenta_id: db0.cuentas[0].id, importacion_id: null, fecha_operacion: fecha, fecha_valor: null,
  concepto_original: concepto, concepto_limpio: concepto, concepto_normalizado: concepto.toLowerCase(), ocurrencia: 1, importe, saldo: null,
  categoria_id: super_, tipo: 'normal', regla_id: null, origen_categoria: null, nota: null,
  reembolso_cerrado: false, mes_imputacion: null, poblacion: null, revisado_empleado: false, created_at: '', ...extra,
})

describe('gastos fuera de lo normal', () => {
  const db: BaseDatos = {
    ...db0,
    movimientos: [
      mov('2026-08-05', -60, 'Mercadona'),
      mov('2026-09-05', -70, 'Mercadona'),
      mov('2026-10-05', -65, 'Mercadona'),
      mov('2026-11-05', -180, 'Mercadona'), // 180 frente a 65 de mediana: fuera de lo normal
      mov('2026-11-06', -80, 'Mercadona'), // dentro de lo normal
      mov('2026-11-07', -450, 'Tienda Nueva'), // grande y sin historia
      mov('2026-11-08', -200, 'Otra Nueva'), // sin historia pero pequeño
      mov('2026-11-09', -900, 'Hotel Viaje', { tipo: 'gasto_empleado' }), // no computa
      mov('2026-11-10', -400, 'Paypal *Pago'), // PayPal grande sin historia
    ],
  }
  it('detecta el cargo inflado en un comercio con historia y el gasto grande nuevo', () => {
    const r = gastosAtipicos(db, '2026-11')
    expect(r.map((x) => [x.movimiento.concepto_limpio, x.motivo, x.habitual])).toEqual([
      ['Tienda Nueva', 'nuevo', null],
      ['Paypal *Pago', 'nuevo', null],
      ['Mercadona', 'comercio', 65],
    ])
  })
  it('sin historia ni gastos grandes, nada', () => {
    expect(gastosAtipicos(db, '2026-09')).toEqual([])
  })
})
