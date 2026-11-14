/**
 * De bruto a neto (v0.39.0): lo que llega al banco cada mes a partir del bruto anual, con la cotización a
 * la Seguridad Social y la retención del IRPF. Sirve para que una subida de sueldo en bruto se traduzca
 * en su neto real, que sube menos.
 *
 * Es una estimación para planificar, no un cálculo oficial:
 * - Retención: procedimiento general del Reglamento del IRPF (escala de retenciones estatal, igual en
 *   toda España salvo País Vasco y Navarra; los tramos autonómicos se regularizan en la declaración).
 *   Hijos computados por mitad, como en una pareja que convive. Sin los límites para rentas bajas.
 * - Como hacen las empresas, el tipo se fija en enero con el sueldo de entonces y el bonus previsto, y se
 *   regulariza en el mes de la subida: lo que falta por retener se reparte en los meses que quedan.
 * - Seguridad Social: parámetros de 2026 (base máxima, tipos del trabajador, mecanismo de equidad y
 *   cuota de solidaridad). Hay que revisarlos cada año; la base máxima futura crece con la inflación
 *   configurada más 1,2 puntos, como marca la ley.
 * El tipo real de la nómina, si se indica, manda en el año al que corresponde.
 */
import type { NominaBruta } from './tipos'

const r2 = (n: number) => Math.round(n * 100) / 100

// ---------------------------------------------------------------------------
// Parámetros (legislación de 2026)
// ---------------------------------------------------------------------------

const ANIO_PARAMETROS = 2026
const BASE_MAXIMA_2026 = 5101.2
/** Contingencias comunes (4,70), desempleo (1,55) y formación profesional (0,10) */
const TIPO_TRABAJADOR = 6.35
/** Mecanismo de equidad intergeneracional, parte del trabajador */
const mei = (anio: number) => (anio <= 2025 ? 0.13 : anio === 2026 ? 0.15 : anio === 2027 ? 0.167 : anio === 2028 ? 0.183 : 0.2)
/** Cuota de solidaridad, parte del trabajador: hasta un 10 % sobre la base máxima, del 10 al 50 % y más */
const SOLIDARIDAD = [
  { hasta: 0.1, tipo: 0.19 },
  { hasta: 0.5, tipo: 0.21 },
  { hasta: Infinity, tipo: 0.24 },
]
/** Escala de retenciones del trabajo (artículo 85 del Reglamento) */
const ESCALA = [
  { hasta: 12450, tipo: 19 },
  { hasta: 20200, tipo: 24 },
  { hasta: 35200, tipo: 30 },
  { hasta: 60000, tipo: 37 },
  { hasta: 300000, tipo: 45 },
  { hasta: Infinity, tipo: 47 },
]
const OTROS_GASTOS = 2000
const MINIMO_PERSONAL = 5550
const MINIMO_HIJO = [2400, 2700, 4000, 4500]
const MINIMO_MENOR_DE_3 = 2800

/** Base máxima mensual de cotización: la de 2026 y, después, con la inflación más 1,2 puntos al año */
export function baseMaxima(anio: number, inflacion = 0): number {
  return r2(BASE_MAXIMA_2026 * (1 + (inflacion + 1.2) / 100) ** Math.max(0, anio - ANIO_PARAMETROS))
}

/** Cotización del trabajador de un mes, con la base topada y la cuota de solidaridad por el exceso */
export function cotizacionMes(base: number, anio: number, inflacion = 0): number {
  if (!(base > 0)) return 0
  const maxima = baseMaxima(anio, inflacion)
  let cuota = (Math.min(base, maxima) * (TIPO_TRABAJADOR + mei(anio))) / 100
  let exceso = base - maxima
  let desde = 0
  for (const t of SOLIDARIDAD) {
    if (exceso <= 0) break
    const tramo = Math.min(exceso, t.hasta === Infinity ? exceso : (t.hasta - desde) * maxima)
    cuota += (tramo * t.tipo) / 100
    exceso -= tramo
    desde = t.hasta
  }
  return r2(cuota)
}

function escala(base: number): number {
  let cuota = 0
  let desde = 0
  for (const t of ESCALA) {
    if (base <= desde) break
    cuota += ((Math.min(base, t.hasta) - desde) * t.tipo) / 100
    desde = t.hasta
  }
  return cuota
}

/** Reducción por rendimientos del trabajo (rentas bajas) */
function reduccionTrabajo(neto: number): number {
  if (neto <= 14852) return 7302
  if (neto <= 17673.52) return 7302 - 1.75 * (neto - 14852)
  if (neto <= 19747.5) return 2364.34 - 1.14 * (neto - 17673.52)
  return 0
}

/** Mínimo personal y por descendientes (por mitad): menores de 25 años, con el aumento de los menores de 3 */
export function minimoFamiliar(hijos: number[], anio: number): number {
  const validos = hijos.filter((n) => anio - n >= 0 && anio - n < 25).sort((a, b) => a - b)
  let total = 0
  validos.forEach((nacimiento, i) => {
    total += MINIMO_HIJO[Math.min(i, MINIMO_HIJO.length - 1)]
    if (anio - nacimiento < 3) total += MINIMO_MENOR_DE_3
  })
  return MINIMO_PERSONAL + total / 2
}

/** Cuota anual de retención para una retribución sujeta y la Seguridad Social del año */
export function cuotaRetencion(retribucion: number, seguridadSocial: number, hijos: number[], anio: number): number {
  if (!(retribucion > 0)) return 0
  const neto = retribucion - seguridadSocial
  const base = Math.max(0, neto - OTROS_GASTOS - reduccionTrabajo(neto))
  return r2(Math.max(0, escala(base) - escala(minimoFamiliar(hijos, anio))))
}

const tipoDe = (cuota: number, retribucion: number) => (retribucion > 0 ? Math.min(47, Math.max(0, Math.round((cuota / retribucion) * 10000) / 100)) : 0)

// ---------------------------------------------------------------------------
// La nómina mes a mes
// ---------------------------------------------------------------------------

/** Lo que cambia la simulación sobre lo guardado en la nómina */
export interface AjusteNomina {
  /** Subida anual en porcentaje, en lugar de la guardada */
  subida?: number
  /** Porcentaje del bonus que se cobra, en lugar del guardado */
  consecucion?: number
  /** Inflación configurada: mueve la base máxima de cotización de los años futuros */
  inflacion?: number
}

export interface MesNomina {
  /** Bruto del mes: la paga y, si toca, la extra. Sin el bonus */
  bruto: number
  bonusBruto: number
  seguridadSocial: number
  /** Tipo de retención aplicado ese mes, en porcentaje */
  tipo: number
  irpf: number
  /** Lo que llega al banco por la paga (y la extra), sin el bonus */
  neto: number
  bonusNeto: number
}

const meses = (desde: string, hasta: string) => (Number(hasta.slice(0, 4)) - Number(desde.slice(0, 4))) * 12 + Number(hasta.slice(5, 7)) - Number(desde.slice(5, 7))
const clave = (anio: number, mes: number) => `${anio}-${String(mes).padStart(2, '0')}`

/** Cuántas subidas anuales lleva el sueldo escrito en ese mes (negativo antes de que rigiera) */
const subidas = (b: NominaBruta, mes: string) => Math.floor(meses(b.vigente_desde, mes) / 12)

/** Bruto fijo anual que rige en un mes, con las subidas anuales */
export function fijoEn(b: NominaBruta, mes: string, a: AjusteNomina = {}): number {
  return b.fijo_anual * (1 + (a.subida ?? b.subida_anual) / 100) ** subidas(b, mes)
}

/** Objetivo del bonus (al 100 %) que rige en un mes, con las subidas anuales */
export function objetivoEn(b: NominaBruta, mes: string, a: AjusteNomina = {}): number {
  return b.bonus_objetivo * (1 + (a.subida ?? b.subida_anual) / 100) ** subidas(b, mes)
}

/** Bonus bruto que se cobra en un mes: el objetivo de entonces por el porcentaje que se espera cobrar */
export function bonusEn(b: NominaBruta, mes: string, a: AjusteNomina = {}): number {
  if (!(b.bonus_objetivo > 0) || Number(mes.slice(5, 7)) !== b.bonus_mes) return 0
  return (b.bonus_objetivo * (1 + (a.subida ?? b.subida_anual) / 100) ** subidas(b, mes) * (a.consecucion ?? b.bonus_consecucion)) / 100
}

/**
 * Los doce meses de un año. «activo» dice en qué meses se cobra (una nómina puede empezar a mitad de año).
 */
export function calcularAnio(b: NominaBruta, anio: number, a: AjusteNomina = {}, activo: (mes: string) => boolean = () => true): MesNomina[] {
  const pagas = b.pagas === 14 ? 14 : 12
  const lista = Array.from({ length: 12 }, (_, i) => i + 1)
  const cobra = lista.map((m) => activo(clave(anio, m)))
  const esExtra = (m: number) => pagas === 14 && b.meses_extra.includes(m)
  // Bruto de cada mes con un nivel de fijo dado (para el tipo de enero) o con el real de cada mes
  const brutos = (fijo: (m: number) => number) => lista.map((m, i) => (cobra[i] ? (fijo(m) / pagas) * (esExtra(m) ? 2 : 1) : 0))
  const real = brutos((m) => fijoEn(b, clave(anio, m), a))
  const bonus = lista.map((m, i) => (cobra[i] ? bonusEn(b, clave(anio, m), a) : 0))
  const bonusAnual = bonus.reduce((s, x) => s + x, 0)
  // Lo que tributa cada mes: el bruto menos la retribución flexible exenta, más la especie sujeta
  const sujeto = (bruto: number[]) => lista.map((_, i) => (cobra[i] ? bruto[i] - b.flexible_mes + b.especie_mes : 0))
  const baseReal = sujeto(real)
  // Seguridad Social: cada mes, la doceava parte del fijo de entonces y del bonus del año
  const ss = lista.map((m, i) => (cobra[i] ? cotizacionMes(fijoEn(b, clave(anio, m), a) / 12 + bonusAnual / 12, anio, a.inflacion) : 0))
  const ssAnual = ss.reduce((s, x) => s + x, 0)

  let tipos: number[]
  if (b.tipo_actual && b.tipo_actual.anio === anio) {
    // El tipo de la nómina real manda en su año
    tipos = lista.map(() => b.tipo_actual!.porcentaje)
  } else {
    const anual = (base: number[]) => base.reduce((s, x) => s + x, 0) + bonusAnual
    // Enero: el sueldo de entonces todo el año y el bonus previsto
    const primerMes = lista.find((_, i) => cobra[i]) ?? 1
    const enero = sujeto(brutos(() => fijoEn(b, clave(anio, primerMes), a)))
    const inicial = tipoDe(cuotaRetencion(anual(enero), ssAnual, b.hijos, anio), anual(enero))
    // Mes de la subida: se regulariza con lo ya retenido
    const corte = b.subida_mes
    const cambia = corte > 1 && Math.abs(anual(baseReal) - anual(enero)) > 1
    let final = inicial
    if (cambia) {
      const retenido = lista.reduce((s, m, i) => (m < corte ? s + ((baseReal[i] + bonus[i]) * inicial) / 100 : s), 0)
      const resto = lista.reduce((s, m, i) => (m >= corte ? s + baseReal[i] + bonus[i] : s), 0)
      final = resto > 0 ? tipoDe(cuotaRetencion(anual(baseReal), ssAnual, b.hijos, anio) - retenido, resto) : inicial
    }
    tipos = lista.map((m) => (cambia && m >= corte ? final : inicial))
  }

  return lista.map((_, i) => {
    if (!cobra[i]) return { bruto: 0, bonusBruto: 0, seguridadSocial: 0, tipo: 0, irpf: 0, neto: 0, bonusNeto: 0 }
    const irpf = (baseReal[i] * tipos[i]) / 100
    return {
      bruto: r2(real[i]),
      bonusBruto: r2(bonus[i]),
      seguridadSocial: ss[i],
      tipo: tipos[i],
      irpf: r2(irpf),
      neto: r2(real[i] - b.flexible_mes - ss[i] - irpf),
      bonusNeto: r2(bonus[i] * (1 - tipos[i] / 100)),
    }
  })
}

// Un año se calcula una vez por nómina, ajuste y fechas: el plan recorre hasta 30 años mes a mes
const cache = new WeakMap<NominaBruta, Map<string, MesNomina[]>>()

/** Neto de un mes (AAAA-MM) de una nómina en bruto, dentro de sus fechas */
export function mesDeNomina(b: NominaBruta, mes: string, a: AjusteNomina = {}, desde: string | null = null, hasta: string | null = null): MesNomina {
  const anio = Number(mes.slice(0, 4))
  const k = `${anio}|${a.subida ?? ''}|${a.consecucion ?? ''}|${a.inflacion ?? ''}|${desde ?? ''}|${hasta ?? ''}`
  let porAnio = cache.get(b)
  if (!porAnio) cache.set(b, (porAnio = new Map()))
  let datos = porAnio.get(k)
  if (!datos) porAnio.set(k, (datos = calcularAnio(b, anio, a, (m) => (!desde || m >= desde) && (!hasta || m <= hasta))))
  return datos[Number(mes.slice(5, 7)) - 1]
}

/** Mes desde el que rige el sueldo que se escribe hoy: el último mes de subida ya pasado */
export function vigenteDesde(hoy: string, subidaMes: number): string {
  const anio = Number(hoy.slice(0, 4))
  return clave(Number(hoy.slice(5, 7)) >= subidaMes ? anio : anio - 1, subidaMes)
}

/** Resumen del año en curso de una nómina: un mes normal, la paga extra, el bonus y el total */
export function resumenBruta(b: NominaBruta, hoy: string, a: AjusteNomina = {}) {
  const anio = Number(hoy.slice(0, 4))
  const mesHoy = Number(hoy.slice(5, 7))
  const datos = calcularAnio(b, anio, a)
  const normal = datos.find((_, i) => i + 1 >= mesHoy && !(b.pagas === 14 && b.meses_extra.includes(i + 1))) ?? datos[mesHoy - 1]
  // Los próximos doce meses: lo que de verdad va a entrar
  let netoAnual = 0
  let bonusNeto = 0
  let bonusBruto = 0
  for (let i = 0; i < 12; i++) {
    const m = mesHoy + i
    const d = mesDeNomina(b, clave(anio + Math.floor((m - 1) / 12), ((m - 1) % 12) + 1), a)
    netoAnual += d.neto + d.bonusNeto
    if (d.bonusBruto) {
      bonusNeto = d.bonusNeto
      bonusBruto = d.bonusBruto
    }
  }
  const paga = fijoEn(b, hoy.slice(0, 7), a) / (b.pagas === 14 ? 14 : 12)
  return {
    netoMes: normal.neto,
    tipo: normal.tipo,
    seguridadSocial: normal.seguridadSocial,
    /** Una paga extra: sin Seguridad Social ni retribución flexible */
    netoExtra: b.pagas === 14 ? r2(paga * (1 - normal.tipo / 100)) : 0,
    bonusBruto: r2(bonusBruto),
    bonusNeto: r2(bonusNeto),
    netoAnual: r2(netoAnual),
  }
}
