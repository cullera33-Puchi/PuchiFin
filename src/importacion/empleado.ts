/**
 * Detección de gastos de empleado (apartado 6). Cada gasto recibe una puntuación de 0 a 1:
 * - cafeterías y restaurantes (0,35); taxis, VTC, tren, avión y hoteles (0,5);
 * - pagado con la tarjeta de crédito (+0,2), día laborable (+0,1) o fin de semana (−0,25);
 * - fuera de casa (+0,2): la zona de casa son las poblaciones de los ajustes o, si no hay, las habituales;
 * - el mismo día que otro gasto de viaje de trabajo (+0,15);
 * - el historial del comercio pesa un 70 %: cuántas veces se marcó como de empleado o como personal.
 * A partir de 0,5 se propone. Nada se marca sin que el usuario lo confirme.
 */
import { claveComercio, normalizarConcepto } from '../lib/conceptos'
import type { BaseDatos, Movimiento } from '../lib/tipos'

export const UMBRAL_EMPLEADO = 0.5
const COMIDA = /\b(cafe|cafeteria|cafes|bar|bares|restaurante|rest|pizzeria|taberna|sushi|burger|meson|asador|granja|horno|bocateria|cerveceria|tapas)\b/
const VIAJE = /\b(taxi|cabify|uber|bolt|freenow|renfe|ouigo|iryo|iberia|vueling|ryanair|air europa|hotel|hoteles|nh|melia|booking|hostal|ibis|airbnb|parking aeropuerto|aena)\b/

export interface Historial {
  empleado: number
  personal: number
}

/** Por comercio: veces marcado como de empleado y veces revisado como personal */
export function historialComercios(db: BaseDatos): Map<string, Historial> {
  const h = new Map<string, Historial>()
  for (const m of db.movimientos) {
    if (m.importe >= 0) continue
    const emp = m.tipo === 'gasto_empleado'
    const pers = m.tipo === 'normal' && m.revisado_empleado
    if (!emp && !pers) continue
    const k = claveComercio(m.concepto_limpio)
    if (!k) continue
    const v = h.get(k) ?? { empleado: 0, personal: 0 }
    if (emp) v.empleado++
    else v.personal++
    h.set(k, v)
  }
  return h
}

const normPob = (p: string) => normalizarConcepto(p)

/** Poblaciones de casa: las de los ajustes o, si no hay, las que suman el 70 % de las compras con población */
export function zonaCasa(db: BaseDatos, extra: { poblacion: string | null }[] = []): Set<string> {
  if (db.ajustes.zona_casa.length) return new Set(db.ajustes.zona_casa.map(normPob))
  const cuenta = new Map<string, number>()
  for (const m of [...db.movimientos, ...extra]) if (m.poblacion) cuenta.set(normPob(m.poblacion), (cuenta.get(normPob(m.poblacion)) ?? 0) + 1)
  const total = [...cuenta.values()].reduce((s, n) => s + n, 0)
  if (total < 8) return new Set() // pocos datos: no se usa
  const zona = new Set<string>()
  let acumulado = 0
  for (const [p, n] of [...cuenta].sort((a, b) => b[1] - a[1])) {
    if (acumulado / total >= 0.7) break
    zona.add(p)
    acumulado += n
  }
  return zona
}

export interface Contexto {
  historial: Map<string, Historial>
  zona: Set<string>
  tarjetas: Set<string>
  comida: Set<string>
  viaje: Set<string>
  diasViaje: Set<string>
}

export function contextoEmpleado(db: BaseDatos, extra: { poblacion: string | null; fecha_operacion: string; tipo?: string }[] = []): Contexto {
  const ids = (nombres: string[]) => new Set(db.categorias.filter((c) => nombres.includes(c.nombre)).map((c) => c.id))
  const viaje = new Set([...ids(['Alojamiento']), ...db.categorias.filter((c) => c.nombre === 'Transporte' && db.categorias.find((p) => p.id === c.padre_id)?.nombre === 'Viajes').map((c) => c.id)])
  return {
    historial: historialComercios(db),
    zona: zonaCasa(db, extra),
    tarjetas: new Set(db.cuentas.filter((c) => c.tipo === 'tarjeta_credito').map((c) => c.id)),
    comida: ids(['Cafeterías', 'Restaurantes']),
    viaje,
    diasViaje: new Set(db.movimientos.filter((m) => m.tipo === 'gasto_empleado').map((m) => m.fecha_operacion)),
  }
}

export interface Puntuacion {
  puntuacion: number
  motivos: string[]
}

export function puntuarEmpleado(
  m: Pick<Movimiento, 'importe' | 'categoria_id' | 'cuenta_id' | 'fecha_operacion' | 'poblacion' | 'concepto_limpio'>,
  ctx: Contexto,
): Puntuacion {
  if (m.importe >= 0) return { puntuacion: 0, motivos: [] }
  const texto = normalizarConcepto(m.concepto_limpio)
  const clave = claveComercio(m.concepto_limpio)
  const motivos: string[] = []
  let p = 0
  if ((m.categoria_id && ctx.viaje.has(m.categoria_id)) || VIAJE.test(texto)) {
    p += 0.5
    motivos.push('taxi, transporte o alojamiento')
  } else if ((m.categoria_id && ctx.comida.has(m.categoria_id)) || COMIDA.test(texto)) {
    p += 0.35
    motivos.push('cafetería o restaurante')
  }
  const h = ctx.historial.get(clave)
  if (p === 0 && !h?.empleado) return { puntuacion: 0, motivos: [] }

  if (ctx.tarjetas.has(m.cuenta_id)) {
    p += 0.2
    motivos.push('tarjeta de crédito')
  }
  const dia = new Date(`${m.fecha_operacion}T00:00:00Z`).getUTCDay()
  if (dia >= 1 && dia <= 5) {
    p += 0.1
    motivos.push('día laborable')
  } else p -= 0.25
  if (m.poblacion && ctx.zona.size && !ctx.zona.has(normPob(m.poblacion))) {
    p += 0.2
    motivos.push(`fuera de casa (${m.poblacion})`)
  }
  if (ctx.diasViaje.has(m.fecha_operacion)) {
    p += 0.15
    motivos.push('día de viaje de trabajo')
  }
  if (h && h.empleado + h.personal > 0) {
    const ratio = h.empleado / (h.empleado + h.personal)
    p = 0.3 * p + 0.7 * ratio
    motivos.push(`en este comercio, ${h.empleado} de ${h.empleado + h.personal} fueron de empleado`)
  }
  return { puntuacion: Math.max(0, Math.min(1, Math.round(p * 100) / 100)), motivos }
}

/** Movimientos ya guardados que parecen de empleado y están sin revisar, de más a menos probable */
export function candidatosEmpleado(db: BaseDatos): { m: Movimiento; puntuacion: number; motivos: string[] }[] {
  const ctx = contextoEmpleado(db)
  return db.movimientos
    .filter((m) => m.tipo === 'normal' && m.importe < 0 && !m.revisado_empleado)
    .map((m) => ({ m, ...puntuarEmpleado(m, ctx) }))
    .filter((c) => c.puntuacion >= UMBRAL_EMPLEADO)
    .sort((a, b) => b.puntuacion - a.puntuacion || b.m.fecha_operacion.localeCompare(a.m.fecha_operacion))
}
