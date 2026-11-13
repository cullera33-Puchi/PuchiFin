import { describe, expect, it } from 'vitest'
import { datosIniciales } from '../datos/operaciones'
import { calcularExtracto } from './extracto'
import { calcularInforme, moverPeriodo, porcionesGrafico, type Porcion } from './informes'
import type { BaseDatos, Movimiento } from './tipos'

const db0 = datosIniciales()
const cat = (ruta: string) => {
  const [p, h] = ruta.split(' > ')
  const padre = db0.categorias.find((c) => !c.padre_id && c.nombre === p)!
  return h ? db0.categorias.find((c) => c.padre_id === padre.id && c.nombre === h)!.id : padre.id
}
let n = 0
const mov = (fecha: string, importe: number, ruta: string | null, extra: Partial<Movimiento> = {}): Movimiento => ({
  id: `m${++n}`, cuenta_id: db0.cuentas[0].id, importacion_id: null, fecha_operacion: fecha, fecha_valor: null,
  concepto_original: `X${n}`, concepto_limpio: `X${n}`, concepto_normalizado: `x${n}`, ocurrencia: 1, importe, saldo: null,
  categoria_id: ruta ? cat(ruta) : null, tipo: 'normal', regla_id: null, origen_categoria: null, nota: null,
  reembolso_cerrado: false, mes_imputacion: null, poblacion: null, revisado_empleado: false, created_at: '', ...extra,
})

const db: BaseDatos = {
  ...db0,
  movimientos: [
    mov('2026-11-02', -60, 'Alimentación > Supermercado'),
    mov('2026-11-05', -40, 'Alimentación > Mercado y tiendas'),
    mov('2026-11-06', -10, 'Alimentación'),
    mov('2026-11-07', 5, 'Alimentación > Supermercado'), // devolución: resta gasto
    mov('2026-11-08', -100, 'Restaurantes > Restaurantes'),
    mov('2026-11-09', -30, null),
    mov('2026-11-10', -80, 'Viajes > Alojamiento', { tipo: 'gasto_empleado' }), // no computa
    mov('2026-10-30', 2500, 'Ingresos > Nómina', { mes_imputacion: '2026-11' }), // cuenta en noviembre
    mov('2026-11-12', 20, null),
    mov('2026-10-03', -50, 'Alimentación > Supermercado'),
    mov('2026-10-20', -70, 'Restaurantes > Restaurantes'),
  ],
}
const NOV = { escala: 'mes' as const, clave: '2026-11' }

describe('calcularInforme', () => {
  it('gastos por categoría raíz, con devoluciones y sin lo que no computa', () => {
    const r = calcularInforme(db, NOV, 'gasto')
    expect(r.total).toBe(235)
    expect(r.porciones.map((p) => [p.nombre, p.importe])).toEqual([
      ['Alimentación', 105],
      ['Restaurantes', 100],
      ['Sin categoría', 30],
    ])
    expect(r.porciones.reduce((s, p) => s + p.peso, 0)).toBeCloseTo(1)
    expect(r.porciones.find((p) => p.nombre === 'Alimentación')!.anterior).toBe(50)
    expect(r.totalAnterior).toBe(120)
  })

  it('coincide con el Extracto del mes', () => {
    const e = calcularExtracto(db, '2026-11')
    const r = calcularInforme(db, NOV, 'gasto')
    expect(r.total).toBe(e.totales.gastos)
    expect(calcularInforme(db, NOV, 'ingreso').total).toBe(e.totales.ingresos)
  })

  it('ingresos, con la nómina de fin de mes en el mes siguiente', () => {
    const r = calcularInforme(db, NOV, 'ingreso')
    expect(r.porciones.map((p) => [p.nombre, p.importe])).toEqual([['Ingresos', 2500], ['Sin categoría', 20]])
    expect(calcularInforme(db, { escala: 'mes', clave: '2026-10' }, 'ingreso').total).toBe(0)
  })

  it('desglose de una categoría por subcategorías, con lo cargado en la raíz aparte', () => {
    const r = calcularInforme(db, NOV, 'gasto', cat('Alimentación'))
    expect(r.porciones.map((p) => [p.nombre, p.importe])).toEqual([
      ['Supermercado', 55],
      ['Mercado y tiendas', 40],
      ['Alimentación, general', 10],
    ])
    expect(r.movimientos).toHaveLength(4)
  })

  it('el año en curso se compara con el anterior hasta la misma fecha', () => {
    const r = calcularInforme(db, { escala: 'anio', clave: '2026' }, 'gasto', undefined, '2026-11-13')
    expect(r.enCurso).toBe(true)
    expect(r.anterior.clave).toBe('2025')
    expect(r.total).toBe(235 + 120)
  })

  it('el mes en curso se compara con los mismos días del anterior', () => {
    const r = calcularInforme(db, NOV, 'gasto', undefined, '2026-11-13')
    expect(r.totalAnterior).toBe(50) // el 20 de octubre queda fuera
  })

  it('mueve el periodo', () => {
    expect(moverPeriodo(NOV, 2).clave).toBe('2027-01')
    expect(moverPeriodo({ escala: 'anio', clave: '2026' }, -1).clave).toBe('2025')
  })
})

describe('porcionesGrafico', () => {
  const p = (i: number): Porcion => ({ id: `c${i}`, nombre: `C${i}`, icono: null, color: '#000', importe: 100 - i, peso: 0.1, anterior: 0, movimientos: 1 })
  it('agrupa a partir de la octava en Otras', () => {
    const g = porcionesGrafico(Array.from({ length: 10 }, (_, i) => p(i)))
    expect(g).toHaveLength(8)
    expect(g[7]).toMatchObject({ nombre: 'Otras (3)', importe: 93 + 92 + 91, otras: true })
    expect(porcionesGrafico(Array.from({ length: 8 }, (_, i) => p(i)))).toHaveLength(8)
  })
})
