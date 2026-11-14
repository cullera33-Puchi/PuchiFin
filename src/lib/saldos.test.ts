import { describe, expect, it } from 'vitest'
import { cuadrarCuenta, idsDuplicados } from './saldos'
import type { Movimiento } from './tipos'

let n = 0
const mov = (fecha: string, importe: number, saldo: number | null, concepto = `MOV ${++n}`): Movimiento => ({
  id: `m${++n}`, cuenta_id: 'c', importacion_id: 'i', fecha_operacion: fecha, fecha_valor: null, concepto_original: concepto,
  concepto_limpio: concepto, concepto_normalizado: concepto.toLowerCase(), ocurrencia: 1, importe, saldo, categoria_id: null,
  tipo: 'normal', regla_id: null, origen_categoria: null, nota: null, reembolso_cerrado: false, mes_imputacion: null,
  poblacion: null, revisado_empleado: false, created_at: '',
})

// Cadena del banco: 1.000 de partida
const cadena = () => [
  mov('2026-10-01', -50, 950, 'CAFE'),
  mov('2026-10-01', -50, 900, 'CAFE'), // dos cafés iguales el mismo día: legítimos (saldos distintos)
  mov('2026-10-03', 2000, 2900, 'NOMINA'),
  mov('2026-10-04', -100, 2800, 'SUPER'),
]

describe('cuadrarCuenta', () => {
  it('cuadra con la cadena completa, sin importar el orden de las filas', () => {
    const c = cuadrarCuenta(cadena().reverse())
    expect(c).toMatchObject({ conSaldo: true, cuadra: true, saldoApp: 2800, saldoBanco: 2800, fecha: '2026-10-04', huecos: [], duplicados: [] })
  })

  it('detecta un movimiento guardado dos veces', () => {
    const movs = cadena()
    const copia = { ...movs[2], id: 'copia' }
    const c = cuadrarCuenta([...movs, copia])
    expect(c.cuadra).toBe(false)
    expect(c.saldoApp).toBe(4800)
    expect(c.saldoBanco).toBe(2800)
    expect(idsDuplicados(c)).toEqual(['copia'])
  })

  it('detecta un hueco de movimientos sin importar', () => {
    const movs = cadena().filter((m) => m.concepto_limpio !== 'NOMINA')
    const c = cuadrarCuenta(movs)
    expect(c.cuadra).toBe(false)
    expect(c.huecos).toEqual([{ desde: '2026-10-01', hasta: '2026-10-04', diferencia: 2000 }])
  })

  it('aguanta un saldo que vuelve a un valor anterior (traspaso de ida y vuelta)', () => {
    const movs = [mov('2026-10-01', -500, 500), mov('2026-10-02', 500, 1000), mov('2026-10-05', -500, 500), mov('2026-10-06', 20, 520)]
    expect(cuadrarCuenta(movs)).toMatchObject({ cuadra: true, saldoBanco: 520, huecos: [] })
  })

  it('una cuenta sin saldo (tarjeta) no se comprueba', () => {
    expect(cuadrarCuenta([mov('2026-10-01', -5, null)])).toMatchObject({ conSaldo: false, cuadra: true })
  })
})

describe('cadena con un saldo que vuelve a una cifra ya vista', () => {
  it('una compra y su devolución el mismo día no parten la cadena, en cualquier orden', () => {
    const filas = () => [
      mov('2026-10-01', -100, 1000, 'INICIO'),
      mov('2026-10-02', -50, 950, 'COMPRA'),
      mov('2026-10-02', 50, 1000, 'DEVOLUCION'),
      mov('2026-10-02', -30, 970, 'CAFE'),
    ]
    for (const lista of [filas(), filas().reverse(), [filas()[0], filas()[3], filas()[2], filas()[1]]]) {
      const c = cuadrarCuenta(lista)
      expect(c).toMatchObject({ cuadra: true, saldoBanco: 970, huecos: [] })
    }
  })
})
