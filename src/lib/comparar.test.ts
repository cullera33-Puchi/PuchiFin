import { describe, expect, it } from 'vitest'
import { datosIniciales } from '../datos/operaciones'
import { compararPeriodos, periodosDisponibles } from './comparar'
import type { BaseDatos, Movimiento } from './tipos'

const db0 = datosIniciales()
const cat = (n: string) => db0.categorias.find((c) => !c.padre_id && c.nombre === n)!.id
let k = 0
const mov = (fecha: string, importe: number, categoria: string): Movimiento => ({
  id: `m${++k}`, cuenta_id: db0.cuentas[0].id, importacion_id: null, fecha_operacion: fecha, fecha_valor: null,
  concepto_original: 'X', concepto_limpio: 'X', concepto_normalizado: 'x', ocurrencia: 1, importe, saldo: null,
  categoria_id: cat(categoria), tipo: 'normal', regla_id: null, origen_categoria: null, nota: null,
  reembolso_cerrado: false, mes_imputacion: null, poblacion: null, revisado_empleado: false, created_at: '',
})

describe('comparar periodos', () => {
  const db: BaseDatos = {
    ...db0,
    movimientos: [
      mov('2025-10-05', -100, 'Alimentación'),
      mov('2025-11-05', -50, 'Ocio'),
      mov('2026-10-05', -130, 'Alimentación'),
      mov('2026-11-05', -20, 'Ocio'),
      mov('2026-11-01', 2000, 'Ingresos'),
    ],
  }
  it('periodos con datos por mes, trimestre y año, del más reciente al más antiguo', () => {
    expect(periodosDisponibles(db, 'anio', '2026-11-14').map((p) => p.clave)).toEqual(['2026', '2025'])
    const t = periodosDisponibles(db, 'trimestre', '2026-11-14')
    expect(t[0]).toMatchObject({ clave: '2026-T4', desde: '2026-10', hasta: '2026-12', enCurso: true })
    expect(t.at(-1)!.clave).toBe('2025-T4')
    expect(periodosDisponibles(db, 'mes', '2026-11-14')).toHaveLength(14)
  })
  it('totales y diferencias por categoría, de mayor a menor diferencia', () => {
    const [t4, , , , t0] = periodosDisponibles(db, 'trimestre', '2026-11-14')
    const r = compararPeriodos(db, t0, t4)
    expect(r.a.gastos).toBe(150)
    expect(r.b.gastos).toBe(150)
    expect(r.b.ingresos).toBe(2000)
    expect(r.categorias.map((c) => [c.nombre, c.a, c.b, c.diferencia])).toEqual([
      ['Alimentación', 100, 130, 30],
      ['Ocio', 50, 20, -30],
    ])
  })
})
