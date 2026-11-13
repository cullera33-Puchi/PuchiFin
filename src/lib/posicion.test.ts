import { describe, expect, it } from 'vitest'
import { datosIniciales } from '../datos/operaciones'
import { generarDatosPrueba } from './datosPrueba'
import { calcularPosicion } from './posicion'
import { cuadrarCuenta } from './saldos'
import type { BaseDatos } from './tipos'

const base = datosIniciales()
const [principal, segunda, tarjeta] = base.cuentas
const conDatos = (desde: string, hasta: string): BaseDatos => ({ ...base, ...generarDatosPrueba({ cuentas: base.cuentas, categorias: base.categorias, desde, hasta }) })

describe('posición global', () => {
  it('sin saldos del banco no hay posición', () => {
    expect(calcularPosicion(base)).toBeNull()
  })

  it('capital: saldo de las cuentas menos lo pendiente de cargar de la tarjeta', () => {
    const db = conDatos('2026-09-01', '2026-11-20')
    const p = calcularPosicion(db)!
    const saldo = (id: string) => cuadrarCuenta(db.movimientos.filter((m) => m.cuenta_id === id)).saldoBanco!
    expect(p.cuentas.map((c) => c.cuenta.id)).toEqual([principal.id, segunda.id])
    expect(p.bancos).toBeCloseTo(saldo(principal.id) + saldo(segunda.id), 2)
    // La liquidación del 3 de noviembre cubre octubre: lo pendiente son las compras de noviembre
    const noviembre = db.movimientos.filter((m) => m.cuenta_id === tarjeta.id && m.fecha_operacion >= '2026-11-01').reduce((s, m) => s + m.importe, 0)
    const t = p.tarjetas.find((x) => x.cuenta.id === tarjeta.id)!
    expect(t.pendiente).toMatchObject({ desde: '2026-11-01', aproximado: false })
    expect(t.pendiente.importe).toBeCloseTo(noviembre, 2)
    expect(p.capital).toBeCloseTo(p.bancos + noviembre, 2)
  })

  it('evolución a final de cada mes y variación frente al mes anterior', () => {
    const db = conDatos('2026-09-01', '2026-11-20')
    const p = calcularPosicion(db)!
    expect(p.evolucion.map((e) => e.mes)).toEqual(['2026-09', '2026-10', '2026-11'])
    expect(p.evolucion[2].saldo).toBe(p.bancos)
    expect(p.variacionMes).toBeCloseTo(p.bancos - p.evolucion[1].saldo, 2)
  })
})
