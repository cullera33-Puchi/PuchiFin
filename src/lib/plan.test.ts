import { describe, expect, it } from 'vitest'
import { datosIniciales, ErrorDatos, guardarCompromiso, guardarEvento, guardarNomina, guardarPresupuesto } from '../datos/operaciones'
import { calcularPlan, efectoMesCerrado, importeNomina, preverIngresos } from './plan'
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

describe('nóminas previstas', () => {
  const nomina = (db: BaseDatos, nombre: string, neto: number, extra: Partial<Parameters<typeof guardarNomina>[1]> = {}) =>
    guardarNomina(db, { nombre, neto_mensual: neto, pagas: [], desde: null, hasta: null, incluida: true, ...extra })

  it('la nómina guardada sustituye al historial de nómina, con sus pagas extra', () => {
    expect(calcularPlan(nomina(crear(20000), 'Mi nómina', 3000), HOY).plan!.pagos[0].pago).toBe(10500)
    const db = nomina(crear(20000), 'Mi nómina', 2800, { pagas: [{ mes: 6, importe: 2800 }, { mes: 12, importe: 2800 }] })
    // 5.000 + 400 (medio noviembre) + 3.600 (diciembre) + 5 x 800 + 3.600 (junio) + 800 (julio) = 17.400
    expect(calcularPlan(db, HOY).plan!.pagos[0].pago).toBe(14400)
    const ing = preverIngresos(db, HOY)!
    expect(ing.meses[0]).toMatchObject({ mes: '2026-12', otros: 0, total: 5600 })
    expect(ing.mediaNomina).toBe(3000)
  })

  it('una segunda nómina se simula sin guardarla como incluida, desde el mes en que empieza', () => {
    const db = nomina(crear(20000), 'Nómina 2', 1000, { desde: '2027-01', incluida: false })
    const id = db.ajustes.nominas[0].id
    expect(calcularPlan(db, HOY).plan!.pagos[0].pago).toBe(10500)
    // Sin nómina propia guardada, el historial sigue mandando y la simulada se suma: 7 meses x 1.000
    const sim = calcularPlan(db, HOY, { ahorroExtra: 0, recorte: null, nominas: { [id]: true } }).plan!
    expect(sim.pagos[0].pago).toBe(17500)
    expect(sim.serie[0].mes).toBe('2026-11')
    expect(sim.serie).toHaveLength(25)
    expect(preverIngresos(db, HOY, { ahorroExtra: 0, recorte: null, nominas: { [id]: true } })!.meses[1]).toMatchObject({ mes: '2027-01', total: 4000 })
  })

  it('importe de un mes: mensual más paga extra, dentro de sus fechas', () => {
    const n = { id: 'n', nombre: 'X', neto_mensual: 2000, pagas: [{ mes: 7, importe: 1500 }], desde: '2027-03', hasta: '2027-12', incluida: true }
    expect(importeNomina(n, '2027-02')).toBe(0)
    expect(importeNomina(n, '2027-07')).toBe(3500)
    expect(importeNomina(n, '2028-01')).toBe(0)
  })

  it('comprobaciones al guardar', () => {
    const db = nomina(db0, 'Mi nómina', 2000)
    expect(() => nomina(db, 'mi nómina', 2000)).toThrow(ErrorDatos)
    expect(() => nomina(db0, '', 2000)).toThrow(ErrorDatos)
    expect(() => nomina(db0, 'X', 0)).toThrow(ErrorDatos)
    expect(() => nomina(db0, 'X', 1000, { pagas: [{ mes: 6, importe: 1 }, { mes: 6, importe: 2 }] })).toThrow(ErrorDatos)
    expect(() => nomina(db0, 'X', 1000, { desde: '2027-05', hasta: '2027-01' })).toThrow(ErrorDatos)
    expect(() => nomina(db0, 'ES9121000418450200051332', 1000)).toThrow(ErrorDatos)
  })
})
