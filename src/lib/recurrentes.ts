/**
 * Gastos fijos y recurrentes: cargos que se repiten en el mismo comercio con una periodicidad regular
 * (suscripciones, recibos, seguros, hipoteca). Se detectan con los propios movimientos, sin reglas:
 * por comercio (en PayPal, por comercio e importe), intervalo entre cargos e importe.
 * Sirven para separar el gasto fijo del variable, anticipar los próximos cargos, detectar subidas de
 * precio y avisar de un cargo que no llega.
 */
import { porVersion } from './cache'
import { claveComercio, claveConImporte, esPasarela, nombrePasarela } from './conceptos'
import { sumarDias } from './fechas'
import { formatearImporte } from './formato'
import type { BaseDatos, Movimiento } from './tipos'
import { anadirA } from './agrupar'

export type Periodicidad = 'mensual' | 'bimestral' | 'trimestral' | 'semestral' | 'anual'

/** Días de cada periodicidad y margen admitido entre dos cargos */
const PERIODOS: Record<Periodicidad, { dias: number; min: number; max: number; veces: number; alAno: number }> = {
  mensual: { dias: 30.44, min: 24, max: 37, veces: 3, alAno: 12 },
  bimestral: { dias: 60.9, min: 52, max: 70, veces: 3, alAno: 6 },
  trimestral: { dias: 91.3, min: 80, max: 102, veces: 3, alAno: 4 },
  semestral: { dias: 182.6, min: 165, max: 200, veces: 2, alAno: 2 },
  anual: { dias: 365.25, min: 340, max: 390, veces: 2, alAno: 1 },
}

export const NOMBRE_PERIODICIDAD: Record<Periodicidad, string> = {
  mensual: 'Mensual',
  bimestral: 'Cada dos meses',
  trimestral: 'Trimestral',
  semestral: 'Semestral',
  anual: 'Anual',
}

export interface Recurrente {
  clave: string
  /** Clave del comercio sin el importe (para buscarlo en Movimientos) */
  comercio: string
  nombre: string
  categoria_id: string | null
  periodicidad: Periodicidad
  /** Último importe cargado, en positivo */
  importe: number
  /** El importe cambia de un cargo a otro (luz, agua) */
  variable: boolean
  /** Coste de un mes y de un año a este ritmo */
  alMes: number
  alAno: number
  veces: number
  primera: string
  ultima: string
  /** Fecha prevista del próximo cargo */
  proxima: string
  /** Sigue activo: el último cargo no es de hace más de dos periodos (con los datos importados) */
  activo: boolean
  /** Subida del último cargo frente al anterior (solo en importes fijos, si sube más de un 2 % y al menos 0,50 €) */
  subida: { antes: number; ahora: number; fecha: string } | null
  ids: string[]
}

const redondear = (n: number) => Math.round(n * 100) / 100
const dias = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000)
const mediana = (xs: number[]) => {
  const o = [...xs].sort((a, b) => a - b)
  const m = Math.floor(o.length / 2)
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2
}

/** Cargos que cuentan: gastos de tipo Normal (sin traspasos, gastos de empleado ni pagos de deuda) */
const esCargo = (m: Movimiento) => m.tipo === 'normal' && m.importe < 0
const claveDe = (m: Movimiento) => claveConImporte(claveComercio(m.concepto_limpio) || m.concepto_normalizado, m.importe)

/** Fecha de referencia de los datos: el último movimiento importado de cada cuenta */
function ultimasFechas(db: BaseDatos): Map<string, string> {
  const r = new Map<string, string>()
  for (const m of db.movimientos) if (m.fecha_operacion > (r.get(m.cuenta_id) ?? '')) r.set(m.cuenta_id, m.fecha_operacion)
  return r
}

function clasificar(intervalos: number[]): Periodicidad | null {
  if (!intervalos.length) return null
  const med = mediana(intervalos)
  for (const [p, d] of Object.entries(PERIODOS) as [Periodicidad, (typeof PERIODOS)[Periodicidad]][]) {
    if (med < d.min || med > d.max) continue
    // Casi todos los intervalos dentro del margen (uno suelto, por un cargo que se adelanta, se admite)
    const dentro = intervalos.filter((i) => i >= d.min * 0.8 && i <= d.max * 1.2).length
    if (dentro >= Math.max(1, intervalos.length - Math.floor(intervalos.length / 4))) return p
  }
  return null
}

/** Cargos agrupados por comercio (en PayPal, por comercio e importe) */
function gruposCargos(db: BaseDatos): Map<string, Movimiento[]> {
  const grupos = new Map<string, Movimiento[]>()
  for (const m of db.movimientos) {
    if (!esCargo(m)) continue
    const k = claveDe(m)
    if (!k) continue
    anadirA(grupos, k, m)
  }
  return grupos
}

function calcularRecurrentes(db: BaseDatos): Recurrente[] {
  const grupos = gruposCargos(db)
  const referencia = ultimasFechas(db)
  const res: Recurrente[] = []
  for (const [clave, movs] of grupos) {
    if (movs.length < 2) continue
    const orden = [...movs].sort((a, b) => a.fecha_operacion.localeCompare(b.fecha_operacion))
    // Varios cargos el mismo día o muy seguidos (compras) no son un recibo: se agrupan por día
    const porDia = new Map<string, Movimiento[]>()
    for (const m of orden) anadirA(porDia, m.fecha_operacion, m)
    const fechas = [...porDia.keys()]
    const intervalos = fechas.slice(1).map((f, i) => dias(fechas[i], f))
    const periodicidad = clasificar(intervalos)
    if (!periodicidad || fechas.length < PERIODOS[periodicidad].veces) continue
    // Un recibo no se repite varias veces por periodo
    if (porDia.size < orden.length * 0.8) continue
    const importes = [...porDia.values()].map((ms) => -ms.reduce((s, m) => s + m.importe, 0))
    const media = importes.reduce((s, x) => s + x, 0) / importes.length
    const desviacion = Math.sqrt(importes.reduce((s, x) => s + (x - media) ** 2, 0) / importes.length)
    // Importes demasiado dispares (supermercado de cada mes) no son un cargo fijo
    if (desviacion / media > 0.45) continue
    const ultima = fechas[fechas.length - 1]
    const periodo = PERIODOS[periodicidad]
    const paso = Math.round(mediana(intervalos))
    const proxima = sumarDias(ultima, paso)
    const ref = referencia.get(orden[orden.length - 1].cuenta_id) ?? ultima
    const activo = dias(ultima, ref) <= periodo.dias * 2
    const ahora = importes[importes.length - 1]
    const antes = importes[importes.length - 2]
    // En un recibo de importe variable (luz, agua) cada factura cambia: no es una subida de precio
    const esVariable = desviacion / media > 0.08
    const subida = !esVariable && ahora > antes * 1.02 && ahora - antes >= 0.5 ? { antes: redondear(antes), ahora: redondear(ahora), fecha: ultima } : null
    const ultimoMov = orden[orden.length - 1]
    const base = claveComercio(ultimoMov.concepto_limpio)
    res.push({
      clave,
      comercio: base || ultimoMov.concepto_normalizado,
      nombre: esPasarela(base) ? `${nombrePasarela(base)} de ${ahora.toFixed(2).replace('.', ',')} €` : ultimoMov.concepto_limpio,
      categoria_id: ultimoMov.categoria_id,
      periodicidad,
      importe: redondear(ahora),
      variable: desviacion / media > 0.08,
      // Un fijo cuesta lo del último cargo; uno variable, su media
      alMes: redondear(((desviacion / media > 0.08 ? media : ahora) * periodo.alAno) / 12),
      alAno: redondear((desviacion / media > 0.08 ? media : ahora) * periodo.alAno),
      veces: fechas.length,
      primera: fechas[0],
      ultima,
      proxima,
      activo,
      subida,
      ids: orden.map((m) => m.id),
    })
  }
  return res.sort((a, b) => Number(b.activo) - Number(a.activo) || b.alMes - a.alMes)
}

export interface ResumenFijos {
  activos: Recurrente[]
  /** Coste mensual de los recurrentes activos */
  alMes: number
  alAno: number
  /** Próximos cargos en los próximos días, por fecha */
  proximos: Recurrente[]
}

export function resumenFijos(recurrentes: Recurrente[], hoy: string, diasVista = 30): ResumenFijos {
  const activos = recurrentes.filter((r) => r.activo)
  const hasta = sumarDias(hoy, diasVista)
  return {
    activos,
    alMes: redondear(activos.reduce((s, r) => s + r.alMes, 0)),
    alAno: redondear(activos.reduce((s, r) => s + r.alAno, 0)),
    proximos: activos.filter((r) => r.proxima >= hoy && r.proxima <= hasta).sort((a, b) => a.proxima.localeCompare(b.proxima)),
  }
}

/** Gasto de un conjunto de movimientos separado en fijo (de recurrentes) y variable */
export function fijoYVariable(movs: Movimiento[], recurrentes: Recurrente[]): { fijo: number; variable: number } {
  const ids = new Set(recurrentes.flatMap((r) => r.ids))
  let fijo = 0
  let variable = 0
  for (const m of movs) {
    if (!esCargo(m)) continue
    if (ids.has(m.id)) fijo -= m.importe
    else variable -= m.importe
  }
  return { fijo: redondear(fijo), variable: redondear(variable) }
}

// ---------------------------------------------------------------------------
// Avisos: subida de precio, cargo esperado que no llega y posible suscripción nueva
// ---------------------------------------------------------------------------

export type TipoAviso = 'subida' | 'no_llega' | 'nuevo'

export interface AvisoRecurrente {
  tipo: TipoAviso
  clave: string
  nombre: string
  texto: string
  /** Para ordenar: lo más reciente primero */
  fecha: string
}

const fechaCorta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const eur = formatearImporte

/**
 * Avisos sobre los recurrentes, con los datos importados de cada cuenta (no con la fecha de hoy: si
 * aún no se ha subido el Excel, un cargo no «falta»):
 *   - subida: el último cargo es más caro que el anterior (en los últimos 45 días);
 *   - no_llega: los datos ya pasan de la fecha prevista y el cargo no está;
 *   - nuevo: dos cargos iguales con un mes de diferencia en un comercio que no aparecía antes, aunque
 *     la cuenta ya tenía datos (con pocos meses importados, todo parecería nuevo).
 */
export function avisosRecurrentes(db: BaseDatos, recurrentes = detectarRecurrentes(db)): AvisoRecurrente[] {
  const referencia = ultimasFechas(db)
  const avisos: AvisoRecurrente[] = []
  const cuentaDe = new Map(db.movimientos.map((m) => [m.id, m.cuenta_id]))
  for (const r of recurrentes) {
    if (!r.activo) continue
    const ref = referencia.get(cuentaDe.get(r.ids[r.ids.length - 1]) ?? '') ?? r.ultima
    if (r.subida && dias(r.subida.fecha, ref) <= 45)
      avisos.push({ tipo: 'subida', clave: r.clave, nombre: r.nombre, texto: `Sube de ${eur(r.subida.antes)} a ${eur(r.subida.ahora)} el ${fechaCorta(r.subida.fecha)}`, fecha: r.subida.fecha })
    const margen = r.periodicidad === 'mensual' ? 7 : 20
    if (dias(r.proxima, ref) > margen)
      avisos.push({ tipo: 'no_llega', clave: r.clave, nombre: r.nombre, texto: `Se esperaba hacia el ${fechaCorta(r.proxima)} y no ha llegado`, fecha: r.proxima })
  }
  const ya = new Set(recurrentes.map((r) => r.clave))
  const primeras = new Map<string, string>()
  for (const m of db.movimientos) if (!primeras.has(m.cuenta_id) || m.fecha_operacion < primeras.get(m.cuenta_id)!) primeras.set(m.cuenta_id, m.fecha_operacion)
  for (const [clave, movs] of gruposCargos(db)) {
    if (ya.has(clave) || movs.length !== 2) continue
    const [a, b] = [...movs].sort((x, y) => x.fecha_operacion.localeCompare(y.fecha_operacion))
    const d = dias(a.fecha_operacion, b.fecha_operacion)
    const ref = referencia.get(b.cuenta_id) ?? b.fecha_operacion
    if (d < 25 || d > 37 || Math.abs(a.importe - b.importe) > Math.abs(b.importe) * 0.01 || dias(b.fecha_operacion, ref) > 40) continue
    // Con menos de dos meses de datos antes del primer cargo, no se sabe si es nuevo
    if (dias(primeras.get(a.cuenta_id) ?? a.fecha_operacion, a.fecha_operacion) < 60) continue
    const base = claveComercio(b.concepto_limpio)
    avisos.push({
      tipo: 'nuevo',
      clave,
      nombre: esPasarela(base) ? `${nombrePasarela(base)} de ${eur(-b.importe)}` : b.concepto_limpio,
      texto: `Cargo nuevo que se repite: ${eur(-b.importe)} el ${fechaCorta(a.fecha_operacion)} y el ${fechaCorta(b.fecha_operacion)}`,
      fecha: b.fecha_operacion,
    })
  }
  return avisos.sort((a, b) => b.fecha.localeCompare(a.fecha))
}

/** Una vez por versión de los datos: el Extracto, Informes, Gastos fijos y la previsión lo comparten */
export const detectarRecurrentes = porVersion(calcularRecurrentes)
