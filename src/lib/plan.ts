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
import type { BaseDatos, Compromiso, Cuenta, Movimiento } from './tipos'

const redondear = (n: number) => Math.round(n * 100) / 100
const siguienteMes = (mes: string) => sumarMeses(`${mes}-01`, 1).slice(0, 7)
const diasDelMes = (mes: string) => Number(sumarDias(sumarMeses(`${mes}-01`, 1), -1).slice(8, 10))
const numMes = (mes: string) => Number(mes.slice(5, 7))

export interface Simulacion {
  /** Euros más (o menos) de ahorro cada mes */
  ahorroExtra: number
  /** Recorte de una categoría de gasto, en porcentaje */
  recorte: { categoria_id: string; porcentaje: number } | null
}

export const SIN_SIMULACION: Simulacion = { ahorroExtra: 0, recorte: null }

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
}

export type ResultadoPlan = { plan: Plan; falta: null } | { plan: null; falta: 'sin_compromiso' | 'sin_deuda' | 'sin_cuenta' | 'sin_saldo' | 'sin_historia' }

/** Ingresos y gasto por categoría raíz de cada mes, de una pasada */
interface Estadistica {
  ingresos: number
  gastos: Map<string | null, number>
}

function estadisticas(db: BaseDatos): Map<string, Estadistica> {
  const porMes = new Map<string, Movimiento[]>()
  for (const m of db.movimientos) anadirA(porMes, mesEfectivo(m), m)
  const res = new Map<string, Estadistica>()
  for (const [mes, movs] of porMes) res.set(mes, { ingresos: calcularTotales(movs, db.categorias).ingresos, gastos: gastoPorCategoria(movs, db.categorias) })
  return res
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

  const ingresos = (mes: string) => {
    const haceUnAno = sumarMeses(`${mes}-01`, -12).slice(0, 7)
    return cerrados.includes(haceUnAno) ? stats.get(haceUnAno)!.ingresos : mediaIngresos
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
  return { meses: n, ahorro: (mes: string) => ingresos(mes) - gastos(mes) + sim.ahorroExtra }
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
  let mes = mesDatos
  for (let i = 0; i < 30 * 12 && deuda > 0; i++, mes = siguienteMes(mes)) {
    // Del mes de los datos, solo los días que quedan (el saldo de la cuenta sigue igual hasta su último dato)
    const parte = i === 0 ? (diasDelMes(mes) - Number(datos.slice(8, 10))) / diasDelMes(mes) : 1
    const ahorro = mod.ahorro(mes) * Math.max(0, parte) + (puntuales.get(mes) ?? 0)
    saldo += ahorro
    if (esMesDePago(mes)) {
      const pago = redondear(Math.min(deuda, Math.max(0, saldo - compromiso.colchon)))
      deuda = redondear(deuda - pago)
      saldo -= pago
      pagos.push({ anio: Number(mes.slice(0, 4)), mes, saldo: redondear(saldo + pago), pago, deudaTras: deuda })
    }
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
    },
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
