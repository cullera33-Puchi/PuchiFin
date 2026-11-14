/**
 * Presupuesto por categoría (apartado 9): cuánto se lleva gastado de cada presupuesto del mes, la
 * proyección a final de mes al ritmo actual y el estado (dentro, cerca del límite o superado).
 * Solo cuentan los movimientos de tipo Normal: los gastos de empleado, traspasos y pagos de deuda no
 * consumen presupuesto.
 */
import { sumarDias, sumarMeses } from './fechas'
import { mesEfectivo } from './imputacion'
import { fechaDeLosDatos } from './extracto'
import { primerMes } from './prevision'
import type { BaseDatos, Categoria } from './tipos'

const redondear = (n: number) => Math.round(n * 100) / 100

export type EstadoPresupuesto = 'dentro' | 'cerca' | 'superado'

export interface LineaPresupuesto {
  categoria: Categoria
  presupuesto: number
  gastado: number
  /** Al ritmo de lo que va de mes (solo el mes en curso y a partir del día 5) */
  proyeccion: number | null
  estado: EstadoPresupuesto
}

/** Gasto del mes por categoría: raíz (con sus subcategorías) o subcategoría */
function gastoDe(db: BaseDatos, mes: string, c: Categoria): number {
  const ids = new Set([c.id, ...(c.padre_id ? [] : db.categorias.filter((h) => h.padre_id === c.id).map((h) => h.id))])
  let total = 0
  for (const m of db.movimientos) if (m.tipo === 'normal' && m.categoria_id && ids.has(m.categoria_id) && mesEfectivo(m) === mes) total -= m.importe
  return redondear(total)
}

export function consumoPresupuestos(db: BaseDatos, mes: string, hoy: string): LineaPresupuesto[] {
  const umbral = (db.ajustes.umbral_aviso_presupuesto ?? 80) / 100
  // El ritmo se mide hasta el último dato importado
  const hasta = fechaDeLosDatos(db, hoy)
  const enCurso = hoy.slice(0, 7) === mes && hasta.startsWith(mes)
  const dia = Number(hasta.slice(8, 10))
  const diasMes = Number(sumarDias(sumarMeses(`${mes}-01`, 1), -1).slice(8, 10))
  const res: LineaPresupuesto[] = []
  for (const p of db.presupuestos) {
    const categoria = db.categorias.find((c) => c.id === p.categoria_id)
    if (!categoria || !categoria.activa) continue
    const presupuesto = p.excepciones[mes] ?? p.importe_mensual
    if (!(presupuesto > 0)) continue
    const gastado = gastoDe(db, mes, categoria)
    const proyeccion = enCurso && dia >= 5 ? redondear((gastado / dia) * diasMes) : null
    const ratio = gastado / presupuesto
    res.push({ categoria, presupuesto, gastado, proyeccion, estado: ratio >= 1 ? 'superado' : ratio >= umbral ? 'cerca' : 'dentro' })
  }
  return res.sort((a, b) => b.gastado / b.presupuesto - a.gastado / a.presupuesto)
}

/** Propuesta de presupuesto: la media de los 3 meses anteriores completos, redondeada a 10 € */
export function sugerirPresupuestos(db: BaseDatos, mes: string): Map<string, number> {
  const primero = primerMes(db)
  const previos = [1, 2, 3].map((i) => sumarMeses(`${mes}-01`, -i).slice(0, 7)).filter((p) => p > primero && db.movimientos.some((m) => mesEfectivo(m) === p))
  const res = new Map<string, number>()
  if (!previos.length) return res
  for (const c of db.categorias.filter((x) => !x.padre_id && x.activa && x.naturaleza === 'gasto')) {
    const media = previos.reduce((s, p) => s + gastoDe(db, p, c), 0) / previos.length
    if (media >= 5) res.set(c.id, Math.ceil(media / 10) * 10)
  }
  return res
}
