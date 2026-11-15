/**
 * Plan de pagos de la deuda familiar (apartado 10). Supuesto: el ahorro de cada mes acaba en la cuenta
 * de ahorro (Cuenta 2) con los traspasos habituales, y la principal mantiene su nivel. Por eso se
 * proyecta el ahorro total, se suma al saldo de la cuenta de ahorro y, en el mes de referencia de cada
 * año (agosto), se paga todo lo que supere el colchón, sin pasar de la deuda pendiente.
 *
 * Ingresos previstos de cada mes: los del mismo mes del año anterior (nóminas y pagas extra en su mes)
 * o, sin un año de datos, la media de los meses cerrados. Gastos previstos: el presupuesto de cada
 * categoría o, si no lo tiene, su media. Más los gastos e ingresos previstos dados de alta.
 *
 * Crecimiento (v0.39.0): las nóminas en bruto suben cada año lo configurado, con su neto calculado
 * (`nomina.ts`), y el gasto sube con la inflación, salvo las categorías que no suben (la hipoteca a tipo
 * fijo). La simulación puede cambiar los porcentajes o quitar todo el crecimiento.
 */
import { porVersionYClave } from './cache'
import { anadirA } from './agrupar'
import { fechaDeLosDatos, gastoPorCategoria } from './extracto'
import { MESES, sumarDias, sumarMeses } from './fechas'
import { mesEfectivo } from './imputacion'
import { mesDeNomina, type AjusteNomina } from './nomina'
import { cuotaDe, cuotaPrestamo, cuotasHipotecaEn, finPrestamo, pendientePrestamo, valorBien } from './patrimonio'
import { actualDe, alquilerAnual, calcularVenta, hipotecaActual, inversionDe, precioPrevisto, viviendaHabitual, type AlquilerAnual, type Venta, type ViviendaActual } from './vivienda'
import { estadoEventos } from './previstos'
import { primerMes } from './prevision'
import { calcularTotales } from './resumen'
import { cuadrarCuenta } from './saldos'
import { calcularPosicion } from './posicion'
import type { BaseDatos, Compromiso, Cuenta, Movimiento, Nomina } from './tipos'

const redondear = (n: number) => Math.round(n * 100) / 100
const siguienteMes = (mes: string) => sumarMeses(`${mes}-01`, 1).slice(0, 7)
const diasDelMes = (mes: string) => Number(sumarDias(sumarMeses(`${mes}-01`, 1), -1).slice(8, 10))
const numMes = (mes: string) => Number(mes.slice(5, 7))

export interface Simulacion {
  /** Euros más (o menos) de ahorro cada mes */
  ahorroExtra: number
  /** Recorte de una categoría de gasto, en porcentaje */
  recorte: { categoria_id: string; porcentaje: number } | null
  /** Nóminas que se suman o se quitan solo en la simulación (por id); sin dato, lo guardado */
  nominas?: Record<string, boolean>
  /** Bonus que se quitan (false) en la simulación, por id de nómina; sin dato, cuenta */
  bonus?: Record<string, boolean>
  /** Otro colchón o otra deuda pendiente, solo en la simulación */
  colchon?: number
  deuda?: number
  /** Otra subida anual de sueldo, otro porcentaje de bonus cobrado u otra inflación, en porcentaje */
  subida?: number
  consecucion?: number
  inflacion?: number
  /** Sin subidas de sueldo ni inflación: todo plano, como antes de la v0.39.0 */
  sinCrecimiento?: boolean
  /** Comprar una vivienda (v0.41.0) */
  compra?: CompraVivienda | null
  /** No pagar la deuda familiar el año de la compra, para tener la entrada (v0.42.0) */
  pausarPago?: boolean
  /** Contar la nómina de la pareja: la que no cuenta en la previsión o, sin ella, su bruto (v0.42.0) */
  pareja?: boolean
}

/** Compra de una vivienda para simular su efecto en el plan y en el patrimonio */
export interface CompraVivienda {
  precio: number
  /** Mes de la compra (AAAA-MM), posterior al de los datos */
  mes: string
  /** Entrada y gastos de compra (impuesto, notaría, registro y gestoría), en porcentaje del precio */
  entrada_pct: number
  gastos_pct: number
  /** Hipoteca nueva: tipo fijo y años */
  interes: number
  anios: number
  /** Gastos de la vivienda al mes (IBI, comunidad, seguros y mantenimiento) */
  gastos_mes: number
  /** Alquiler que se cobra al mes, si es para alquilar */
  alquiler_mes: number
  uso: 'alquilar' | 'segunda' | 'vivir'
  /** Si es para vivir: qué se hace con la vivienda actual (v0.42.0) */
  actual?: ViviendaActual | null
  /**
   * Poner de entrada todo el dinero que haya ese mes por encima del colchón (con la venta, si se vende), y no
   * solo el mínimo de «entrada_pct»: el préstamo y la cuota bajan (v0.44.0)
   */
  entrada_maxima?: boolean
}

/** Cifras de la compra: entrada, gastos de compra, lo que sale de la cuenta, préstamo y cuota */
export function cifrasCompra(c: CompraVivienda) {
  const entrada = redondear((c.precio * c.entrada_pct) / 100)
  const gastos = redondear((c.precio * c.gastos_pct) / 100)
  const prestamo = redondear(Math.max(0, c.precio - entrada))
  return { entrada, gastos, desembolso: redondear(entrada + gastos), prestamo, cuota: cuotaDe(prestamo, c.interes, Math.round(c.anios * 12)) }
}

/** Dinero neto de la venta de la vivienda actual en una compra (0 si no se vende) */
function ventaDe(db: BaseDatos, c: CompraVivienda): number {
  const a = actualDe(c)
  return a?.destino === 'vender' ? calcularVenta(db, a.precio_venta, c.mes, c.precio).neto : 0
}

/** Año del último pago de la deuda en o antes de un mes: el de ese año o, si aún no ha llegado el mes de pago, el anterior */
function anioDelPagoAnterior(mes: string, mesReferencia: number): number {
  const anio = Number(mes.slice(0, 4))
  return numMes(mes) >= mesReferencia ? anio : anio - 1
}

/** Meses que la vivienda actual está alquilada en un año: desde el siguiente al de la compra */
const mesesAlquiladaEn = (mesCompra: string, anio: number) => (anio < Number(mesCompra.slice(0, 4)) ? 0 : anio === Number(mesCompra.slice(0, 4)) ? 12 - numMes(mesCompra) : 12)

/** Alquiler neto de IRPF de la vivienda actual en un mes (el IRPF se aparta cada mes) */
function alquilerNetoMes(db: BaseDatos, a: ViviendaActual, mesCompra: string, mes: string, ajuste: AjusteNomina): number {
  const anio = Number(mes.slice(0, 4))
  const meses = mesesAlquiladaEn(mesCompra, anio)
  return meses > 0 ? alquilerAnual(db, a, anio, ajuste, meses).cobro / meses : 0
}

/**
 * Lo que la compra suma a los gastos y a los ingresos de un mes, desde el siguiente al de la compra: la
 * cuota y los gastos de la nueva, su alquiler si es para alquilar, el alquiler neto de la actual si se
 * alquila y, si se vende, la cuota de la hipoteca actual que deja de pagarse (en negativo)
 */
function compraEnMes(db: BaseDatos, sim: Simulacion, mes: string, ajuste: AjusteNomina): { gasto: number; ingreso: number } {
  const c = sim.compra
  if (!c || mes <= c.mes) return { gasto: 0, ingreso: 0 }
  const { cuota } = cifrasCompra(c)
  const finCuota = sumarMeses(`${c.mes}-01`, Math.round(c.anios * 12)).slice(0, 7)
  let gasto = (mes <= finCuota ? cuota : 0) + c.gastos_mes
  let ingreso = c.uso === 'alquilar' ? c.alquiler_mes : 0
  const a = actualDe(c)
  if (a?.destino === 'vender') {
    const p = hipotecaActual(db)
    if (p && mes <= finPrestamo(p)) gasto -= cuotaPrestamo(p)
    // Al venderla dejan de pagarse también sus gastos (IBI, comunidad, seguro), que están en el gasto habitual
    gasto -= a.gastos_anio / 12
  }
  if (a?.destino === 'alquilar') ingreso += alquilerNetoMes(db, a, c.mes, mes, ajuste)
  return { gasto, ingreso }
}

// Con la nómina de la pareja: la que no cuenta en la previsión o, sin ella, una con su bruto
const cacheParejas = new WeakMap<BaseDatos, BaseDatos>()
function conPareja(db: BaseDatos): BaseDatos {
  const guardada = cacheParejas.get(db)
  if (guardada) return guardada
  const nominas = db.ajustes.nominas ?? []
  let r = db
  if (!nominas.some((n) => !n.incluida)) {
    const inv = inversionDe(db)
    const mia = nominas.find((n) => n.incluida && n.bruto)
    const pareja: Nomina = {
      id: 'pareja',
      nombre: 'Pareja',
      neto_mensual: 0,
      pagas: [],
      desde: null,
      hasta: null,
      incluida: false,
      bonus: null,
      bruto: {
        fijo_anual: inv.bruto_pareja,
        pagas: 12,
        meses_extra: [],
        bonus_objetivo: 0,
        bonus_consecucion: 100,
        bonus_mes: 8,
        flexible_mes: 0,
        especie_mes: 0,
        subida_anual: 0,
        subida_mes: 1,
        vigente_desde: '2000-01',
        hijos: mia?.bruto?.hijos ?? [],
        tipo_actual: null,
      },
    }
    r = inv.bruto_pareja > 0 ? { ...db, ajustes: { ...db.ajustes, nominas: [...nominas, pareja] } } : db
  }
  cacheParejas.set(db, r)
  return r
}

/** Los datos y la simulación con la pareja, si la simulación la cuenta: sus nóminas se suman */
function conLaPareja(db: BaseDatos, sim: Simulacion): [BaseDatos, Simulacion] {
  if (!sim.pareja) return [db, sim]
  const d = conPareja(db)
  const fuera = (d.ajustes.nominas ?? []).filter((n) => !n.incluida)
  return [d, { ...sim, nominas: { ...(sim.nominas ?? {}), ...Object.fromEntries(fuera.map((n) => [n.id, true])) } }]
}

/** Inflación anual del gasto que aplica: la guardada, la de la simulación o ninguna */
export const inflacionDe = (db: BaseDatos, sim: Simulacion) => (sim.sinCrecimiento ? 0 : (sim.inflacion ?? db.ajustes.prevision?.inflacion ?? 0))

/** Lo que la simulación cambia en el cálculo de las nóminas en bruto */
export const ajusteNominas = (db: BaseDatos, sim: Simulacion): AjusteNomina => ({
  subida: sim.sinCrecimiento ? 0 : sim.subida,
  consecucion: sim.consecucion,
  inflacion: inflacionDe(db, sim),
})

/**
 * El ajuste de cada nómina: la subida simulada no se aplica a la de la pareja calculada con su bruto, y sin
 * el bonus, la cotización y la retención se calculan también sin él
 */
function ajustePara(n: Nomina, ajuste: AjusteNomina, sim: Simulacion): AjusteNomina {
  return { ...ajuste, ...(n.id === 'pareja' ? { subida: 0 } : {}), ...(sim.bonus?.[n.id] === false ? { consecucion: 0 } : {}) }
}

/** Hay crecimiento configurado: alguna nómina en bruto con subida o inflación del gasto */
export const hayCrecimiento = (db: BaseDatos) =>
  (db.ajustes.prevision?.inflacion ?? 0) > 0 || (db.ajustes.nominas ?? []).some((n) => n.bruto && n.bruto.subida_anual !== 0)

export const SIN_SIMULACION: Simulacion = { ahorroExtra: 0, recorte: null }

/** Bonus neto de una nómina en un mes, dentro de sus fechas. En bruto, lo calcula la app */
export function bonusNomina(n: Nomina, mes: string, ajuste: AjusteNomina = {}): number {
  if ((n.desde && mes < n.desde) || (n.hasta && mes > n.hasta)) return 0
  if (n.bruto) return mesDeNomina(n.bruto, mes, ajuste, n.desde, n.hasta).bonusNeto
  if (!n.bonus || n.bonus.mes !== numMes(mes)) return 0
  return n.bonus.importe
}

/** Neto de una nómina en un mes (AAAA-MM): el mensual más la paga extra de ese mes (y el bonus, si se pide), dentro de sus fechas */
export function importeNomina(n: Nomina, mes: string, conBonus = false, ajuste: AjusteNomina = {}): number {
  if ((n.desde && mes < n.desde) || (n.hasta && mes > n.hasta)) return 0
  const bonus = conBonus ? bonusNomina(n, mes, ajuste) : 0
  if (n.bruto) return mesDeNomina(n.bruto, mes, ajuste, n.desde, n.hasta).neto + bonus
  return n.neto_mensual + n.pagas.filter((p) => p.mes === numMes(mes)).reduce((s, p) => s + p.importe, 0) + bonus
}

/**
 * Cómo crecen los ingresos y los gastos en la previsión, en una o dos frases (para la pantalla del plan,
 * el PDF y el texto para Claude).
 */
export function supuestosCrecimiento(db: BaseDatos): string {
  const num = (n: number) => String(n).replace('.', ',')
  const inflacion = db.ajustes.prevision?.inflacion ?? 0
  const bruta = (db.ajustes.nominas ?? []).find((n) => n.incluida && n.bruto)?.bruto
  const nombre = (id: string) => {
    const c = db.categorias.find((x) => x.id === id)
    const p = c?.padre_id ? db.categorias.find((x) => x.id === c.padre_id) : undefined
    return c ? (p ? `${p.nombre}, ${c.nombre}` : c.nombre) : ''
  }
  const fijas = (db.ajustes.prevision?.sin_inflacion ?? []).map(nombre).filter(Boolean)
  const partes: string[] = []
  if (bruta?.subida_anual) partes.push(`El sueldo sube un ${num(bruta.subida_anual)} % cada ${MESES[bruta.subida_mes - 1]}, en el fijo y en el bonus, y el neto se calcula con su retención.`)
  partes.push(inflacion ? `El gasto sube un ${num(inflacion)} % al año${fijas.length ? `, salvo ${fijas.join(' y ')}` : ''}.` : 'El gasto no sube con la inflación.')
  return partes.join(' ')
}

/** La nómina cobra bonus: en bruto, con un objetivo; en neto, con su importe */
export const tieneBonus = (n: Nomina | undefined) => !!n && (n.bruto ? n.bruto.bonus_objetivo > 0 : !!n.bonus)

/** La simulación cambia alguna nómina o quita algún bonus respecto a lo guardado */
export function simulaNominas(db: BaseDatos, sim: Simulacion): boolean {
  const lista = db.ajustes.nominas ?? []
  return (
    Object.entries(sim.nominas ?? {}).some(([id, v]) => lista.find((n) => n.id === id)?.incluida !== v) ||
    Object.entries(sim.bonus ?? {}).some(([id, v]) => v === false && tieneBonus(lista.find((n) => n.id === id)))
  )
}

/**
 * Escenario «con la segunda nómina»: las nóminas guardadas que no cuentan en la previsión, sumadas.
 * Null si no hay ninguna (para el PDF, que enseña siempre el plan actual y este escenario).
 */
export function escenarioNominas(db: BaseDatos): { sim: Simulacion; nombres: string[] } | null {
  const fuera = (db.ajustes.nominas ?? []).filter((n) => !n.incluida)
  if (!fuera.length) return null
  return { sim: { ...SIN_SIMULACION, nominas: Object.fromEntries(fuera.map((n) => [n.id, true])) }, nombres: fuera.map((n) => n.nombre) }
}

/** La simulación cambia algo respecto a lo guardado */
export const haySimulacion = (db: BaseDatos, sim: Simulacion) =>
  sim.ahorroExtra !== 0 ||
  sim.recorte !== null ||
  sim.colchon !== undefined ||
  sim.deuda !== undefined ||
  sim.subida !== undefined ||
  sim.consecucion !== undefined ||
  sim.inflacion !== undefined ||
  !!sim.sinCrecimiento ||
  !!sim.compra ||
  !!sim.pareja ||
  simulaNominas(db, sim)

/** Nóminas que cuentan: las incluidas, con lo que cambie la simulación */
export const nominasActivas = (db: BaseDatos, sim: Simulacion) => (db.ajustes.nominas ?? []).filter((n) => sim.nominas?.[n.id] ?? n.incluida)

/** Categorías de nómina: Ingresos > Nómina (y sus subcategorías, si las hubiera) */
function idsNomina(db: BaseDatos): Set<string> {
  const ids = new Set<string>()
  for (const c of db.categorias) if (c.naturaleza === 'ingreso' && c.nombre.trim().toLowerCase() === 'nómina') ids.add(c.id)
  for (const c of db.categorias) if (c.padre_id && ids.has(c.padre_id)) ids.add(c.id)
  return ids
}

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
  /** Capital y saldo de la cuenta de ahorro previstos a final de cada mes (el actual y 24 más), ya descontados los pagos */
  serie: PuntoCapital[]
  /** Con una compra en la simulación: lo que pide y si llega el dinero */
  compra: ResultadoCompra | null
  /** Mes a mes, unos once años como mínimo: saldo de la cuenta de ahorro antes y después del pago, y deuda tras él */
  trayectoria: PuntoPlan[]
  /** Capital de hoy (cuentas menos lo pendiente de la tarjeta) */
  capitalHoy: number
}

export interface PuntoPlan {
  mes: string
  antes: number
  saldo: number
  deuda: number
}

export interface ResultadoCompra {
  mes: string
  entrada: number
  gastos: number
  desembolso: number
  prestamo: number
  cuota: number
  /** Saldo previsto de la cuenta de ahorro ese mes, antes de la compra */
  saldoAntes: number
  /** Lo que falta en la cuenta de ahorro para pagar entrada y gastos (0 si llega) */
  falta: number
  /** Lo que queda por encima del colchón después de la compra (negativo: se come el colchón) */
  sobreColchon: number
  /** Venta de la vivienda actual, si se vende */
  venta: Venta | null
  /** Alquiler de la vivienda actual en el primer año entero, si se alquila */
  alquiler: AlquilerAnual | null
  /** Cuotas de hipoteca al mes después de la compra: la nueva y la actual, si no se vende */
  cuotas: number
  /** Cuotas sobre lo que cuenta el banco (nóminas netas y una parte del alquiler), en tanto por uno */
  esfuerzo: number | null
  /** Esfuerzo máximo de los supuestos, en tanto por uno */
  esfuerzoMax: number
}

export interface PuntoCapital {
  mes: string
  saldo: number
  capital: number
}

export type ResultadoPlan = { plan: Plan; falta: null } | { plan: null; falta: 'sin_compromiso' | 'sin_deuda' | 'sin_cuenta' | 'sin_saldo' | 'sin_historia' }

/** Ingresos y gasto por categoría raíz de cada mes, de una pasada */
interface Estadistica {
  ingresos: number
  /** De esos ingresos, los de nómina */
  nomina: number
  gastos: Map<string | null, number>
  /** De ese gasto, por categoría raíz, lo que no sube con la inflación */
  sinInflacion: Map<string | null, number>
}

// Una vez por cada versión de los datos: la simulación recalcula solo la proyección
const cacheEstadisticas = new WeakMap<BaseDatos, Map<string, Estadistica>>()
const cacheCapital = new WeakMap<BaseDatos, { capital: number | null }>()

/** Capital de hoy (posición), calculado una vez por cada versión de los datos */
function capitalDeHoy(db: BaseDatos): number | null {
  let c = cacheCapital.get(db)
  if (!c) {
    c = { capital: calcularPosicion(db)?.capital ?? null }
    cacheCapital.set(db, c)
  }
  return c.capital
}

function estadisticas(db: BaseDatos): Map<string, Estadistica> {
  const guardadas = cacheEstadisticas.get(db)
  if (guardadas) return guardadas
  const res = calcularEstadisticas(db)
  cacheEstadisticas.set(db, res)
  return res
}

function calcularEstadisticas(db: BaseDatos): Map<string, Estadistica> {
  const porMes = new Map<string, Movimiento[]>()
  for (const m of db.movimientos) anadirA(porMes, mesEfectivo(m), m)
  const nomina = idsNomina(db)
  // Categorías que no suben con la inflación: las marcadas y sus subcategorías
  const marcadas = new Set(db.ajustes.prevision?.sin_inflacion ?? [])
  const fijas = new Set(db.categorias.filter((c) => marcadas.has(c.id) || (c.padre_id && marcadas.has(c.padre_id))).map((c) => c.id))
  const res = new Map<string, Estadistica>()
  for (const [mes, movs] of porMes) {
    let n = 0
    for (const m of movs) if (m.tipo === 'normal' && m.categoria_id && nomina.has(m.categoria_id)) n += m.importe
    res.set(mes, {
      ingresos: calcularTotales(movs, db.categorias).ingresos,
      nomina: redondear(n),
      gastos: gastoPorCategoria(movs, db.categorias),
      sinInflacion: fijas.size ? gastoPorCategoria(movs.filter((m) => m.categoria_id && fijas.has(m.categoria_id)), db.categorias) : new Map(),
    })
  }
  return res
}

export interface IngresoNomina {
  id: string
  nombre: string
  /** Total del mes, con el bonus */
  importe: number
  /** De ese total, el bonus */
  bonus: number
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
  // De cada categoría, la parte que no sube con la inflación (la hipoteca a tipo fijo dentro de Vivienda)
  const mediaFija = new Map<string | null, number>()
  for (const m of cerrados) for (const [k, v] of stats.get(m)!.sinInflacion) mediaFija.set(k, (mediaFija.get(k) ?? 0) + v / n)
  const inflacion = inflacionDe(db, sim)
  const ajuste = ajusteNominas(db, sim)
  const [anioBase, mesBase] = base.split('-').map(Number)
  /** Cuánto ha subido el gasto en un mes futuro: la inflación anual, mes a mes desde el de los datos */
  const subidaGasto = (mes: string) => {
    const pasados = (Number(mes.slice(0, 4)) - anioBase) * 12 + Number(mes.slice(5, 7)) - mesBase
    return inflacion && pasados > 0 ? (1 + inflacion / 100) ** (pasados / 12) : 1
  }
  const prestamos = db.cuentas.filter((c) => c.tipo === 'hipoteca' && c.activa && c.prestamo).map((c) => c.prestamo!)
  const presupuestos = new Map(db.presupuestos.map((p) => [p.categoria_id, p]))
  for (const p of db.presupuestos) if (!mediaGasto.has(p.categoria_id)) mediaGasto.set(p.categoria_id, 0)

  // Con alguna nómina guardada como incluida, las nóminas mandan sobre el historial de nómina; el
  // resto de ingresos sigue saliendo del historial. Sin ninguna, todo sale del historial y las
  // simuladas se suman.
  const reemplaza = (db.ajustes.nominas ?? []).some((x) => x.incluida)
  const activas = nominasActivas(db, sim)
  const mediaNomina = n ? cerrados.reduce((s, m) => s + stats.get(m)!.nomina, 0) / n : 0
  const historico = (mes: string) => {
    const haceUnAno = sumarMeses(`${mes}-01`, -12).slice(0, 7)
    const st = cerrados.includes(haceUnAno) ? stats.get(haceUnAno)! : null
    const total = st ? st.ingresos : mediaIngresos
    return reemplaza ? total - (st ? st.nomina : mediaNomina) : total
  }
  const desglose = (mes: string) => {
    const nominas: IngresoNomina[] = activas
      .map((x) => {
        const aj = ajustePara(x, ajuste, sim)
        const bonus = sim.bonus?.[x.id] === false ? 0 : bonusNomina(x, mes, aj)
        return { id: x.id, nombre: x.nombre, importe: importeNomina(x, mes, false, aj) + bonus, bonus }
      })
      .filter((x) => x.importe > 0)
    // El alquiler de la vivienda que se simula comprar, con los otros ingresos
    return { nominas, otros: historico(mes) + compraEnMes(db, sim, mes, ajuste).ingreso, historicos: historico(mes) }
  }
  const ingresos = (mes: string) => {
    const d = desglose(mes)
    return d.otros + d.nominas.reduce((s, x) => s + x.importe, 0)
  }
  const gastoDe = (mes: string, conPresupuesto: boolean) => {
    let total = 0
    const sube = subidaGasto(mes)
    for (const [k, media] of mediaGasto) {
      const p = k && conPresupuesto ? presupuestos.get(k) : undefined
      const presupuesto = p ? (p.excepciones[mes] ?? p.importe_mensual) : 0
      let g = presupuesto > 0 ? presupuesto : media
      if (sim.recorte && k === sim.recorte.categoria_id) g *= 1 - sim.recorte.porcentaje / 100
      // Sube con la inflación todo menos la parte que no sube (como mucho, el gasto de la categoría)
      const fijo = Math.min(g, Math.max(0, mediaFija.get(k) ?? 0))
      total += fijo + (g - fijo) * sube
    }
    // La hipoteca que ya se paga deja de pagarse tras su última cuota; la de la compra simulada, se suma
    let terminadas = 0
    for (const p of prestamos) if (mes > finPrestamo(p)) terminadas += cuotaPrestamo(p)
    return Math.max(0, Math.max(0, total - terminadas) + compraEnMes(db, sim, mes, ajuste).gasto)
  }
  const gastos = (mes: string) => gastoDe(mes, true)
  return {
    meses: n,
    desglose,
    ingresos,
    gastos,
    /** El gasto previsto si no hubiera presupuestos: la media de cada categoría, con la inflación */
    gastosSegunMedia: (mes: string) => gastoDe(mes, false),
    /** Medias mensuales reales de los meses cerrados */
    real: { ingresos: mediaIngresos, nomina: mediaNomina, gastos: [...mediaGasto.values()].reduce((s, x) => s + x, 0) },
    cerrados,
    reemplaza,
    ahorro: (mes: string) => ingresos(mes) - gastos(mes) + sim.ahorroExtra,
  }
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

/**
 * Con «entrada_maxima», la entrada de la compra pasa a ser todo el dinero que habrá ese mes por encima del
 * colchón (y lo que deje la venta), menos los gastos de compra; como mínimo, la entrada mínima, y como mucho,
 * el precio. Se calcula con un primer plan con la entrada mínima: lo que hay antes de comprar no depende de ella
 */
function conEntrada(db: BaseDatos, hoy: string, sim: Simulacion): Simulacion {
  const c = sim.compra
  if (!c?.entrada_maxima) return sim
  const fija: Simulacion = { ...sim, compra: { ...c, entrada_maxima: false } }
  const plan = calcularPlanFijo(db, hoy, fija).plan
  const r = plan?.compra
  if (!plan || !r) return fija
  const colchon = sim.colchon ?? plan.compromiso.colchon
  const disponible = r.saldoAntes + (r.venta?.neto ?? 0) - colchon
  const entrada = Math.min(c.precio, Math.max(r.entrada, disponible - r.gastos))
  return { ...sim, compra: { ...c, entrada_maxima: false, entrada_pct: (entrada / c.precio) * 100 } }
}

export function calcularPlan(datosOriginales: BaseDatos, hoy: string, simulacion: Simulacion = SIN_SIMULACION): ResultadoPlan {
  return calcularPlanFijo(datosOriginales, hoy, conEntrada(datosOriginales, hoy, simulacion))
}

function calcularPlanFijo(datosOriginales: BaseDatos, hoy: string, simulacion: Simulacion): ResultadoPlan {
  const [db, sim] = conLaPareja(datosOriginales, simulacion)
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
  const deudaPendiente = redondear(Math.max(0, sim.deuda ?? compromiso.deuda_inicial - pagado))
  const colchon = sim.colchon ?? compromiso.colchon
  // Previstos pendientes por mes (con su signo)
  const puntuales = previstosPorMes(db, hoy)

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
    // El verano de este año, si ya se pagó dentro de la ventana, no lleva otro pago previsto
    if (mes.slice(0, 4) === mesDatos.slice(0, 4) && pagadoEnVentana(Number(mes.slice(0, 4)))) return false
    // Si se pausa el pago para tener la entrada: no se hace el último antes de la compra (el de ese año o, si
    // se compra antes del mes de pago, el del año anterior)
    if (sim.compra && sim.pausarPago && mes.slice(0, 4) === String(anioDelPagoAnterior(sim.compra.mes, compromiso.mes_referencia))) return false
    return n === compromiso.mes_referencia
  }

  const proximos = Array.from({ length: 12 }, (_, i) => sumarMeses(`${mesDatos}-01`, i + 1).slice(0, 7))
  let saldo = cuadre.saldoBanco
  let deuda = deudaPendiente
  let resultadoCompra: ResultadoCompra | null = null
  const trayectoria: PuntoPlan[] = []
  const inv = inversionDe(db)
  const pagos: PagoPrevisto[] = []
  const capitalHoy = capitalDeHoy(db) ?? cuadre.saldoBanco
  const serie: PuntoCapital[] = []
  let mes = mesDatos
  // Hasta saldarla y, como mínimo, once años: dos para ver el capital y diez para comparar el patrimonio
  for (let i = 0; i < 30 * 12 && (deuda > 0 || i <= 132); i++, mes = siguienteMes(mes)) {
    // Del mes de los datos, solo los días que quedan (el saldo de la cuenta sigue igual hasta su último dato)
    const parte = i === 0 ? (diasDelMes(mes) - Number(datos.slice(8, 10))) / diasDelMes(mes) : 1
    const ahorro = mod.ahorro(mes) * Math.max(0, parte) + (puntuales.get(mes) ?? 0)
    saldo += ahorro
    // Primero el pago de la deuda, si toca y no se pausa; después, la compra
    const antes = saldo
    if (deuda > 0 && esMesDePago(mes)) {
      const pago = redondear(Math.min(deuda, Math.max(0, saldo - colchon)))
      deuda = redondear(deuda - pago)
      saldo -= pago
      pagos.push({ anio: Number(mes.slice(0, 4)), mes, saldo: redondear(saldo + pago), pago, deudaTras: deuda })
    }
    // La compra de la simulación: entrada y gastos salen de la cuenta de ahorro ese mes
    if (sim.compra && mes === sim.compra.mes) {
      const c = cifrasCompra(sim.compra)
      const a = actualDe(sim.compra)
      const saldoAntes = redondear(saldo)
      // Si se vende la actual, el dinero neto de la venta entra el mismo mes y va a la compra
      const venta = a?.destino === 'vender' ? calcularVenta(db, a.precio_venta, mes, sim.compra.precio) : null
      saldo += (venta?.neto ?? 0) - c.desembolso
      const siguientes = Array.from({ length: 12 }, (_, j) => sumarMeses(`${mes}-01`, j + 1).slice(0, 7))
      // Las nóminas previstas del año siguiente
      const previstas = siguientes.reduce((s, m) => s + mod.desglose(m).nominas.reduce((t, x) => t + x.importe, 0), 0) / 12
      // Sin ninguna nómina guardada que cuente, la del historial más las que se simulan
      const neto = mod.reemplaza ? previstas : mod.real.nomina + previstas
      // El banco cuenta una parte del alquiler: el de la nueva si es para alquilar y el de la actual si se alquila
      const alquileres = (sim.compra.uso === 'alquilar' ? sim.compra.alquiler_mes : 0) + (a?.destino === 'alquilar' ? (a.alquiler_mes * (12 - a.meses_vacia)) / 12 : 0)
      const ingresosBanco = neto + (alquileres * inv.alquiler_banco) / 100
      const cuotas = (a?.destino === 'vender' ? 0 : cuotasHipotecaEn(db, siguientes[0])) + c.cuota
      const anioSiguiente = Number(siguientes[11].slice(0, 4))
      resultadoCompra = {
        mes,
        ...c,
        saldoAntes,
        venta,
        alquiler: a?.destino === 'alquilar' ? alquilerAnual(db, a, anioSiguiente, ajusteNominas(db, sim)) : null,
        falta: redondear(Math.max(0, c.desembolso - saldoAntes - (venta?.neto ?? 0))),
        sobreColchon: redondear(saldoAntes + (venta?.neto ?? 0) - c.desembolso - colchon),
        cuotas: redondear(cuotas),
        esfuerzo: ingresosBanco > 0 ? cuotas / ingresosBanco : null,
        esfuerzoMax: inv.esfuerzo_max / 100,
      }
    }
    if (i <= 24) serie.push({ mes, saldo: redondear(saldo), capital: redondear(capitalHoy + saldo - cuadre.saldoBanco) })
    trayectoria.push({ mes, antes: redondear(antes), saldo: redondear(saldo), deuda })
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
      serie,
      compra: resultadoCompra,
      trayectoria,
      capitalHoy,
    },
  }
}

export interface MesIngresos {
  mes: string
  nominas: IngresoNomina[]
  /** Otros ingresos, según el historial (y la nómina, si no hay ninguna guardada como incluida) */
  otros: number
  total: number
}

/**
 * Previsión de ingresos de los 12 próximos meses (desde el siguiente al de los datos) y capital previsto,
 * sin pagos de deuda: el de hoy más el ahorro previsto de cada mes. Null sin un mes cerrado de datos.
 */
export function preverIngresos(
  datosOriginales: BaseDatos,
  hoy: string,
  simulacion: Simulacion = SIN_SIMULACION,
): { meses: MesIngresos[]; ahorroMensual: number; capitalHoy: number | null; capital12: number | null; mediaNomina: number | null } | null {
  const [db, sim] = conLaPareja(datosOriginales, conEntrada(datosOriginales, hoy, simulacion))
  const stats = estadisticas(db)
  const datos = fechaDeLosDatos(db, hoy)
  const mesDatos = datos.slice(0, 7)
  const mod = modelo(db, stats, mesDatos, sim)
  if (!mod.meses) return null
  const meses = Array.from({ length: 12 }, (_, i) => {
    const mes = sumarMeses(`${mesDatos}-01`, i + 1).slice(0, 7)
    const d = mod.desglose(mes)
    const otros = redondear(Math.max(0, d.otros))
    return { mes, nominas: d.nominas, otros, total: redondear(otros + d.nominas.reduce((s, x) => s + x.importe, 0)) }
  })
  const puntuales = previstosPorMes(db, hoy)
  const resto = (diasDelMes(mesDatos) - Number(datos.slice(8, 10))) / diasDelMes(mesDatos)
  const ahorroDe = (mes: string) => mod.ahorro(mes) + (puntuales.get(mes) ?? 0)
  const capitalHoy = capitalDeHoy(db)
  const suma12 = meses.reduce((s, m) => s + ahorroDe(m.mes), 0)
  // Media de nómina real de los meses cerrados, como referencia para darla de alta
  const primero = primerMes(db)
  const cerrados = [...stats.keys()].filter((m) => m > primero && m < mesDatos).sort().slice(-12)
  const conNomina = cerrados.filter((m) => stats.get(m)!.nomina > 0)
  return {
    meses,
    ahorroMensual: redondear(suma12 / 12),
    capitalHoy,
    // La compra simulada saca la entrada y los gastos de las cuentas si cae en estos 12 meses
    capital12:
      capitalHoy === null
        ? null
        : redondear(
            capitalHoy +
              mod.ahorro(mesDatos) * Math.max(0, resto) +
              (puntuales.get(mesDatos) ?? 0) +
              suma12 -
              (sim.compra && meses.some((m) => m.mes === sim.compra!.mes) ? cifrasCompra(sim.compra).desembolso - ventaDe(db, sim.compra) : 0),
          ),
    mediaNomina: conNomina.length ? redondear(conNomina.reduce((s, m) => s + stats.get(m)!.nomina, 0) / conNomina.length) : null,
  }
}

/** Previstos pendientes por mes (con su signo) */
function previstosPorMes(db: BaseDatos, hoy: string): Map<string, number> {
  const res = new Map<string, number>()
  for (const e of estadoEventos(db, hoy)) if (e.estado === 'pendiente') res.set(e.evento.fecha.slice(0, 7), (res.get(e.evento.fecha.slice(0, 7)) ?? 0) + e.evento.importe)
  return res
}

export interface Comprobacion {
  /** Meses cerrados en los que se basa la previsión */
  meses: number
  /** Hay nóminas guardadas que cuentan: sustituyen a la nómina del historial. Sin ellas, todo el ingreso previsto sale del historial */
  conNominas: boolean
  /** Medias mensuales de esos meses */
  real: { nominas: number; otros: number; gastos: number; ahorro: number }
  /** Medias mensuales de los 12 próximos. «extra» es el ahorro de más de la simulación */
  previsto: { nominas: number; otros: number; gastos: number; puntuales: number; extra: number; ahorro: number }
  /** Lo que los presupuestos bajan (en positivo) o suben el gasto previsto frente a la media, al mes */
  presupuestos: number
  /** Lo que ha subido el capital al mes según el banco (sin los pagos de deuda) frente al ahorro del extracto, en los mismos meses */
  banco: { meses: number; capital: number; extracto: number } | null
  avisos: string[]
}

/**
 * De dónde sale el ahorro previsto (v0.40.0): las medias de los 12 próximos meses frente a las de los
 * meses cerrados, y lo que conviene revisar si la previsión se aleja del historial. Null sin un mes cerrado.
 */
export function comprobarPrevision(datosOriginales: BaseDatos, hoy: string, simulacion: Simulacion = SIN_SIMULACION): Comprobacion | null {
  const [db, sim] = conLaPareja(datosOriginales, conEntrada(datosOriginales, hoy, simulacion))
  const stats = estadisticas(db)
  const mesDatos = fechaDeLosDatos(db, hoy).slice(0, 7)
  const mod = modelo(db, stats, mesDatos, sim)
  if (!mod.meses) return null
  const proximos = Array.from({ length: 12 }, (_, i) => sumarMeses(`${mesDatos}-01`, i + 1).slice(0, 7))
  const puntuales = previstosPorMes(db, hoy)
  const media = (f: (mes: string) => number) => proximos.reduce((s, m) => s + f(m), 0) / 12
  const nominas = media((m) => mod.desglose(m).nominas.reduce((s, x) => s + x.importe, 0))
  const otros = media((m) => mod.desglose(m).otros)
  const gastos = media(mod.gastos)
  const previsto = {
    nominas: redondear(nominas),
    otros: redondear(otros),
    gastos: redondear(gastos),
    puntuales: redondear(media((m) => puntuales.get(m) ?? 0)),
    extra: sim.ahorroExtra,
    ahorro: redondear(media((m) => mod.ahorro(m) + (puntuales.get(m) ?? 0))),
  }
  const real = {
    nominas: redondear(mod.real.nomina),
    otros: redondear(mod.real.ingresos - mod.real.nomina),
    gastos: redondear(mod.real.gastos),
    ahorro: redondear(mod.real.ingresos - mod.real.gastos),
  }
  const presupuestos = redondear(media(mod.gastosSegunMedia) - gastos)

  // Con el banco: lo que ha variado el capital en los meses cerrados (sin los pagos de deuda) frente al extracto
  let banco: Comprobacion['banco'] = null
  const evolucion = calcularPosicion(db)?.evolucion ?? []
  let capital = 0
  let extracto = 0
  let n = 0
  for (let i = 1; i < evolucion.length; i++) {
    const { mes } = evolucion[i]
    if (mes >= mesDatos || !mod.cerrados.includes(mes) || evolucion[i - 1].mes !== sumarMeses(`${mes}-01`, -1).slice(0, 7)) continue
    const st = stats.get(mes)
    if (!st) continue
    let deuda = 0
    for (const m of db.movimientos) if (m.tipo === 'pago_deuda' && m.fecha_operacion.slice(0, 7) === mes) deuda -= m.importe
    capital += evolucion[i].capital - evolucion[i - 1].capital + deuda
    extracto += st.ingresos - [...st.gastos.values()].reduce((s, x) => s + x, 0)
    n++
  }
  if (n >= 2) banco = { meses: n, capital: redondear(capital / n), extracto: redondear(extracto / n) }

  const eur = (x: number) => `${Math.round(Math.abs(x)).toLocaleString('es-ES', { useGrouping: 'always' } as Intl.NumberFormatOptions)} €`
  const avisos: string[] = []
  if (mod.meses < 12)
    avisos.push(
      `La previsión se basa en ${mod.meses === 1 ? 'un mes cerrado' : `${mod.meses} meses cerrados`}. Hasta tener un año, los gastos de una vez al año (seguros, impuestos, vacaciones, colegio) pueden no estar en la media: añádelos en Gastos previstos.`,
    )
  if (mod.reemplaza && previsto.nominas > 0 && real.nominas > 0 && previsto.nominas > real.nominas * 1.15)
    avisos.push(
      `Tus nóminas previstas dan ${eur(previsto.nominas)} al mes de media, con pagas y bonus, y en tu historial entran ${eur(real.nominas)}. Es normal si el historial no incluye todavía el bonus o alguna paga, o si la nómina ha subido; si no, revisa el bruto y el porcentaje del bonus.`,
    )
  const otrosHistoricos = media((m) => mod.desglose(m).historicos)
  if (mod.reemplaza && otrosHistoricos > 100 && otrosHistoricos > previsto.nominas * 0.1)
    avisos.push(
      `La previsión cuenta con ${eur(otrosHistoricos)} al mes de otros ingresos, según tu historial. Si ahí hay nóminas, pagas o un bonus sin la categoría Ingresos, Nómina, se están contando dos veces.`,
    )
  if (presupuestos > Math.max(50, real.gastos * 0.05)) avisos.push(`Tus presupuestos suman ${eur(presupuestos)} al mes menos de lo que gastas de media. La previsión cuenta con que los cumples.`)
  if (banco && banco.extracto - banco.capital > Math.max(300, Math.abs(banco.extracto) * 0.25))
    avisos.push(
      `En los últimos ${banco.meses} meses el extracto da un ahorro de ${eur(banco.extracto)} al mes, pero tu capital ha ${banco.capital >= 0 ? 'subido' : 'bajado'} ${eur(banco.capital)}. Parte del ahorro no se queda en tus cuentas: revisa si hay salidas marcadas como traspaso o como que no cuentan.`,
    )
  return { meses: mod.meses, conNominas: mod.reemplaza, real, previsto, presupuestos, banco, avisos }
}

export interface AnioPrevisto {
  anio: number
  /** Fijo y bonus brutos de las nóminas en bruto que cuentan; null si ninguna está en bruto */
  bruto: number | null
  bonusBruto: number
  seguridadSocial: number
  irpf: number
  /** IRPF retenido sobre el bruto, en porcentaje; null sin nóminas en bruto */
  retencion: number | null
  /** Lo que llega al banco por las nóminas, con pagas y bonus */
  neto: number
  /** Del año de los datos solo se enseñan los ingresos: el resto del año ya es en parte real */
  otros: number | null
  gastos: number | null
  ahorro: number | null
}

/**
 * Evolución por años naturales (v0.40.0), desde el de los datos: bruto, retención y neto de las nóminas
 * y, en los años siguientes, otros ingresos, gasto y ahorro previstos. Con el mismo modelo que el plan.
 */
export function evolucionAnual(datosOriginales: BaseDatos, hoy: string, simulacion: Simulacion = SIN_SIMULACION, anios = 6): AnioPrevisto[] | null {
  const [db, sim] = conLaPareja(datosOriginales, conEntrada(datosOriginales, hoy, simulacion))
  const stats = estadisticas(db)
  const mesDatos = fechaDeLosDatos(db, hoy).slice(0, 7)
  const mod = modelo(db, stats, mesDatos, sim)
  if (!mod.meses) return null
  const ajuste = ajusteNominas(db, sim)
  const activas = nominasActivas(db, sim)
  const puntuales = previstosPorMes(db, hoy)
  const primero = Number(mesDatos.slice(0, 4))
  const hayBruta = activas.some((n) => n.bruto)
  return Array.from({ length: anios }, (_, i) => {
    const anio = primero + i
    const futuro = i > 0
    let bruto = 0
    let bonusBruto = 0
    let seguridadSocial = 0
    let irpf = 0
    let neto = 0
    let otros = 0
    let gastos = 0
    let ahorro = 0
    for (let m = 1; m <= 12; m++) {
      const mes = `${anio}-${String(m).padStart(2, '0')}`
      for (const n of activas) {
        const conBonus = sim.bonus?.[n.id] !== false
        const aj = ajustePara(n, ajuste, sim)
        neto += importeNomina(n, mes, conBonus, aj)
        if (!n.bruto || (n.desde && mes < n.desde) || (n.hasta && mes > n.hasta)) continue
        const d = mesDeNomina(n.bruto, mes, aj, n.desde, n.hasta)
        bruto += d.bruto + (conBonus ? d.bonusBruto : 0)
        bonusBruto += conBonus ? d.bonusBruto : 0
        seguridadSocial += d.seguridadSocial
        irpf += d.irpf + (conBonus ? d.bonusBruto - d.bonusNeto : 0)
      }
      if (futuro) {
        otros += mod.desglose(mes).otros
        gastos += mod.gastos(mes)
        ahorro += mod.ahorro(mes) + (puntuales.get(mes) ?? 0)
      }
    }
    return {
      anio,
      bruto: hayBruta ? redondear(bruto) : null,
      bonusBruto: redondear(bonusBruto),
      seguridadSocial: redondear(seguridadSocial),
      irpf: redondear(irpf),
      retencion: hayBruta && bruto > 0 ? Math.round((irpf / bruto) * 1000) / 10 : null,
      neto: redondear(neto),
      otros: futuro ? redondear(otros) : null,
      gastos: futuro ? redondear(gastos) : null,
      ahorro: futuro ? redondear(ahorro) : null,
    }
  })
}

/**
 * Efecto del último mes cerrado en el pago del próximo verano: ahorro real frente al que se preveía
 * para ese mes con los meses anteriores. Lo que se ahorra de más va entero al pago.
 */
function calcularEfecto(db: BaseDatos, hoy: string): { mes: string; real: number; previsto: number; diferencia: number } | null {
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

// Una vez por versión de los datos y día (v0.34.0): el Extracto, Informes y el plan lo comparten
export const efectoMesCerrado = porVersionYClave(calcularEfecto)

// ---------------------------------------------------------------------------
// ¿Cuánto puedo comprar? y vender o alquilar la vivienda actual (v0.42.0)
// ---------------------------------------------------------------------------

/** Baja a miles, sin perder uno por los decimales cuando la cuenta da una cifra exacta (7.500 / 0,3) */
export const aMiles = (n: number) => Math.floor((n + 0.005) / 1000) * 1000

/** Lo que se puede pedir prestado con una cuota, un tipo fijo y un plazo */
function prestamoCon(cuota: number, interes: number, meses: number): number {
  if (!(cuota > 0) || !(meses > 0)) return 0
  const r = interes / 1200
  return redondear(r === 0 ? cuota * meses : (cuota * (1 - (1 + r) ** -meses)) / r)
}

export type Limite = 'entrada' | 'cuota'

export interface PrecioMaximo {
  /** Dinero para entrada y gastos: lo que hay por encima del colchón y, si se vende, la venta */
  efectivo: number
  precio: number
  limite: Limite
}

export interface FilaCapacidad {
  mes: string
  /** Lo que cuenta el banco al mes: nóminas netas y una parte del alquiler */
  ingresosBanco: number
  /** Cuota máxima con el esfuerzo de los supuestos, ya descontada la hipoteca actual si se mantiene */
  cuotaMax: number
  pagando: PrecioMaximo
  pausando: PrecioMaximo
  /** Precio máximo pausando el pago, con un 35 % de esfuerzo */
  precio35: number
}

export interface Capacidad {
  filas: FilaCapacidad[]
  entrada_pct: number
  gastos_pct: number
  interes: number
  anios: number
  esfuerzo: number
  /** Se vende y no hay vivienda habitual con valor: no se sabe lo que deja la venta */
  sinVivienda: boolean
  /** Todo el dinero disponible va a la entrada (si no, la entrada es la mínima) */
  todoElDinero: boolean
}

/**
 * Precio máximo de una vivienda comprada cada año en el mes de la compra simulada (o el del pago de la
 * deuda), pagando ese año la deuda o pausando ese pago. Lo limita lo primero que se alcance: el dinero para
 * la entrada y los gastos, o la cuota máxima que admite el banco con el esfuerzo de los supuestos.
 */
export function capacidadCompra(datos: BaseDatos, hoy: string, sim: Simulacion, opciones: { pareja: boolean; destino: ViviendaActual['destino'] }): Capacidad | null {
  const simBase: Simulacion = { ...sim, compra: null, pausarPago: false, pareja: opciones.pareja }
  const plan = calcularPlan(datos, hoy, simBase).plan
  if (!plan) return null
  const [db, s] = conLaPareja(datos, simBase)
  const mesDatos = fechaDeLosDatos(db, hoy).slice(0, 7)
  const mod = modelo(db, estadisticas(db), mesDatos, s)
  const c = sim.compra
  const inv = inversionDe(db)
  const p = { entrada: c?.entrada_pct ?? 20, gastos: c?.gastos_pct ?? 12, interes: c?.interes ?? 3, anios: c?.anios ?? 25 }
  const mesDelAnio = String(c ? numMes(c.mes) : plan.compromiso.mes_referencia).padStart(2, '0')
  const a = c?.actual
  const alquiler = opciones.destino === 'alquilar' ? ((a?.alquiler_mes ?? 0) * (12 - (a?.meses_vacia ?? 0))) / 12 : 0
  const hipoteca = hipotecaActual(db)
  const sinVivienda = opciones.destino === 'vender' && !viviendaHabitual(db)
  const e = p.entrada / 100
  const g = p.gastos / 100
  // Sin compra simulada, o con ella y «todo el dinero como entrada», se cuenta con todo el dinero disponible
  const todoElDinero = c ? !!c.entrada_maxima : true
  const filas: FilaCapacidad[] = []
  for (let anio = Number(mesDatos.slice(0, 4)); filas.length < 6 && anio < Number(mesDatos.slice(0, 4)) + 12; anio++) {
    const mes = `${anio}-${mesDelAnio}`
    if (mes <= mesDatos) continue
    const t = plan.trayectoria.find((x) => x.mes === mes)
    if (!t) break
    const siguientes = Array.from({ length: 12 }, (_, j) => sumarMeses(`${mes}-01`, j + 1).slice(0, 7))
    const previstas = siguientes.reduce((sum, m) => sum + mod.desglose(m).nominas.reduce((x, n) => x + n.importe, 0), 0) / 12
    const ingresosBanco = redondear((mod.reemplaza ? previstas : mod.real.nomina + previstas) + (alquiler * inv.alquiler_banco) / 100)
    const existentes = opciones.destino === 'vender' || !hipoteca || siguientes[0] > finPrestamo(hipoteca) ? 0 : cuotaPrestamo(hipoteca)
    // Si se vende: el precio previsto de la vivienda habitual; reinvertido en la nueva, la ganancia queda exenta
    const venta = opciones.destino === 'vender' && !sinVivienda ? calcularVenta(db, precioPrevisto(db, mes), mes, Infinity).neto : 0
    const cuotaCon = (esfuerzo: number) => Math.max(0, esfuerzo * ingresosBanco - existentes)
    const maximo = (efectivo: number, esfuerzo: number): PrecioMaximo => {
      const disponible = Math.max(0, efectivo)
      // El dinero llega para la entrada mínima y los gastos
      const porEntrada = e + g > 0 ? disponible / (e + g) : Infinity
      const prestamo = prestamoCon(cuotaCon(esfuerzo), p.interes, Math.round(p.anios * 12))
      // La cuota: con todo el dinero como entrada, el precio es el préstamo máximo más lo que queda tras los
      // gastos; con la entrada fija, el préstamo es el precio menos esa entrada. Igual que al simularla
      const porCuota = todoElDinero ? (disponible + prestamo) / (1 + g) : e < 1 ? prestamo / (1 - e) : Infinity
      return { efectivo: redondear(efectivo), precio: aMiles(Math.min(porEntrada, porCuota)), limite: porEntrada <= porCuota ? 'entrada' : 'cuota' }
    }
    // Pausar: el pago de ese año, si ya se habría hecho, se queda en la cuenta
    const pagoDelAnio = plan.pagos.find((x) => x.anio === anioDelPagoAnterior(mes, plan.compromiso.mes_referencia))?.pago ?? 0
    const colchon = sim.colchon ?? plan.compromiso.colchon
    const pagando = t.saldo - colchon + venta
    const pausando = pagando + pagoDelAnio
    filas.push({
      mes,
      ingresosBanco,
      cuotaMax: redondear(cuotaCon(inv.esfuerzo_max / 100)),
      pagando: maximo(pagando, inv.esfuerzo_max / 100),
      pausando: maximo(pausando, inv.esfuerzo_max / 100),
      precio35: maximo(pausando, 0.35).precio,
    })
  }
  return { filas, entrada_pct: p.entrada, gastos_pct: p.gastos, interes: p.interes, anios: p.anios, esfuerzo: inv.esfuerzo_max, sinVivienda, todoElDinero }
}

export interface ResultadoDestino {
  destino: 'vender' | 'alquilar'
  /** Ahorros que hacen falta para la compra (negativo: la venta deja dinero de más) */
  ahorros: number
  /** Lo que falta en la cuenta de ahorro (0 si llega) */
  falta: number
  /** Cuotas de hipoteca al mes después de la compra */
  cuotas: number
  /** Alquiler neto al mes de la vivienda actual, después de gastos e IRPF */
  alquilerNeto: number
  /** Ahorro medio al mes en el año siguiente a la compra */
  ahorroMensual: number
  esfuerzo: number | null
  saldadaEn: number | null
  /** Patrimonio neto previsto dentro de 5 y de 10 años */
  patrimonio5: number | null
  patrimonio10: number | null
}

/** Patrimonio neto previsto en un mes con la compra: liquidez, viviendas revalorizadas, otros activos y deudas */
function patrimonioPrevisto(db: BaseDatos, plan: Plan, c: CompraVivienda, hoy: string, mes: string): number | null {
  const t = plan.trayectoria.find((x) => x.mes === mes)
  if (!t) return null
  const inv = inversionDe(db)
  const sube = (anios: number) => (1 + inv.revalorizacion / 100) ** Math.max(0, anios)
  const aniosEntre = (desde: string, hasta: string) => ((Number(hasta.slice(0, 4)) - Number(desde.slice(0, 4))) * 12 + Number(hasta.slice(5, 7)) - Number(desde.slice(5, 7))) / 12
  const vendida = actualDe(c)?.destino === 'vender' && mes >= c.mes
  let bienes = 0
  for (const b of db.ajustes.bienes ?? []) {
    if (vendida && b.habitual) continue
    // Los inmuebles se revalorizan desde su última valoración, como el precio de venta previsto
    const ultima = b.valoraciones.filter((v) => v.fecha <= hoy).at(-1) ?? b.valoraciones[0]
    const valor = valorBien(b, hoy)
    bienes += b.tipo === 'inmueble' && ultima ? valor * sube(aniosEntre(ultima.fecha.slice(0, 7), mes)) : valor
  }
  if (mes >= c.mes) bienes += c.precio * sube(aniosEntre(c.mes, mes))
  const actual = hipotecaActual(db)
  const fecha = `${mes}-28`
  const hipotecas =
    (actual && !vendida ? pendientePrestamo(actual, fecha) : 0) +
    (mes >= c.mes ? pendientePrestamo({ capital: cifrasCompra(c).prestamo, fecha: `${c.mes}-01`, interes: c.interes, plazo_meses: Math.round(c.anios * 12) }, fecha) : 0)
  return Math.round(plan.capitalHoy + t.saldo - plan.saldo + bienes - hipotecas - t.deuda)
}

/** Comprar para vivir y vender o alquilar la actual: las dos opciones con la misma compra */
export function compararDestinos(db: BaseDatos, hoy: string, sim: Simulacion): ResultadoDestino[] | null {
  const c = sim.compra
  if (!c || c.uso !== 'vivir') return null
  const mesDatos = fechaDeLosDatos(db, hoy).slice(0, 7)
  // Sin datos de la vivienda actual (si se mantiene), la venta al precio previsto de la vivienda habitual
  const base: ViviendaActual = c.actual ?? { destino: 'mantener', precio_venta: precioPrevisto(db, c.mes), alquiler_mes: 0, meses_vacia: 1, gastos_anio: 0 }
  const resultados: ResultadoDestino[] = []
  for (const destino of ['vender', 'alquilar'] as const) {
    const compra = { ...c, actual: { ...base, destino } }
    const plan = calcularPlan(db, hoy, { ...sim, compra }).plan
    const r = plan?.compra
    if (!plan || !r) return null
    const i = plan.trayectoria.findIndex((x) => x.mes === c.mes)
    const fin = plan.trayectoria[i + 12]
    const pagados = plan.pagos.filter((x) => x.mes > c.mes && fin && x.mes <= fin.mes).reduce((sum, x) => sum + x.pago, 0)
    resultados.push({
      destino,
      ahorros: redondear(r.desembolso - (r.venta?.neto ?? 0)),
      falta: r.falta,
      cuotas: r.cuotas,
      alquilerNeto: r.alquiler ? redondear(r.alquiler.neto / 12) : 0,
      ahorroMensual: fin ? redondear((fin.saldo - plan.trayectoria[i].saldo + pagados) / 12) : 0,
      esfuerzo: r.esfuerzo,
      saldadaEn: plan.saldadaEn,
      patrimonio5: patrimonioPrevisto(db, plan, compra, hoy, sumarMeses(`${mesDatos}-01`, 60).slice(0, 7)),
      patrimonio10: patrimonioPrevisto(db, plan, compra, hoy, sumarMeses(`${mesDatos}-01`, 120).slice(0, 7)),
    })
  }
  return resultados
}
