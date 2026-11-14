/**
 * Presupuesto por categoría (apartado 9): cuánto se lleva gastado de cada presupuesto del mes, cómo
 * cerrará el mes y el estado. Solo cuentan los movimientos de tipo Normal: los gastos de empleado,
 * traspasos y pagos de deuda no consumen presupuesto.
 *
 * El cierre previsto (v0.36.0) sigue la misma lógica que la previsión del mes: lo gastado, más los recibos
 * y gastos previstos que faltan en la categoría, más lo que se suele gastar en ella en los días que quedan
 * (la media de esos mismos días en los meses anteriores). Antes se proyectaba todo en línea recta, y una
 * hipoteca pagada el día 5 «cerraba» en el doble.
 */
import { sumarDias, sumarMeses } from './fechas'
import { mesEfectivo } from './imputacion'
import { fechaDeLosDatos } from './extracto'
import { previstosPendientes } from './previstos'
import { mesesDeReferencia, primerMes, recibosPendientes, trasElDia } from './prevision'
import { detectarRecurrentes, type Recurrente } from './recurrentes'
import type { BaseDatos, Categoria } from './tipos'

const redondear = (n: number) => Math.round(n * 100) / 100
const diasDe = (mes: string) => Number(sumarDias(sumarMeses(`${mes}-01`, 1), -1).slice(8, 10))

/**
 * dentro: va bien. riesgo: aún no se ha pasado, pero al cerrar el mes se pasará. superado: ya se ha pasado.
 * Hasta la v0.35 había «cerca» a partir del 80 % usado, que marcaba como aviso un recibo ya pagado
 */
export type EstadoPresupuesto = 'dentro' | 'riesgo' | 'superado'

export interface LineaPresupuesto {
  categoria: Categoria
  presupuesto: number
  gastado: number
  /** Recibos y gastos previstos que faltan este mes en la categoría (0 en un mes cerrado) */
  comprometido: number
  /** Cómo cerrará el mes: gastado, comprometido y variable al ritmo habitual. null en un mes cerrado */
  cierre: number | null
  estado: EstadoPresupuesto
}

/**
 * Margen del aviso «camino de pasarse»: el cierre previsto es una estimación, así que solo avisa si pasa
 * del presupuesto en más de un 5 % y de 5 €
 */
export const margen = (presupuesto: number) => Math.max(5, presupuesto * 0.05)

/** La categoría y, si es raíz, sus subcategorías */
function idsDe(db: BaseDatos, c: Categoria): Set<string> {
  return new Set([c.id, ...(c.padre_id ? [] : db.categorias.filter((h) => h.padre_id === c.id).map((h) => h.id))])
}

/** Gasto del mes en la categoría. Con «variable», sin los recibos y suscripciones y solo después de ese día */
function gastoDe(db: BaseDatos, mes: string, ids: Set<string>, variable?: { fijos: Set<string>; tras: number }): number {
  let total = 0
  for (const m of db.movimientos) {
    if (m.tipo !== 'normal' || !m.categoria_id || !ids.has(m.categoria_id) || mesEfectivo(m) !== mes) continue
    if (variable && (variable.fijos.has(m.id) || !trasElDia(m, variable.tras))) continue
    total -= m.importe
  }
  return redondear(total)
}

const ORDEN: Record<EstadoPresupuesto, number> = { superado: 0, riesgo: 1, dentro: 2 }

export function consumoPresupuestos(db: BaseDatos, mes: string, hoy: string, recurrentes: Recurrente[] = detectarRecurrentes(db)): LineaPresupuesto[] {
  // El ritmo se mide hasta el último dato importado
  const hasta = fechaDeLosDatos(db, hoy)
  const enCurso = hoy.slice(0, 7) === mes
  const dia = hasta.startsWith(mes) ? Number(hasta.slice(8, 10)) : 0
  const diasMes = diasDe(mes)
  const fin = `${mes}-${String(diasMes).padStart(2, '0')}`
  const fijos = new Set(recurrentes.flatMap((r) => r.ids))
  const recibos = enCurso ? recibosPendientes(db, mes, hasta, recurrentes) : []
  const previstos = enCurso ? previstosPendientes(db, hasta, fin, hoy, recurrentes).filter((e) => e.importe < 0) : []
  const previos = mesesDeReferencia(db, mes)

  const res: LineaPresupuesto[] = []
  for (const p of db.presupuestos) {
    const categoria = db.categorias.find((c) => c.id === p.categoria_id)
    if (!categoria || !categoria.activa) continue
    const presupuesto = p.excepciones[mes] ?? p.importe_mensual
    if (!(presupuesto > 0)) continue
    const ids = idsDe(db, categoria)
    const gastado = gastoDe(db, mes, ids)
    let comprometido = 0
    let cierre: number | null = null
    if (enCurso) {
      comprometido = redondear(
        recibos.filter((r) => r.categoria_id && ids.has(r.categoria_id)).reduce((s, r) => s + r.importe, 0) -
          previstos.filter((e) => e.categoria_id && ids.has(e.categoria_id)).reduce((s, e) => s + e.importe, 0),
      )
      // Variable de lo que queda: lo gastado en la categoría después de este día en los meses anteriores, sin
      // recibos; sin historia, al ritmo de este mes (desde el día 5)
      const resto = previos.length
        ? previos.reduce((s, m) => s + Math.max(0, gastoDe(db, m, ids, { fijos, tras: dia })), 0) / previos.length
        : dia >= 5
          ? (Math.max(0, gastoDe(db, mes, ids, { fijos, tras: 0 })) / dia) * (diasMes - dia)
          : 0
      cierre = redondear(gastado + comprometido + resto)
    }
    const estado: EstadoPresupuesto = gastado - presupuesto >= 0.5 ? 'superado' : cierre !== null && cierre > presupuesto + margen(presupuesto) ? 'riesgo' : 'dentro'
    res.push({ categoria, presupuesto, gastado, comprometido, cierre, estado })
  }
  return res.sort((a, b) => ORDEN[a.estado] - ORDEN[b.estado] || b.gastado / b.presupuesto - a.gastado / a.presupuesto)
}

export interface TotalPresupuesto {
  presupuesto: number
  gastado: number
  /** Suma de los cierres previstos; null en un mes cerrado */
  cierre: number | null
  superadas: number
  enRiesgo: number
}

/** El conjunto de las categorías con presupuesto */
export function totalPresupuesto(lineas: LineaPresupuesto[]): TotalPresupuesto {
  const suma = (f: (l: LineaPresupuesto) => number) => redondear(lineas.reduce((s, l) => s + f(l), 0))
  return {
    presupuesto: suma((l) => l.presupuesto),
    gastado: suma((l) => l.gastado),
    cierre: lineas.length && lineas.every((l) => l.cierre !== null) ? suma((l) => l.cierre!) : null,
    superadas: lineas.filter((l) => l.estado === 'superado').length,
    enRiesgo: lineas.filter((l) => l.estado === 'riesgo').length,
  }
}

/** Propuesta de presupuesto: la media de los 3 meses anteriores completos, redondeada a 10 € */
export function sugerirPresupuestos(db: BaseDatos, mes: string): Map<string, number> {
  const primero = primerMes(db)
  const previos = [1, 2, 3].map((i) => sumarMeses(`${mes}-01`, -i).slice(0, 7)).filter((p) => p > primero && db.movimientos.some((m) => mesEfectivo(m) === p))
  const res = new Map<string, number>()
  if (!previos.length) return res
  for (const c of db.categorias.filter((x) => !x.padre_id && x.activa && x.naturaleza === 'gasto')) {
    const ids = idsDe(db, c)
    const media = previos.reduce((s, p) => s + gastoDe(db, p, ids), 0) / previos.length
    if (media >= 5) res.set(c.id, Math.ceil(media / 10) * 10)
  }
  return res
}

export interface LineaAnual {
  categoria: Categoria
  /** Suma del presupuesto de cada mes (con sus excepciones), el mes en curso en proporción a los días con datos */
  presupuesto: number
  gastado: number
  /** En el año solo hay dos: por encima (superado) o no (dentro) */
  estado: EstadoPresupuesto
}

/**
 * Presupuesto del año hasta hoy frente al gasto real. Cuenta desde enero o desde el primer mes completo
 * con datos (el primero importado suele empezar a mitad), hasta el mes en curso.
 */
export function presupuestoAnual(db: BaseDatos, anio: string, hoy: string): { meses: number; lineas: LineaAnual[] } {
  const hasta = fechaDeLosDatos(db, hoy)
  const actual = hoy.slice(0, 7)
  const primero = primerMes(db)
  const meses: string[] = []
  for (let m = `${anio}-01`; m <= `${anio}-12` && m <= actual; m = sumarMeses(`${m}-01`, 1).slice(0, 7)) if (m > primero) meses.push(m)
  const lineas: LineaAnual[] = []
  for (const p of db.presupuestos) {
    const categoria = db.categorias.find((c) => c.id === p.categoria_id)
    if (!categoria || !categoria.activa) continue
    const ids = idsDe(db, categoria)
    let presupuesto = 0
    let gastado = 0
    for (const mes of meses) {
      const delMes = p.excepciones[mes] ?? p.importe_mensual
      if (mes === actual) {
        const diasMes = Number(sumarDias(sumarMeses(`${mes}-01`, 1), -1).slice(8, 10))
        const dia = hasta.startsWith(mes) ? Number(hasta.slice(8, 10)) : 0
        presupuesto += (delMes * dia) / diasMes
      } else presupuesto += delMes
      gastado += gastoDe(db, mes, ids)
    }
    if (presupuesto <= 0) continue
    lineas.push({ categoria, presupuesto: redondear(presupuesto), gastado: redondear(gastado), estado: gastado - presupuesto >= 0.5 ? 'superado' : 'dentro' })
  }
  return { meses: meses.length, lineas: lineas.sort((a, b) => b.gastado / b.presupuesto - a.gastado / a.presupuesto) }
}

/** Categorías superadas o que van camino de pasarse en los meses indicados, para avisar al importar */
export function avisosPresupuesto(db: BaseDatos, meses: string[], hoy: string): (LineaPresupuesto & { mes: string })[] {
  return meses.flatMap((mes) => consumoPresupuestos(db, mes, hoy).filter((l) => l.estado !== 'dentro').map((l) => ({ ...l, mes })))
}
