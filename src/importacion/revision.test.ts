/**
 * Correcciones de la revisión de la importación (v0.43.0): cada prueba reproduce un fallo encontrado.
 */
import { describe, expect, it } from 'vitest'
import { datosIniciales } from '../datos/operaciones'
import { contieneIdentificativo } from '../lib/identificativos'
import { cuadrarCuenta } from '../lib/saldos'
import type { Movimiento } from '../lib/tipos'
import { anonimizarConcepto } from './anonimizar'
import { leerImporte } from './lector'
import { clasificar, reglasPredeterminadas } from './reglas'

const db0 = datosIniciales()
let n = 0
const mov = (fecha: string, importe: number, saldo: number, concepto = 'ZARA'): Movimiento => ({
  id: `q${++n}`, cuenta_id: db0.cuentas[0].id, importacion_id: null, fecha_operacion: fecha, fecha_valor: null, concepto_original: concepto, concepto_limpio: concepto,
  concepto_normalizado: concepto.toLowerCase(), ocurrencia: 1, importe, saldo, categoria_id: null, tipo: 'normal', regla_id: null, origen_categoria: null, nota: null,
  reembolso_cerrado: false, mes_imputacion: null, poblacion: null, revisado_empleado: false, created_at: '',
})

describe('revisión de la importación (v0.43.0)', () => {
  it('importes con punto de miles y sin decimales', () => {
    expect(leerImporte('1.234')).toBe(1234)
    expect(leerImporte('-1.234.567')).toBe(-1234567)
    expect(leerImporte('1.234,56')).toBe(1234.56)
    expect(leerImporte('12.5')).toBe(12.5)
  })

  it('identificadores escritos con puntos: se detectan y se enmascaran', () => {
    for (const t of ['DNI 12.345.678-Z', 'ES91.2100.0418.4502.0005.1332', '4111.1111.1111.1111']) {
      expect(contieneIdentificativo(t)).toBe(true)
      expect(contieneIdentificativo(anonimizarConcepto(t, []))).toBe(false)
    }
  })

  it('una compra con tarjeta en un comercio con «cargo» en el nombre no es la liquidación', () => {
    const reglas = reglasPredeterminadas(db0.categorias, '')
    const r = clasificar({ texto: 'cargo bikes bcn pago con tarjeta', clave: 'cargo bikes bcn', importe: -300, cuenta_id: db0.cuentas[0].id }, reglas)
    expect(r.tipo).toBe('normal')
  })

  it('una devolución que devuelve el saldo a la misma cifra no hace pasar por repetida una compra igual', () => {
    const c = cuadrarCuenta([mov('2026-11-05', -10, 90), mov('2026-11-05', 10, 100, 'ZARA DEVOLUCION'), mov('2026-11-05', -10, 90), mov('2026-11-06', -10, 80, 'OTRA')])
    expect(c.duplicados).toEqual([])
    // Repetido de verdad: el mismo movimiento dos veces sin nada que devuelva el saldo
    const d = cuadrarCuenta([mov('2026-11-05', -10, 90), mov('2026-11-05', -10, 90)])
    expect(d.duplicados).toHaveLength(1)
  })
})
