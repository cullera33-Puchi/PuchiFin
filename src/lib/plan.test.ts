import { describe, expect, it } from 'vitest'
import { datosIniciales, guardarCompromiso, guardarEvento, guardarPresupuesto } from '../datos/operaciones'
import { calcularPlan, efectoMesCerrado } from './plan'
import type { BaseDatos, Movimiento } from './tipos'

const db0 = datosIniciales()
const [principal, segunda] = db0.cuentas
const cat = (ruta: string) => {
  const [p, h] = ruta.split(' > ')
  const padre = db0.categorias.find((c) => !c.padre_id && c.nombre === p)!
  return h ? db0.categorias.find((c) => c.padre_id === padre.id && c.nombre === h)!.id : padre.id
}
let n = 0
const mov = (fecha: string, importe: number, ruta: string | null, extra: Partial<Movimiento> = {}): Movimiento => ({
  id: `m${++n}`, cuenta_id: principal.id, importacion_id: null, fecha_operacion: fecha, fecha_valor: null,
  concepto_original: `X${n}`, concepto_limpio: `X${n}`, concepto_normalizado: `x${n}`, ocurrencia: 1, importe, saldo: null,
  categoria_id: ruta ? cat(ruta) : null, tipo: 'normal', regla_id: null, origen_categoria: null, nota: null,
  reembolso_cerrado: false, mes_imputacion: null, poblacion: null, revisado_empleado: false, created_at: '', ...extra,
})

const HOY = '2026-11-15'
/** De julio (primer mes, incompleto) a noviembre: 3.000 de nómina y 2.000 de gasto al mes; la Cuenta 2 con 5.000 el 15/11 */
function crear(deuda: number, octubreSuper = -1000): BaseDatos {
  const movimientos: Movimiento[] = []
  for (const mes of ['2026-07', '2026-08', '2026-09', '2026-10', '2026-11']) {
    movimientos.push(mov(`${mes}-01`, 3000, 'Ingresos > Nómina'))
    movimientos.push(mov(`${mes}-05`, mes === '2026-10' ? octubreSuper : -1000, 'Alimentación > Supermercado'))
    movimientos.push(mov(`${mes}-06`, -1000, 'Vivienda > Hipoteca'))
  }
  movimientos.push(mov('2026-11-15', 500, null, { cuenta_id: segunda.id, tipo: 'traspaso_interno', saldo: 5000 }))
  const db = { ...db0, movimientos }
  const c = db.compromisos[0]
  return guardarCompromiso(db, c.id, { deuda_inicial: deuda, fecha_referencia: '2026-10-01', colchon: 3000, cuenta_colchon_id: segunda.id, ventana_mes_inicio: 6, ventana_mes_fin: 8, mes_referencia: 7 })
}

describe('plan de pagos de la deuda', () => {
  it('sin deuda configurada no hay plan', () => {
    expect(calcularPlan(db0, HOY).falta).toBe('sin_deuda')
  })

  it('julio: todo lo que supera el colchón en la Cuenta 2, sin pasar de la deuda', () => {
    const p = calcularPlan(crear(10000), HOY).plan!
    // 5.000 + medio noviembre (500) + 8 meses de 1.000 = 13.500; pago 10.000 (la deuda), saldada en 2027
    expect(p.pagos).toEqual([{ anio: 2027, mes: '2027-07', saldo: 13500, pago: 10000, deudaTras: 0 }])
    expect(p.saldadaEn).toBe(2027)
    expect(p.ahorroMensual).toBe(1000)
    expect(p.mesesBase).toBe(3) // agosto, septiembre y octubre; julio, el primero, no cuenta
  })

  it('calendario año a año hasta saldarla', () => {
    const p = calcularPlan(crear(20000), HOY).plan!
    expect(p.pagos.map((x) => [x.anio, x.pago, x.deudaTras])).toEqual([
      [2027, 10500, 9500],
      [2028, 9500, 0],
    ])
    expect(p.saldadaEn).toBe(2028)
  })

  it('los pagos de deuda reales reducen lo pendiente', () => {
    const db = crear(20000)
    db.movimientos.push(mov('2026-10-10', -2000, null, { cuenta_id: segunda.id, tipo: 'pago_deuda' }))
    const p = calcularPlan(db, HOY).plan!
    expect(p.pagado).toBe(2000)
    expect(p.deudaPendiente).toBe(18000)
    expect(p.pagosReales).toEqual([{ anio: 2026, importe: 2000 }])
    expect(p.pagos[0].pago).toBe(10500)
    expect(p.pagos[1].pago).toBe(7500)
  })

  it('simulación: ahorrar más cada mes o recortar una categoría', () => {
    const db = crear(20000)
    const extra = calcularPlan(db, HOY, { ahorroExtra: 500, recorte: null }).plan!
    // 5.000 + 750 + 8 x 1.500 = 17.750; pago 14.750
    expect(extra.pagos[0].pago).toBe(14750)
    const recorte = calcularPlan(db, HOY, { ahorroExtra: 0, recorte: { categoria_id: cat('Alimentación'), porcentaje: 50 } }).plan!
    expect(recorte.pagos[0].pago).toBe(14750)
  })

  it('el presupuesto manda sobre la media y los previstos pendientes restan', () => {
    let db = guardarPresupuesto(crear(20000), cat('Vivienda'), 500)
    expect(calcularPlan(db, HOY).plan!.pagos[0].pago).toBe(14750)
    db = guardarEvento(crear(20000), { fecha: '2027-03-10', concepto: 'Seguro anual', importe: -2000, categoria_id: null })
    expect(calcularPlan(db, HOY).plan!.pagos[0].pago).toBe(8500)
  })

  it('efecto del mes cerrado: ahorro real frente al previsto', () => {
    const e = efectoMesCerrado(crear(10000, -700), HOY)!
    expect(e).toEqual({ mes: '2026-10', real: 1300, previsto: 1000, diferencia: 300 })
  })
})
