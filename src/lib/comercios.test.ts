import { describe, expect, it } from 'vitest'
import { normalizarConcepto } from './conceptos'
import { gastosHormiga, rankingComercios } from './comercios'
import type { Movimiento } from './tipos'

let n = 0
const mov = (concepto: string, importe: number, fecha = '2026-11-10'): Movimiento => ({
  id: `m${++n}`, cuenta_id: 'c', importacion_id: null, fecha_operacion: fecha, fecha_valor: null, concepto_original: concepto, concepto_limpio: concepto,
  concepto_normalizado: normalizarConcepto(concepto), ocurrencia: 1, importe, saldo: null, categoria_id: null, tipo: 'normal', regla_id: null,
  origen_categoria: null, nota: null, reembolso_cerrado: false, mes_imputacion: null, poblacion: null, revisado_empleado: false, created_at: '',
})

const movs = [
  mov('Mercadona 1234', -80), mov('Mercadona 2210', -60),
  mov('Cafeteria Luna', -2.5), mov('Cafeteria Luna', -2.2), mov('Cafeteria Luna', -3.1), mov('Cafeteria Luna', -2.4),
  mov('Repsol', -70),
  mov('PayPal Europe S.a.r.l. et Cie S.c.a', -9.99), mov('PayPal Europe S.a.r.l. et Cie S.c.a', -30),
  mov('Kiosco Sol', -1.5), mov('Kiosco Sol', -1.5),
]

describe('ranking de comercios', () => {
  it('por importe, por veces y PayPal junto', () => {
    expect(rankingComercios(movs, -1, 'importe', 3).map((l) => [l.nombre, l.importe, l.veces])).toEqual([
      ['Mercadona 2210', 140, 2],
      ['Repsol', 70, 1],
      ['PayPal', 39.99, 2],
    ])
    expect(rankingComercios(movs, -1, 'veces', 1)[0]).toMatchObject({ nombre: 'Cafeteria Luna', veces: 4, importe: 10.2 })
  })
})

describe('gastos hormiga', () => {
  it('compras pequeñas en comercios que se repiten, con el ritmo anual', () => {
    const h = gastosHormiga(movs, 1)!
    expect(h.comercios.map((c) => c.nombre)).toEqual(['Cafeteria Luna'])
    expect(h).toMatchObject({ total: 10.2, compras: 4, alAno: 122 })
  })

  it('a mitad de mes el ritmo anual se calcula con lo que va de mes; sin repetidos, nada', () => {
    expect(gastosHormiga(movs, 0.5)!.alAno).toBe(245)
    expect(gastosHormiga([mov('Kiosco Sol', -1.5)], 1)).toBeNull()
  })
})
