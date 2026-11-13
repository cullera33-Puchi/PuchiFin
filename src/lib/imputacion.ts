/**
 * Fecha efectiva de un movimiento: la de la operación o, si se imputa a otro mes (la nómina del 30
 * que es del mes siguiente, la hipoteca cargada el 31), el día 1 de ese mes. Todos los cálculos por
 * periodo (extracto, resúmenes, análisis) usan esta fecha.
 */
import { sumarMeses, ultimoDeMes } from './fechas'

export function fechaEfectiva(m: { fecha_operacion: string; mes_imputacion?: string | null }): string {
  return m.mes_imputacion ? `${m.mes_imputacion}-01` : m.fecha_operacion
}

export const mesEfectivo = (m: { fecha_operacion: string; mes_imputacion?: string | null }) => fechaEfectiva(m).slice(0, 7)

/** Cae en los últimos «dias» días de su mes */
export function finDeMes(fecha: string, dias: number): boolean {
  if (dias <= 0) return false
  const ultimo = Number(ultimoDeMes(fecha).slice(8, 10))
  return Number(fecha.slice(8, 10)) > ultimo - dias
}

export const mesSiguiente = (fecha: string) => sumarMeses(fecha, 1).slice(0, 7)
