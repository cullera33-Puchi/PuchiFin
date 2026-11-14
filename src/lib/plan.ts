/**
 * Plan de pagos de la deuda familiar (apartado 10). Supuesto: el ahorro de cada mes acaba en la cuenta
 * de ahorro (Cuenta 2) con los traspasos habituales, y la principal mantiene su nivel. Por eso se
 * proyecta el ahorro total, se suma al saldo de la cuenta de ahorro y, en el mes de referencia de cada
 * año (julio), se paga todo lo que supere el colchón, sin pasar de la deuda pendiente.
 *
 * Ingresos previstos de cada mes: los del mismo mes del año anterior (nóminas y pagas extra en su mes)
 * o, sin un año de datos, la media de los meses cerrados. Gastos previstos: el presupuesto de cada
 * categoría o, si no lo tiene, su media. Más los gastos e ingresos previstos dados de alta.
 */
import { anadirA } from './agrupar'
import { fechaDeLosDatos, gastoPorCategoria } from './extracto'
import { sumarDias, sumarMeses } from './fechas'
import { mesEfectivo } from './imputacion'
import { estadoEventos } from './previstos'
import { primerMes } from './prevision'
import { calcularTotales } from './resumen'
import { cuadrarCuenta } from './saldos'
import { calcularPosicion } from './posicion'
import type { BaseDatos, Compromiso, Cuenta, Movimiento, Nomina } from './tipos'

const redondear = (n: number) => Math.round(n * 100) / 100
const siguienteMes = (mes: string) => sumarMeses(`${mes}-01`, 1).slice(0, 7)
const diasDelMes = (mes: string) => Number(sumarDias(sumarMeses(`${mes}-01`, 1), -1).slice(8, 10))
const numMes = (mes: string) => Number(mes.slice(5, 7))

export interface Simulacion {
  /** Euros más (o menos) de ahorro cada mes */
  ahorroExtra: number
  /** Recorte de una categoría de gasto, en porcentaje */
  recorte: { categoria_id: string; porcentaje: number } | null
  /** Nóminas que se suman o se quitan solo en la simulación (por id); sin dato, lo guardado */
  nominas?: Record<string, boolean>
}

export const SIN_SIMULACION: Simulacion = { ahorroExtra: 0, recorte: null }

/** Neto de una nómina en un mes (AAAA-MM): el mensual más la paga extra de ese mes, dentro de sus fechas */
export function importeNomina(n: Nomina, mes: string): number {
  if ((n.desde && mes < n.desde) || (n.hasta && mes > n.hasta)) return 0
  return n.neto_mensual + n.pagas.filter((p) => p.mes === numMes(mes)).reduce((s, p) => s + p.importe, 0)
}

/** Nóminas que cuentan: las incluidas, con lo que cambie la simulación */
export const nominasActivas = (db: BaseDatos, sim: Simulacion) => (db.ajustes.nominas ?? []).filter((n) => sim.nominas?.[n.id] ?? n.incluida)

/** Categorías de nómina: Ingresos > Nómina (y sus subcategorías, si las hubiera) */
function idsNomina(db: BaseDatos): Set<string> {
  const ids = new Set<string>()
  for (const c of db.categorias) if (c.naturaleza === 'ingreso' && c.nombre.trim().toLowerCase() === 'nómina') ids.add(c.id)
  for (const c of db.categorias) if (c.padre_id && ids.has(c.padre_id)) ids.add(c.id)
  return ids
}

export interface PagoPrevisto {
  anio: number
  mes: string
  /** Saldo previsto de la cuenta de ahorro antes del pago */
  saldo: number
  pago: number
  deudaTras: number
}

export interface Plan {
  compromiso: Compromiso
  cuenta: Cuenta
  saldo: number
  fechaSaldo: string
  pagado: number
  deudaPendiente: number
  /** Pagos de deuda reales por año */
  pagosReales: { anio: number; importe: number }[]
  pagos: PagoPrevisto[]
  /** Año del pago que la deja a cero (null si no se salda en 30 años) */
  saldadaEn: number | null
  /** Ahorro medio previsto de los 12 próximos meses */
  ahorroMensual: number
  /** Meses cerrados en los que se basa la previsión */
  mesesBase: number
  /** Capital y saldo de la cuenta de ahorro previstos a final de cada mes (el actual y 24 más), ya descontados los pagos */
  serie: PuntoCapital[]
}

export interface PuntoCapital {
  mes: string
  saldo: number
  capital: number
}

export type ResultadoPlan = { plan: Plan; falta: null } | { plan: null; falta: 'sin_compromiso' | 'sin_deuda' | 'sin_cuenta' | 'sin_saldo' | 'sin_historia' }

/** Ingresos y gasto por categoría raíz de cada mes, de una pasada */
interface Estadistica {
  ingresos: number
  /** De esos ingresos, los de nómina */
  nomina: number
  gastos: Map<string | null, number>
}

function estadisticas(db: BaseDatos): Map<string, Estadistica> {
  const porMes = new Map<string, Movimiento[]>()
  for (const m of db.movimientos) anadirA(porMes, mesEfectivo(m), m)
  const nomina = idsNomina(db)
  const res = new Map<string, Estadistica>()
  for (const [mes, movs] of porMes) {
    let n = 0
    for (const m of movs) if (m.tipo === 'normal' && m.categoria_id && nomina.has(m.categoria_id)) n += m.importe
    res.set(mes, { ingresos: calcularTotales(movs, db.categorias).ingresos, nomina: redondear(n), gastos: gastoPorCategoria(movs, db.categorias) })
  }
  return res
}

export interface IngresoNomina {
  id: string
  nombre: string
  importe: number
}

/**
 * Modelo de previsión con los meses cerrados anteriores a «base» (hasta 12, sin el primero importado,
 * que suele estar incompleto). Devuelve el ahorro previsto de un mes sin los previstos dados de alta.
 */
function modelo(db: BaseDatos, stats: Map<string, Estadistica>, base: string, sim: Simulacion) {
  const primero = primerMes(db)
  const cerrados = [...stats.keys()].filter((m) => m > primero && m < base).sort().slice(-12)
  const n = cerrados.length
  const mediaIngresos = n ? cerrados.reduce((s, m) => s + stats.get(m)!.ingresos, 0) / n : 0
  const mediaGasto = new Map<string | null, number>()
  for (const m of cerrados) for (const [k, v] of stats.get(m)!.gastos) mediaGasto.set(k, (mediaGasto.get(k) ?? 0) + v / n)
  const presupuestos = new Map(db.presupuestos.map((p) => [p.categoria_id, p]))
  for (const p of db.presupuestos) if (!mediaGasto.has(p.categoria_id)) mediaGasto.set(p.categoria_id, 0)

  // Con alguna nómina guardada como incluida, las nóminas mandan sobre el historial de nómina; el
  // resto de ingresos sigue saliendo del historial. Sin ninguna, todo sale del historial y las
  // simuladas se suman.
  const reemplaza = (db.ajustes.nominas ?? []).some((x) => x.incluida)
  const activas = nominasActivas(db, sim)
  const mediaNomina = n ? cerrados.reduce((s, m) => s + stats.get(m)!.nomina, 0) / n : 0
  const historico = (mes: string) => {
    const haceUnAno = sumarMeses(`${mes}-01`, -12).slice(0, 7)
    const st = cerrados.includes(haceUnAno) ? stats.get(haceUnAno)! : null
    const total = st ? st.ingresos : mediaIngresos
    return reemplaza ? total - (st ? st.nomina : mediaNomina) : total
  }
  const desglose = (mes: string) => {
    const nominas: IngresoNomina[] = activas.map((x) => ({ id: x.id, nombre: x.nombre, importe: importeNomina(x, mes) })).filter((x) => x.importe > 0)
    return { nominas, otros: historico(mes) }
  }
  const ingresos = (mes: string) => {
    const d = desglose(mes)
    return d.otros + d.nominas.reduce((s, x) => s + x.importe, 0)
  }
  const gastos = (mes: string) => {
    let total = 0
    for (const [k, media] of mediaGasto) {
      const p = k ? presupuestos.get(k) : undefined
      const presupuesto = p ? (p.excepciones[mes] ?? p.importe_mensual) : 0
      let g = presupuesto > 0 ? presupuesto : media
      if (sim.recorte && k === sim.recorte.categoria_id) g *= 1 - sim.recorte.porcentaje / 100
      total += g
    }
    return total
  }
  return { meses: n, desglose, ingresos, gastos, ahorro: (mes: string) => ingresos(mes) - gastos(mes) + sim.ahorroExtra }
}

/** Deuda pendiente y pagos reales: los movimientos de tipo Pago de deuda desde la fecha de referencia */
function pagosDeDeuda(db: BaseDatos, c: Compromiso) {
  const porAnio = new Map<number, number>()
  for (const m of db.movimientos)
    if (m.tipo === 'pago_deuda' && m.importe < 0 && m.fecha_operacion >= c.fecha_referencia) {
      const a = Number(m.fecha_operacion.slice(0, 4))
      porAnio.set(a, redondear((porAnio.get(a) ?? 0) - m.importe))
    }
  const pagado = redondear([...porAnio.values()].reduce((s, x) => s + x, 0))
  return { pagado, pagosReales: [...porAnio].map(([anio, importe]) => ({ anio, importe })).sort((a, b) => a.anio - b.anio) }
}

export function calcularPlan(db: BaseDatos, hoy: string, sim: Simulacion = SIN_SIMULACION): ResultadoPlan {
  const compromiso = db.compromisos.find((c) => c.activo)
  if (!compromiso) return { plan: null, falta: 'sin_compromiso' }
  if (!(compromiso.deuda_inicial > 0)) return { plan: null, falta: 'sin_deuda' }
  const cuenta = db.cuentas.find((c) => c.id === compromiso.cuenta_colchon_id)
  if (!cuenta) return { plan: null, falta: 'sin_cuenta' }
  const cuadre = cuadrarCuenta(db.movimientos.filter((m) => m.cuenta_id === cuenta.id))
  if (cuadre.saldoBanco === null || !cuadre.fecha) return { plan: null, falta: 'sin_saldo' }

  const stats = estadisticas(db)
  const datos = fechaDeLosDatos(db, hoy)
  const mesDatos = datos.slice(0, 7)
  const mod = modelo(db, stats, mesDatos, sim)
  if (!mod.meses) return { plan: null, falta: 'sin_historia' }

  const { pagado, pagosReales } = pagosDeDeuda(db, compromiso)
  const deudaPendiente = redondear(Math.max(0, compromiso.deuda_inicial - pagado))
  // Previstos pendientes por mes (con su signo)
  const puntuales = new Map<string, number>()
  for (const e of estadoEventos(db, hoy)) if (e.estado === 'pendiente') puntuales.set(e.evento.fecha.slice(0, 7), (puntuales.get(e.evento.fecha.slice(0, 7)) ?? 0) + e.evento.importe)

  const pagadoEnVentana = (anio: number) =>
    db.movimientos.some(
      (m) =>
        m.tipo === 'pago_deuda' &&
        m.importe < 0 &&
        Number(m.fecha_operacion.slice(0, 4)) === anio &&
        numMes(m.fecha_operacion) >= compromiso.ventana_mes_inicio &&
        numMes(m.fecha_operacion) <= compromiso.ventana_mes_fin,
    )
  // El mes de los datos: si ya ha pasado el de referencia pero la ventana sigue abierta y aún no se ha
  // pagado, el pago se prevé este mes; los demás años, en el mes de referencia
  const esMesDePago = (mes: string) => {
    const n = numMes(mes)
    if (mes === mesDatos) return n >= compromiso.mes_referencia && n <= compromiso.ventana_mes_fin && !pagadoEnVentana(Number(mes.slice(0, 4)))
    return n === compromiso.mes_referencia
  }

  const proximos = Array.from({ length: 12 }, (_, i) => sumarMeses(`${mesDatos}-01`, i + 1).slice(0, 7))
  let saldo = cuadre.saldoBanco
  let deuda = deudaPendiente
  const pagos: PagoPrevisto[] = []
  const capitalHoy = calcularPosicion(db)?.capital ?? cuadre.saldoBanco
  const serie: PuntoCapital[] = []
  let mes = mesDatos
  // Hasta saldarla y, como mínimo, dos años para ver el capital
  for (let i = 0; i < 30 * 12 && (deuda > 0 || i <= 24); i++, mes = siguienteMes(mes)) {
    // Del mes de los datos, solo los días que quedan (el saldo de la cuenta sigue igual hasta su último dato)
    const parte = i === 0 ? (diasDelMes(mes) - Number(datos.slice(8, 10))) / diasDelMes(mes) : 1
    const ahorro = mod.ahorro(mes) * Math.max(0, parte) + (puntuales.get(mes) ?? 0)
    saldo += ahorro
    if (deuda > 0 && esMesDePago(mes)) {
      const pago = redondear(Math.min(deuda, Math.max(0, saldo - compromiso.colchon)))
      deuda = redondear(deuda - pago)
      saldo -= pago
      pagos.push({ anio: Number(mes.slice(0, 4)), mes, saldo: redondear(saldo + pago), pago, deudaTras: deuda })
    }
    if (i <= 24) serie.push({ mes, saldo: redondear(saldo), capital: redondear(capitalHoy + saldo - cuadre.saldoBanco) })
  }
  return {
    falta: null,
    plan: {
      compromiso,
      cuenta,
      saldo: cuadre.saldoBanco,
      fechaSaldo: cuadre.fecha,
      pagado,
      deudaPendiente,
      pagosReales,
      pagos,
      saldadaEn: deuda <= 0 && pagos.length ? pagos[pagos.length - 1].anio : deudaPendiente === 0 ? (pagosReales.at(-1)?.anio ?? Number(mesDatos.slice(0, 4))) : null,
      ahorroMensual: redondear(proximos.reduce((s, m) => s + mod.ahorro(m) + (puntuales.get(m) ?? 0), 0) / 12),
      mesesBase: mod.meses,
      serie,
    },
  }
}

export interface MesIngresos {
  mes: string
  nominas: IngresoNomina[]
  /** Otros ingresos, según el historial (y la nómina, si no hay ninguna guardada como incluida) */
  otros: number
  total: number
}

/**
 * Previsión de ingresos de los 12 próximos meses (desde el siguiente al de los datos) y capital previsto,
 * sin pagos de deuda: el de hoy más el ahorro previsto de cada mes. Null sin un mes cerrado de datos.
 */
export function preverIngresos(db: BaseDatos, hoy: string, sim: Simulacion = SIN_SIMULACION): { meses: MesIngresos[]; ahorroMensual: number; capitalHoy: number | null; capital12: number | null; mediaNomina: number | null } | null {
  const stats = estadisticas(db)
  const datos = fechaDeLosDatos(db, hoy)
  const mesDatos = datos.slice(0, 7)
  const mod = modelo(db, stats, mesDatos, sim)
  if (!mod.meses) return null
  const meses = Array.from({ length: 12 }, (_, i) => {
    const mes = sumarMeses(`${mesDatos}-01`, i + 1).slice(0, 7)
    const d = mod.desglose(mes)
    const otros = redondear(Math.max(0, d.otros))
    return { mes, nominas: d.nominas, otros, total: redondear(otros + d.nominas.reduce((s, x) => s + x.importe, 0)) }
  })
  const puntuales = new Map<string, number>()
  for (const e of estadoEventos(db, hoy)) if (e.estado === 'pendiente') puntuales.set(e.evento.fecha.slice(0, 7), (puntuales.get(e.evento.fecha.slice(0, 7)) ?? 0) + e.evento.importe)
  const resto = (diasDelMes(mesDatos) - Number(datos.slice(8, 10))) / diasDelMes(mesDatos)
  const ahorroDe = (mes: string) => mod.ahorro(mes) + (puntuales.get(mes) ?? 0)
  const capitalHoy = calcularPosicion(db)?.capital ?? null
  const suma12 = meses.reduce((s, m) => s + ahorroDe(m.mes), 0)
  // Media de nómina real de los meses cerrados, como referencia para darla de alta
  const primero = primerMes(db)
  const cerrados = [...stats.keys()].filter((m) => m > primero && m < mesDatos).sort().slice(-12)
  const conNomina = cerrados.filter((m) => stats.get(m)!.nomina > 0)
  return {
    meses,
    ahorroMensual: redondear(suma12 / 12),
    capitalHoy,
    capital12: capitalHoy === null ? null : redondear(capitalHoy + mod.ahorro(mesDatos) * Math.max(0, resto) + (puntuales.get(mesDatos) ?? 0) + suma12),
    mediaNomina: conNomina.length ? redondear(conNomina.reduce((s, m) => s + stats.get(m)!.nomina, 0) / conNomina.length) : null,
  }
}

/**
 * Efecto del último mes cerrado en el pago del próximo verano: ahorro real frente al que se preveía
 * para ese mes con los meses anteriores. Lo que se ahorra de más va entero al pago.
 */
export function efectoMesCerrado(db: BaseDatos, hoy: string): { mes: string; real: number; previsto: number; diferencia: number } | null {
  const mesDatos = fechaDeLosDatos(db, hoy).slice(0, 7)
  const mes = sumarMeses(`${mesDatos}-01`, -1).slice(0, 7)
  if (mes <= primerMes(db)) return null
  const stats = estadisticas(db)
  const mod = modelo(db, stats, mes, SIN_SIMULACION)
  const st = stats.get(mes)
  if (!mod.meses || !st) return null
  const delMes = db.movimientos.filter((m) => mesEfectivo(m) === mes)
  const real = calcularTotales(delMes, db.categorias).ahorro
  const puntuales = db.eventos_previstos.filter((e) => e.fecha.startsWith(mes)).reduce((s, e) => s + e.importe, 0)
  const previsto = redondear(mod.ahorro(mes) + puntuales)
  return { mes, real, previsto, diferencia: redondear(real - previsto) }
}
