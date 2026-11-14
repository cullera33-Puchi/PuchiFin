import { describe, expect, it } from 'vitest'
import { datosIniciales, ErrorDatos, guardarCompromiso, guardarEvento, guardarNomina, guardarPresupuesto, guardarPrevision } from '../datos/operaciones'
import { calcularPlan, comprobarPrevision, efectoMesCerrado, evolucionAnual, hayCrecimiento, haySimulacion, importeNomina, preverIngresos, SIN_SIMULACION } from './plan'
import type { BaseDatos, Movimiento, NominaBruta } from './tipos'

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
  // Sin inflación: estos tests comprueban la mecánica del plan; el crecimiento tiene los suyos al final
  const db = { ...db0, ajustes: { ...db0.ajustes, prevision: { inflacion: 0, sin_inflacion: [] } }, movimientos }
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

  it('simulación: otra deuda pendiente u otro colchón, sin cambiar lo guardado', () => {
    const db = crear(20000)
    // 13.500 en julio: con un colchón de 1.000, el pago sube a 12.500
    expect(calcularPlan(db, HOY, { ahorroExtra: 0, recorte: null, colchon: 1000 }).plan!.pagos[0].pago).toBe(12500)
    const otra = calcularPlan(db, HOY, { ahorroExtra: 0, recorte: null, deuda: 8000 }).plan!
    expect(otra.deudaPendiente).toBe(8000)
    expect(otra.pagos).toHaveLength(1)
    expect(otra.saldadaEn).toBe(2027)
    expect(calcularPlan(db, HOY).plan!.deudaPendiente).toBe(20000)
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
    guardarNomina(db, { nombre, neto_mensual: neto, pagas: [], desde: null, hasta: null, incluida: true, bonus: null, ...extra } as Parameters<typeof guardarNomina>[1])

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
    const n = { id: 'n', nombre: 'X', neto_mensual: 2000, pagas: [{ mes: 7, importe: 1500 }], desde: '2027-03', hasta: '2027-12', incluida: true, bonus: null }
    expect(importeNomina(n, '2027-02')).toBe(0)
    expect(importeNomina(n, '2027-07')).toBe(3500)
    expect(importeNomina(n, '2028-01')).toBe(0)
  })

  it('bonus aparte: cuenta en su mes y se puede quitar en la simulación', () => {
    const db = nomina(crear(20000), 'Mi nómina', 3000, { bonus: { mes: 7, importe: 6000 } })
    const id = db.ajustes.nominas[0].id
    // El bonus de julio de 2027 entra antes del pago de ese mes
    expect(calcularPlan(db, HOY).plan!.pagos[0].pago).toBe(16500)
    expect(calcularPlan(db, HOY, { ahorroExtra: 0, recorte: null, bonus: { [id]: false } }).plan!.pagos[0].pago).toBe(10500)
    const julio = preverIngresos(db, HOY)!.meses.find((m) => m.mes === '2027-07')!
    expect(julio.nominas[0]).toMatchObject({ importe: 9000, bonus: 6000 })
    expect(() => nomina(crear(20000), 'X', 1000, { bonus: { mes: 13, importe: 1 } })).toThrow(ErrorDatos)
    expect(() => nomina(crear(20000), 'X', 1000, { bonus: { mes: 7, importe: 0 } })).toThrow(ErrorDatos)
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

describe('pago ya hecho en la ventana', () => {
  it('si este verano ya se pagó en junio, julio no lleva otro pago previsto', () => {
    const db = crear(20000)
    db.movimientos.push(mov('2027-06-10', -4000, null, { cuenta_id: db.cuentas[1].id, tipo: 'pago_deuda' }))
    db.movimientos.push(mov('2027-06-15', 10, null, { cuenta_id: db.cuentas[1].id, tipo: 'traspaso_interno', saldo: 5000 }))
    const p = calcularPlan(db, '2027-06-15').plan!
    expect(p.pagos.some((x) => x.anio === 2027)).toBe(false)
    expect(p.pagos[0].anio).toBe(2028)
  })
})

describe('crecimiento: inflación del gasto y subidas de sueldo (v0.39.0)', () => {
  const hipoteca = cat('Vivienda > Hipoteca')
  const bruta: NominaBruta = {
    fijo_anual: 60000, pagas: 12, meses_extra: [], bonus_objetivo: 10000, bonus_consecucion: 80, bonus_mes: 8,
    flexible_mes: 0, especie_mes: 0, subida_anual: 10, subida_mes: 9, vigente_desde: '2026-09', hijos: [], tipo_actual: null,
  }
  const conNomina = (db: BaseDatos, extra: Partial<NominaBruta> = {}) =>
    guardarNomina(db, { nombre: 'Mi nómina', neto_mensual: 3000, pagas: [], desde: null, hasta: null, incluida: true, bonus: null, bruto: { ...bruta, ...extra } })

  it('la inflación sube el gasto y baja el pago; la hipoteca a tipo fijo no sube', () => {
    const plano = crear(20000)
    const todo = guardarPrevision(plano, { inflacion: 3, sin_inflacion: [] })
    const sinHipoteca = guardarPrevision(plano, { inflacion: 3, sin_inflacion: [hipoteca] })
    const pago = (db: BaseDatos) => calcularPlan(db, HOY).plan!.pagos[0].pago
    expect(pago(plano)).toBe(10500)
    expect(pago(todo)).toBeLessThan(pago(sinHipoteca))
    expect(pago(sinHipoteca)).toBeLessThan(10500)
    // De noviembre a julio, el supermercado (1.000 al mes) sube poco más de 80 € en total; la hipoteca, nada
    expect(10500 - pago(sinHipoteca)).toBeGreaterThan(60)
    expect(10500 - pago(sinHipoteca)).toBeLessThan(110)
    expect(10500 - pago(todo)).toBeCloseTo((10500 - pago(sinHipoteca)) * 2, 0)
    // En la simulación se quita o se cambia
    expect(calcularPlan(todo, HOY, { ...SIN_SIMULACION, sinCrecimiento: true }).plan!.pagos[0].pago).toBe(10500)
    expect(calcularPlan(plano, HOY, { ...SIN_SIMULACION, inflacion: 3 }).plan!.pagos[0].pago).toBe(pago(todo))
    expect(() => guardarPrevision(plano, { inflacion: 30, sin_inflacion: [] })).toThrow(ErrorDatos)
    expect(() => guardarPrevision(plano, { inflacion: 3, sin_inflacion: [cat('Ingresos > Nómina')] })).toThrow(ErrorDatos)
  })

  it('la nómina en bruto entra con su neto calculado, el bonus de agosto y la subida de septiembre', () => {
    const db = conNomina(crear(20000))
    const ing = preverIngresos(db, HOY)!
    const mes = (m: string) => ing.meses.find((x) => x.mes === m)!
    // Un mes normal de 60.000 en 12 pagas ronda los 3.400 netos
    expect(mes('2027-03').total).toBeGreaterThan(3300)
    expect(mes('2027-03').total).toBeLessThan(3500)
    // Agosto: el 80 % de 10.000 brutos, ya neto
    expect(mes('2027-08').nominas[0].bonus).toBeGreaterThan(5000)
    expect(mes('2027-08').nominas[0].bonus).toBeLessThan(6500)
    // Desde septiembre, el 10 % más de bruto deja menos de un 10 % más de neto
    const subida = mes('2027-10').total / mes('2027-07').total
    expect(subida).toBeGreaterThan(1.03)
    expect(subida).toBeLessThan(1.1)
  })

  it('la simulación cambia la subida y el porcentaje del bonus, o lo deja todo plano', () => {
    const db = conNomina(crear(20000))
    const total = (sim: Parameters<typeof preverIngresos>[2], m: string) => preverIngresos(db, HOY, sim)!.meses.find((x) => x.mes === m)!
    expect(total({ ...SIN_SIMULACION, subida: 0 }, '2027-10').total).toBeLessThan(total(SIN_SIMULACION, '2027-10').total)
    expect(total({ ...SIN_SIMULACION, sinCrecimiento: true }, '2027-10').total).toBe(total({ ...SIN_SIMULACION, subida: 0 }, '2027-10').total)
    expect(total({ ...SIN_SIMULACION, consecucion: 100 }, '2027-08').nominas[0].bonus).toBeGreaterThan(total(SIN_SIMULACION, '2027-08').nominas[0].bonus)
    expect(total({ ...SIN_SIMULACION, bonus: { [db.ajustes.nominas[0].id]: false } }, '2027-08').nominas[0].bonus).toBe(0)
    expect(haySimulacion(db, SIN_SIMULACION)).toBe(false)
    expect(haySimulacion(db, { ...SIN_SIMULACION, sinCrecimiento: true })).toBe(true)
    expect(haySimulacion(db, { ...SIN_SIMULACION, consecucion: 90 })).toBe(true)
  })

  it('con subidas, la deuda se salda antes o igual que sin ellas', () => {
    const db = conNomina(crear(60000))
    const con = calcularPlan(db, HOY).plan!
    const sin = calcularPlan(db, HOY, { ...SIN_SIMULACION, sinCrecimiento: true }).plan!
    expect(hayCrecimiento(db)).toBe(true)
    expect(hayCrecimiento(crear(20000))).toBe(false)
    expect(con.saldadaEn!).toBeLessThanOrEqual(sin.saldadaEn!)
    expect(con.pagos.reduce((s, p) => s + p.pago, 0)).toBe(60000)
  })

  it('comprobaciones de la nómina en bruto', () => {
    expect(() => conNomina(db0, { fijo_anual: 0 })).toThrow(ErrorDatos)
    expect(() => conNomina(db0, { pagas: 14 as never, meses_extra: [6] })).toThrow(/pagas extra/)
    expect(() => conNomina(db0, { bonus_consecucion: 300 })).toThrow(ErrorDatos)
    expect(() => conNomina(db0, { hijos: [20] })).toThrow(/nacimiento/)
    expect(conNomina(db0, { hijos: [2024, 2020] }).ajustes.nominas[0].bruto!.hijos).toEqual([2020, 2024])
  })
})

describe('de dónde sale el ahorro previsto y evolución por años (v0.40.0)', () => {
  const bruta: NominaBruta = {
    fijo_anual: 60000, pagas: 12, meses_extra: [], bonus_objetivo: 10000, bonus_consecucion: 80, bonus_mes: 8,
    flexible_mes: 0, especie_mes: 0, subida_anual: 10, subida_mes: 9, vigente_desde: '2026-09', hijos: [], tipo_actual: null,
  }
  const conBruta = (db: BaseDatos) => guardarNomina(db, { nombre: 'Mi nómina', neto_mensual: 3000, pagas: [], desde: null, hasta: null, incluida: true, bonus: null, bruto: bruta })

  it('sin nóminas guardadas, lo previsto coincide con el historial y solo avisa de los pocos meses', () => {
    const c = comprobarPrevision(crear(20000), HOY)!
    expect(c.meses).toBe(3)
    expect(c.real).toEqual({ nominas: 3000, otros: 0, gastos: 2000, ahorro: 1000 })
    expect(c.previsto).toMatchObject({ nominas: 0, otros: 3000, gastos: 2000, puntuales: 0, ahorro: 1000 })
    expect(c.presupuestos).toBe(0)
    expect(c.avisos).toHaveLength(1)
    expect(c.avisos[0]).toMatch(/3 meses cerrados/)
  })

  it('las partidas previstas suman el ahorro previsto, que es el de la previsión de ingresos', () => {
    const db = guardarEvento(conBruta(crear(20000)), { fecha: '2027-03-10', concepto: 'IBI', importe: -600, categoria_id: null })
    const sim = { ...SIN_SIMULACION, ahorroExtra: 100 }
    const c = comprobarPrevision(db, HOY, sim)!
    const p = c.previsto
    expect(p.nominas + p.otros - p.gastos + p.puntuales + p.extra).toBeCloseTo(p.ahorro, 0)
    expect(p.ahorro).toBeCloseTo(preverIngresos(db, HOY, sim)!.ahorroMensual, 1)
    expect(p.puntuales).toBe(-50)
    expect(p.otros).toBe(0)
  })

  it('avisa si las nóminas previstas superan al historial, si hay otros ingresos de más y si el presupuesto queda por debajo del gasto', () => {
    const db = conBruta(crear(20000))
    // 60.000 brutos y un bonus de 8.000 dan más neto que los 3.000 del historial
    expect(comprobarPrevision(db, HOY)!.avisos.some((a) => /nóminas previstas dan/.test(a))).toBe(true)
    // La nómina del historial sin su categoría: se cuenta como otros ingresos, además de la nómina guardada
    const sinCategoria = { ...db, movimientos: db.movimientos.map((m) => (m.importe === 3000 ? { ...m, categoria_id: cat('Ingresos > Otros ingresos') } : m)) }
    const c = comprobarPrevision(sinCategoria, HOY)!
    expect(c.previsto.otros).toBe(3000)
    expect(c.avisos.some((a) => /se están contando dos veces/.test(a))).toBe(true)
    // Presupuesto de 600 en una categoría en la que se gastan 1.000
    const conPresupuesto = guardarPresupuesto(db, cat('Alimentación'), 600)
    const p = comprobarPrevision(conPresupuesto, HOY)!
    expect(p.presupuestos).toBe(400)
    expect(p.previsto.gastos).toBe(1600)
    expect(p.avisos.some((a) => /400 € al mes menos de lo que gastas/.test(a))).toBe(true)
    expect(comprobarPrevision(db, HOY)!.avisos.some((a) => /presupuestos/.test(a))).toBe(false)
  })

  it('por años: el bruto sube un 10 % al año, el neto sube menos y la retención crece', () => {
    const db = conBruta(crear(20000))
    const e = evolucionAnual(db, HOY)!
    expect(e.map((x) => x.anio)).toEqual([2026, 2027, 2028, 2029, 2030, 2031])
    // Del año de los datos, solo los ingresos
    expect(e[0]).toMatchObject({ otros: null, gastos: null, ahorro: null })
    expect(e[0].bruto).toBeGreaterThan(60000)
    // 2027: ocho meses a 60.000 y cuatro a 66.000, más el 80 % del bonus de 10.000
    expect(e[1].bruto).toBe(70000)
    expect(e[1].bonusBruto).toBe(8000)
    expect(e[1].neto).toBeCloseTo(e[1].bruto! - e[1].seguridadSocial - e[1].irpf, 0)
    expect(e[2].bruto).toBeCloseTo(77000, 0)
    const subeBruto = e[2].bruto! / e[1].bruto!
    const subeNeto = e[2].neto / e[1].neto
    expect(subeNeto).toBeGreaterThan(1)
    expect(subeNeto).toBeLessThan(subeBruto)
    expect(e[2].retencion!).toBeGreaterThan(e[1].retencion!)
    // El ahorro del año es lo que entra menos lo que se gasta
    expect(e[1].ahorro!).toBeCloseTo(e[1].neto + e[1].otros! - e[1].gastos!, 0)
    expect(e[1].gastos).toBe(24000)
    // Sin el bonus en la simulación, el bruto y el neto bajan
    const sinBonus = evolucionAnual(db, HOY, { ...SIN_SIMULACION, bonus: { [db.ajustes.nominas[0].id]: false } })!
    expect(sinBonus[1].bruto).toBe(62000)
    expect(sinBonus[1].neto).toBeLessThan(e[1].neto)
    // Con una nómina en neto no hay bruto ni retención
    const neta = guardarNomina(crear(20000), { nombre: 'Mi nómina', neto_mensual: 3000, pagas: [], desde: null, hasta: null, incluida: true, bonus: null })
    expect(evolucionAnual(neta, HOY)![1]).toMatchObject({ bruto: null, retencion: null, neto: 36000 })
  })
})
