import { describe, expect, it } from 'vitest'
import { datosIniciales } from '../datos/operaciones'
import { generarDatosPrueba } from './datosPrueba'
import { mesEfectivo } from './imputacion'
import { preverCierre } from './prevision'
import { detectarRecurrentes } from './recurrentes'
import { calcularTotales } from './resumen'

const db0 = datosIniciales()
const db = { ...db0, ...generarDatosPrueba({ cuentas: db0.cuentas, categorias: db0.categorias, desde: '2026-05-01', hasta: '2026-11-13' }) }
const rec = detectarRecurrentes(db)

describe('previsión de cierre de mes', () => {
  const p = preverCierre(db, '2026-11', '2026-11-13', rec)!

  it('gastado hasta hoy, recibos que faltan y variable de los días que quedan', () => {
    expect(p.gastado).toBeCloseTo(calcularTotales(db.movimientos.filter((m) => mesEfectivo(m) === '2026-11'), db.categorias).gastos, 2)
    const nombres = p.pendientes.map((r) => r.nombre.toLowerCase())
    // Del 14 al 30: fibra (15), la luz no (el 10 ya pasó), la hipoteca no (cuenta en diciembre)
    expect(nombres.some((n) => n.includes('fibra'))).toBe(true)
    expect(nombres.some((n) => n.includes('energia'))).toBe(false)
    expect(nombres.some((n) => n.includes('hipotecario'))).toBe(false)
    expect(p.diasRestantes).toBe(17)
    expect(p.variable).toBeGreaterThan(0)
    expect(p.total).toBeCloseTo(p.gastado + p.recibos + p.variable, 2)
  })

  it('compara con la media de los meses completos anteriores y solo vale para el mes en curso', () => {
    expect(p.media).toBeGreaterThan(0)
    expect(preverCierre(db, '2026-10', '2026-11-13', rec)).toBeNull()
  })
})

describe('previsión con los datos atrasados', () => {
  it('cuenta desde el último dato importado, no desde hoy', () => {
    const hasta5 = { ...db, movimientos: db.movimientos.filter((m) => m.fecha_operacion <= '2026-11-05') }
    const p = preverCierre(hasta5, '2026-11', '2026-11-14', detectarRecurrentes(hasta5))!
    expect(p.hasta).toBe('2026-11-05')
    expect(p.diasRestantes).toBe(25)
    // Los recibos previstos entre el 6 y el 14 siguen pendientes (la fibra del 15 también)
    expect(p.pendientes.some((r) => r.nombre.toLowerCase().includes('energia'))).toBe(true)
  })
})
