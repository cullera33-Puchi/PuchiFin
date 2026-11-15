/**
 * La vivienda actual al comprar otra para vivir (v0.42.0): venderla o alquilarla, con su IRPF.
 *
 * Es una estimación para planificar, no un cálculo oficial:
 * - Venta: dinero neto = precio menos gastos de venta, menos la hipoteca pendiente, menos el IRPF de la
 *   ganancia. La ganancia (precio menos gastos menos lo que costó) tributa en la base del ahorro, cada
 *   titular por su parte. Si se reinvierte en la nueva vivienda habitual, queda exenta en proporción a lo
 *   reinvertido sobre lo obtenido (el precio menos los gastos y la hipoteca que se cancela).
 * - Alquiler: rendimiento neto = alquiler de los meses alquilada menos gastos (IBI, comunidad, seguro),
 *   intereses de la hipoteca y amortización (3 % de la construcción). Con la reducción por alquiler de
 *   vivienda (50 % general), cada titular suma su parte a su base general.
 */
import { cotizacionMes, cuotaAhorro, calcularAnio, irpfAdicional, type AjusteNomina } from './nomina'
import { cuotaPrestamo, mesesEntre, pendientePrestamo, pendienteTras } from './patrimonio'
import type { CompraVivienda } from './plan'
import type { AjustesInversion, BaseDatos, Bien, Nomina, Prestamo } from './tipos'

const r2 = (n: number) => Math.round(n * 100) / 100

export const INVERSION_POR_DEFECTO: AjustesInversion = {
  esfuerzo_max: 30,
  alquiler_banco: 70,
  bruto_pareja: 25000,
  revalorizacion: 2,
  gastos_venta: 5,
  propiedad_pct: 50,
  reduccion_alquiler: 50,
  coste_vivienda: null,
  construccion_pct: 50,
}

export const inversionDe = (db: BaseDatos): AjustesInversion => ({ ...INVERSION_POR_DEFECTO, ...(db.ajustes.inversion ?? {}) })

/** Qué se hace con la vivienda actual al comprar otra para vivir */
export interface ViviendaActual {
  destino: 'mantener' | 'vender' | 'alquilar'
  /** Precio de venta previsto */
  precio_venta: number
  /** Alquiler al mes, meses vacía al año y gastos al año (IBI, comunidad, seguro y reparaciones) */
  alquiler_mes: number
  meses_vacia: number
  gastos_anio: number
}

/** La hipoteca que se paga hoy (la primera con capital pendiente) */
export const hipotecaActual = (db: BaseDatos): Prestamo | null => db.cuentas.find((c) => c.tipo === 'hipoteca' && c.activa && c.prestamo)?.prestamo ?? null

export const viviendaHabitual = (db: BaseDatos): Bien | undefined => (db.ajustes.bienes ?? []).find((b) => b.tipo === 'inmueble' && b.habitual)

const fechaDe = (mes: string) => `${mes}-01`

/** Valor previsto de la vivienda habitual en un mes, con la revalorización anual desde su última valoración */
export function precioPrevisto(db: BaseDatos, mes: string): number {
  const b = viviendaHabitual(db)
  const v = b?.valoraciones.at(-1)
  if (!v) return 0
  const anios = Math.max(0, (Number(mes.slice(0, 4)) - Number(v.fecha.slice(0, 4))) * 12 + Number(mes.slice(5, 7)) - Number(v.fecha.slice(5, 7))) / 12
  return Math.round(v.valor * (1 + inversionDe(db).revalorizacion / 100) ** anios)
}

/** La destinación de la vivienda actual en una compra, si es para vivir */
export const actualDe = (c: CompraVivienda | null | undefined): ViviendaActual | null => (c && c.uso === 'vivir' && c.actual && c.actual.destino !== 'mantener' ? c.actual : null)

export interface Venta {
  precio: number
  gastos: number
  hipoteca: number
  ganancia: number
  /** Parte de la ganancia exenta por reinversión, en tanto por uno */
  exenta: number
  irpf: number
  neto: number
}

/** Venta de la vivienda actual en el mes de la compra; «reinvertido» es el precio de la nueva */
export function calcularVenta(db: BaseDatos, precio: number, mes: string, reinvertido: number): Venta {
  const inv = inversionDe(db)
  const gastos = r2((precio * inv.gastos_venta) / 100)
  const p = hipotecaActual(db)
  const hipoteca = p ? pendientePrestamo(p, fechaDe(mes)) : 0
  const ganancia = inv.coste_vivienda === null ? 0 : r2(Math.max(0, precio - gastos - inv.coste_vivienda))
  const obtenido = Math.max(0, precio - gastos - hipoteca)
  const exenta = ganancia > 0 && obtenido > 0 ? Math.min(1, reinvertido / obtenido) : 1
  const sujeta = ganancia * (1 - exenta)
  const parte = inv.propiedad_pct / 100
  const irpf = r2(cuotaAhorro(sujeta * parte) + cuotaAhorro(sujeta * (1 - parte)))
  return { precio, gastos, hipoteca, ganancia, exenta, irpf, neto: r2(precio - gastos - hipoteca - irpf) }
}

export interface AlquilerAnual {
  ingresos: number
  gastos: number
  intereses: number
  amortizacion: number
  rendimiento: number
  /** Lo que tributa tras la reducción */
  base: number
  irpfTitular: number
  irpfPareja: number
  /** Lo que queda para la familia: ingresos menos gastos e IRPF (la cuota de la hipoteca se paga aparte) */
  neto: number
}

/** Intereses de un préstamo pagados en un año natural: las cuotas de ese año menos el capital que amortizan */
function interesesDelAnio(p: Prestamo, anio: number): number {
  const tope = (k: number) => Math.min(p.plazo_meses, Math.max(0, k))
  const a = tope(mesesEntre(p.fecha, `${anio}-01-01`))
  const b = tope(mesesEntre(p.fecha, `${anio + 1}-01-01`))
  if (b <= a) return 0
  return r2(Math.max(0, cuotaPrestamo(p) * (b - a) - (pendienteTras(p, a) - pendienteTras(p, b))))
}

/** Retribución sujeta y Seguridad Social de un año de la nómina en bruto del usuario */
function trabajoDelAnio(n: Nomina | undefined, anio: number, ajuste: AjusteNomina) {
  if (!n?.bruto) return null
  const meses = calcularAnio(n.bruto, anio, ajuste)
  const b = n.bruto
  return {
    retribucion: meses.reduce((s, m) => s + m.bruto + m.bonusBruto, 0) - 12 * b.flexible_mes + 12 * b.especie_mes,
    seguridadSocial: meses.reduce((s, m) => s + m.seguridadSocial, 0),
    hijos: b.hijos,
  }
}

/** Tipo del IRPF que se usa para el titular si no tiene la nómina en bruto */
const TIPO_SIN_NOMINA = 45

const cache = new WeakMap<BaseDatos, Map<string, AlquilerAnual>>()

/** El alquiler de la vivienda actual en un año natural, con el IRPF de cada titular */
export function alquilerAnual(db: BaseDatos, a: ViviendaActual, anio: number, ajuste: AjusteNomina = {}, mesesAlquilada = 12): AlquilerAnual {
  const k = `${anio}|${a.alquiler_mes}|${a.meses_vacia}|${a.gastos_anio}|${mesesAlquilada}|${ajuste.subida ?? ''}|${ajuste.consecucion ?? ''}|${ajuste.inflacion ?? ''}`
  let m = cache.get(db)
  if (!m) cache.set(db, (m = new Map()))
  const guardado = m.get(k)
  if (guardado) return guardado
  const inv = inversionDe(db)
  const proporcion = mesesAlquilada / 12
  const ingresos = r2(a.alquiler_mes * Math.max(0, mesesAlquilada - a.meses_vacia * proporcion))
  const gastos = r2(a.gastos_anio * proporcion)
  const p = hipotecaActual(db)
  const intereses = p ? r2(interesesDelAnio(p, anio) * proporcion) : 0
  const amortizacion = inv.coste_vivienda === null ? 0 : r2(((inv.coste_vivienda * inv.construccion_pct) / 100) * 0.03 * proporcion)
  // Los intereses y las reparaciones no pueden dar pérdidas: como mucho, hasta los ingresos
  const rendimiento = r2(ingresos - gastos - Math.min(intereses, Math.max(0, ingresos - gastos)) - amortizacion)
  const base = rendimiento > 0 ? r2((rendimiento * (100 - inv.reduccion_alquiler)) / 100) : 0
  const titular = (inv.propiedad_pct / 100) * base
  const pareja = base - titular
  const mia = (db.ajustes.nominas ?? []).find((n) => n.incluida && n.bruto)
  const trabajo = trabajoDelAnio(mia, anio, ajuste)
  const irpfTitular = trabajo ? irpfAdicional(trabajo.retribucion, trabajo.seguridadSocial, trabajo.hijos, anio, titular) : r2((titular * TIPO_SIN_NOMINA) / 100)
  const ssPareja = inv.bruto_pareja > 0 ? cotizacionMes(inv.bruto_pareja / 12, anio, ajuste.inflacion) * 12 : 0
  const irpfPareja = irpfAdicional(inv.bruto_pareja, ssPareja, trabajo?.hijos ?? mia?.bruto?.hijos ?? [], anio, pareja)
  const r: AlquilerAnual = { ingresos, gastos, intereses, amortizacion, rendimiento, base, irpfTitular, irpfPareja, neto: r2(ingresos - gastos - irpfTitular - irpfPareja) }
  m.set(k, r)
  return r
}
