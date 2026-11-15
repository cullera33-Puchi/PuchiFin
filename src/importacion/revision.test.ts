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

describe('segunda revisión (v0.43.0)', async () => {
  const { crearArchivo, leerArchivo } = await import('../datos/archivo')
  const { categoriasAprendidas } = await import('./reglas')
  const { resumenAnual } = await import('../lib/anual')

  it('una copia con un texto que hoy se reconoce como dato identificativo se restaura enmascarada, no se rechaza', () => {
    const m = { ...mov('2026-11-05', -10, 90), concepto_original: 'Seguro ref 1234567/AB/1234/C', concepto_limpio: 'Seguro ref 1234567/AB/1234/C', concepto_normalizado: 'seguro ref 1234567 ab 1234 c' }
    const a = JSON.parse(JSON.stringify(crearArchivo({ ...db0, movimientos: [m] })))
    const leido = leerArchivo(JSON.stringify(a))
    expect(leido.datos.movimientos).toHaveLength(1)
    expect(contieneIdentificativo(leido.datos.movimientos[0].concepto_normalizado)).toBe(false)
    expect(leido.datos.movimientos[0].importe).toBe(-10)
  })

  it('lo aprendido por la primera palabra vale para los signos vistos en el comercio', () => {
    const ropa = db0.categorias.find((c) => c.padre_id && c.nombre === 'Ropa')!.id
    const compra = { ...mov('2026-11-01', -30, 70, 'Zzyzx tienda uno'), categoria_id: ropa, origen_categoria: 'manual' as const }
    const devolucion = { ...mov('2026-11-03', 30, 100, 'Zzyzx tienda uno'), categoria_id: ropa, origen_categoria: 'manual' as const }
    const a = categoriasAprendidas({ ...db0, movimientos: [compra, devolucion] })
    expect(a.porPalabra.get('zzyzx|-')).toBe(ropa)
    expect(a.porPalabra.get('zzyzx|+')).toBe(ropa)
  })

  it('sin ningún mes completo, el gasto medio del año es el de los meses que hay', () => {
    const gasto = (fecha: string) => ({ ...mov(fecha, -1000, 0, 'Super'), saldo: null, categoria_id: db0.categorias.find((c) => !c.padre_id && c.nombre === 'Alimentación')!.id })
    const r = resumenAnual({ ...db0, movimientos: [gasto('2026-10-10'), gasto('2026-11-10')] }, '2026', '2026-11-15')
    expect(r.gastoMedioMes).toBe(1000)
  })
})
