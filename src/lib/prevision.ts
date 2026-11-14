/**
 * Previsión de cierre del mes en curso: lo gastado hasta hoy, los recibos y suscripciones que faltan
 * por llegar este mes y el gasto variable de los días que quedan: lo que se gastó de media en esos mismos
 * días en los meses anteriores (v0.36.0; antes, la media diaria del mes entero, que repartía por todo el
 * mes un cargo grande de primeros de mes y lo volvía a contar). Sin historia, el ritmo de este mes.
 */
import { sumarDias, sumarMeses } from './fechas'
import { fechaEfectiva, mesEfectivo } from './imputacion'
import { fijoYVariable, type Recurrente } from './recurrentes'
import { fechaDeLosDatos } from './extracto'
import { calcularTotales } from './resumen'
import { previstosPendientes } from './previstos'
import type { BaseDatos, EventoPrevisto } from './tipos'

const redondear = (n: number) => Math.round(n * 100) / 100
/** Primer mes con datos: casi siempre incompleto (el primer Excel empieza a mitad de mes) */
export const primerMes = (db: BaseDatos) => db.movimientos.reduce((min, m) => (mesEfectivo(m) < min ? mesEfectivo(m) : min), '9999-99')

const diasDelMes = (mes: string) => Number(sumarDias(sumarMeses(`${mes}-01`, 1), -1).slice(8, 10))

/** El movimiento cuenta después de ese día de su mes (lo imputado al mes siguiente cuenta el día 1) */
export const trasElDia = (m: { fecha_operacion: string; mes_imputacion?: string | null }, dia: number) => Number(fechaEfectiva(m).slice(8, 10)) > dia

/** Meses anteriores completos (hasta 3) que sirven de referencia: el primero importado suele empezar a mitad y no cuenta */
export function mesesDeReferencia(db: BaseDatos, mes: string): string[] {
  const primero = primerMes(db)
  return [1, 2, 3].map((i) => sumarMeses(`${mes}-01`, -i).slice(0, 7)).filter((p) => p > primero && db.movimientos.some((m) => mesEfectivo(m) === p))
}

export interface Prevision {
  gastado: number
  /** Recibos y suscripciones que se esperan antes de final de mes */
  pendientes: Recurrente[]
  recibos: number
  /** Gasto variable previsto para los días que quedan */
  variable: number
  total: number
  diasRestantes: number
  /** Gasto medio de los meses anteriores completos (hasta 3), para comparar */
  media: number | null
  /** Fecha del último dato importado: la previsión cuenta desde ahí */
  hasta: string
  /** Gastos previstos dados de alta (IBI, seguros) que faltan este mes */
  previstos: EventoPrevisto[]
  importePrevistos: number
}

/**
 * Recibos y suscripciones que faltan en el mes: activos, previstos después del último dato y hasta fin de
 * mes, y sin cargo este mes. Los que se pasan al mes siguiente (hipoteca de fin de mes) no cuentan en este.
 */
export function recibosPendientes(db: BaseDatos, mes: string, hasta: string, recurrentes: Recurrente[]): Recurrente[] {
  const porId = new Map(db.movimientos.map((m) => [m.id, m]))
  const fin = `${mes}-${String(diasDelMes(mes)).padStart(2, '0')}`
  return recurrentes.filter((r) => {
    if (!r.activo || r.proxima <= hasta || r.proxima > fin || r.ultima.startsWith(mes)) return false
    const ultimo = porId.get(r.ids[r.ids.length - 1])
    return !ultimo?.mes_imputacion
  })
}

export function preverCierre(db: BaseDatos, mes: string, hoy: string, recurrentes: Recurrente[]): Prevision | null {
  if (hoy.slice(0, 7) !== mes) return null
  const totalDias = diasDelMes(mes)
  // Hasta el último dato importado: los días sin importar se prevén como los que quedan
  const hasta = fechaDeLosDatos(db, hoy)
  const dia = hasta.startsWith(mes) ? Number(hasta.slice(8, 10)) : 0
  const diasRestantes = totalDias - dia
  const delMes = db.movimientos.filter((m) => mesEfectivo(m) === mes)
  const gastado = calcularTotales(delMes, db.categorias).gastos
  const variableHoy = Math.max(0, gastado - fijoYVariable(delMes, recurrentes).fijo)

  const fin = `${mes}-${String(totalDias).padStart(2, '0')}`
  const pendientes = recibosPendientes(db, mes, hasta, recurrentes)
  const recibos = redondear(pendientes.reduce((s, r) => s + r.importe, 0))

  // Gasto variable de lo que queda de mes: la media de lo gastado después de este día en hasta 3 meses
  // anteriores completos; sin ellos, el ritmo de este mes
  const previos = mesesDeReferencia(db, mes)
  let variable = redondear((dia ? variableHoy / dia : 0) * diasRestantes)
  let media: number | null = null
  if (previos.length) {
    const datos = previos.map((p) => {
      const movs = db.movimientos.filter((m) => mesEfectivo(m) === p)
      const resto = movs.filter((m) => trasElDia(m, dia))
      return { gastos: calcularTotales(movs, db.categorias).gastos, resto: Math.max(0, calcularTotales(resto, db.categorias).gastos - fijoYVariable(resto, recurrentes).fijo) }
    })
    variable = redondear(datos.reduce((s, d) => s + d.resto, 0) / datos.length)
    media = redondear(datos.reduce((s, d) => s + d.gastos, 0) / datos.length)
  }
  const previstos = previstosPendientes(db, hasta, fin, hoy, recurrentes).filter((e) => e.importe < 0)
  const importePrevistos = redondear(-previstos.reduce((s, e) => s + e.importe, 0))
  return { gastado, pendientes, recibos, variable, total: redondear(gastado + recibos + variable + importePrevistos), diasRestantes, media, hasta, previstos, importePrevistos }
}
