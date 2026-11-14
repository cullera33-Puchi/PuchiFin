/**
 * Resumen del año (R5, v0.34.0): lo ahorrado, los mejores y peores meses, las categorías y comercios que
 * más pesan, el gasto fijo, el avance de la deuda y el capital al empezar y al acabar el año.
 */
import { rankingComercios, type LineaComercio } from './comercios'
import { evolucionMensual } from './extracto'
import { mesEfectivo } from './imputacion'
import { calcularInforme, type Porcion } from './informes'
import { calcularPlan } from './plan'
import { calcularPosicion } from './posicion'
import { detectarRecurrentes, fijoYVariable } from './recurrentes'
import type { Totales } from './resumen'
import type { BaseDatos } from './tipos'

export interface ResumenAnual {
  anio: string
  enCurso: boolean
  /** Meses con movimientos en el año */
  meses: number
  totales: Totales
  /** El año anterior (con los mismos días si el año está en curso); null sin datos */
  anterior: Totales | null
  mejorMes: { mes: string; ahorro: number } | null
  peorMes: { mes: string; ahorro: number } | null
  gastoMedioMes: number
  categorias: Porcion[]
  comercios: LineaComercio[]
  fijo: number
  /** Pagos de deuda hechos en el año y lo pendiente hoy (si hay deuda configurada) */
  deuda: { pagado: number; pendiente: number } | null
  /** Capital a final del año anterior y al final del año (o hoy) */
  capital: { inicio: number | null; fin: number } | null
}

const redondear = (n: number) => Math.round(n * 100) / 100

export function resumenAnual(db: BaseDatos, anio: string, hoy: string): ResumenAnual {
  const inf = calcularInforme(db, { escala: 'anio', clave: anio }, 'gasto', undefined, hoy)
  const delAnio = evolucionMensual(db).filter((m) => m.mes.startsWith(anio) && (m.ingresos || m.gastos))
  // Mejor y peor mes, solo entre los completos: sin el mes en curso ni el primero importado
  const primero = evolucionMensual(db)[0]?.mes
  const orden = delAnio.filter((m) => m.mes < hoy.slice(0, 7) && m.mes !== primero).sort((a, b) => b.ahorro - a.ahorro)
  const movs = db.movimientos.filter((m) => mesEfectivo(m).startsWith(anio))
  const plan = calcularPlan(db, hoy).plan
  const posicion = calcularPosicion(db, 36)
  const finAnio = posicion?.evolucion.filter((e) => e.mes.startsWith(anio)).at(-1)
  const inicio = posicion?.evolucion.find((e) => e.mes === `${Number(anio) - 1}-12`)
  return {
    anio,
    enCurso: hoy.startsWith(anio),
    meses: delAnio.length,
    totales: inf.totales,
    anterior: inf.totalesAnteriores.movimientos ? inf.totalesAnteriores : null,
    mejorMes: orden.length ? { mes: orden[0].mes, ahorro: orden[0].ahorro } : null,
    peorMes: orden.length > 1 ? { mes: orden.at(-1)!.mes, ahorro: orden.at(-1)!.ahorro } : null,
    gastoMedioMes: delAnio.length ? redondear(inf.totales.gastos / delAnio.length) : 0,
    categorias: inf.porciones.slice(0, 6),
    comercios: rankingComercios(inf.movimientos, -1, 'importe', 5),
    fijo: fijoYVariable(movs, detectarRecurrentes(db)).fijo,
    deuda: plan ? { pagado: plan.pagosReales.find((p) => String(p.anio) === anio)?.importe ?? 0, pendiente: plan.deudaPendiente } : null,
    capital: finAnio ? { inicio: inicio?.capital ?? null, fin: finAnio.capital } : null,
  }
}
