/**
 * Patrimonio completo (v0.41.0): liquidez de las cuentas, inmuebles y otros activos con valor manual,
 * hipoteca calculada con su cuadro de amortización y deuda familiar. Patrimonio neto y su evolución.
 */
import { porVersionYClave } from './cache'
import { ultimoDeMes } from './fechas'
import { calcularPosicion } from './posicion'
import type { BaseDatos, Bien, Compromiso, Cuenta, Prestamo, TipoBien } from './tipos'

const r2 = (n: number) => Math.round(n * 100) / 100

export const NOMBRE_TIPO_BIEN: Record<TipoBien, string> = {
  inmueble: 'Inmueble',
  inversion: 'Inversión',
  pension: 'Plan de pensiones',
  vehiculo: 'Vehículo',
  otro: 'Otro',
}

// ---------------------------------------------------------------------------
// Préstamo a tipo fijo (sistema francés)
// ---------------------------------------------------------------------------

/** Meses completos entre dos fechas AAAA-MM-DD (negativo si «hasta» es anterior) */
export function mesesEntre(desde: string, hasta: string): number {
  let n = (Number(hasta.slice(0, 4)) - Number(desde.slice(0, 4))) * 12 + Number(hasta.slice(5, 7)) - Number(desde.slice(5, 7))
  if (n > 0 && hasta.slice(8, 10) < desde.slice(8, 10)) n--
  if (n < 0 && hasta.slice(8, 10) > desde.slice(8, 10)) n++
  return n
}

/** Cuota mensual constante de un préstamo de «capital» a «meses» con un tipo anual fijo */
export function cuotaDe(capital: number, interes: number, meses: number): number {
  if (!(capital > 0) || !(meses > 0)) return 0
  const r = interes / 1200
  return r2(r === 0 ? capital / meses : (capital * r) / (1 - (1 + r) ** -meses))
}

export const cuotaPrestamo = (p: Prestamo) => cuotaDe(p.capital, p.interes, p.plazo_meses)

/** Capital pendiente tras «k» cuotas pagadas desde la fecha del préstamo */
function pendienteTras(p: Prestamo, k: number): number {
  if (k >= p.plazo_meses) return 0
  const r = p.interes / 1200
  const cuota = cuotaPrestamo(p)
  const pendiente = r === 0 ? p.capital - cuota * k : p.capital * (1 + r) ** k - (cuota * ((1 + r) ** k - 1)) / r
  return r2(Math.max(0, pendiente))
}

/** Capital pendiente en una fecha AAAA-MM-DD (antes de la fecha del préstamo, el que había entonces) */
export const pendientePrestamo = (p: Prestamo, fecha: string) => pendienteTras(p, mesesEntre(p.fecha, fecha))

/** Mes (AAAA-MM) de la última cuota */
export function finPrestamo(p: Prestamo): string {
  const total = Number(p.fecha.slice(0, 4)) * 12 + Number(p.fecha.slice(5, 7)) - 1 + p.plazo_meses
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`
}

/** Intereses que quedan por pagar desde una fecha */
export function interesesRestantes(p: Prestamo, fecha: string): number {
  const pagadas = Math.max(0, mesesEntre(p.fecha, fecha))
  const quedan = Math.max(0, p.plazo_meses - pagadas)
  return r2(Math.max(0, cuotaPrestamo(p) * quedan - pendienteTras(p, pagadas)))
}

// ---------------------------------------------------------------------------
// Bienes y deuda familiar en una fecha
// ---------------------------------------------------------------------------

/** Valor de un bien en una fecha: su última valoración hasta entonces; antes de la primera, la primera */
export function valorBien(b: Bien, fecha: string): number {
  let valor = b.valoraciones[0]?.valor ?? 0
  for (const v of b.valoraciones) if (v.fecha <= fecha) valor = v.valor
  return valor
}

export const valorActual = (b: Bien) => b.valoraciones[b.valoraciones.length - 1]?.valor ?? 0
export const fechaValoracion = (b: Bien) => b.valoraciones[b.valoraciones.length - 1]?.fecha ?? ''

/** Deuda familiar pendiente en una fecha: la inicial menos los pagos de deuda hasta entonces */
export function deudaEn(db: BaseDatos, c: Compromiso, fecha: string): number {
  let pagado = 0
  for (const m of db.movimientos)
    if (m.tipo === 'pago_deuda' && m.importe < 0 && m.fecha_operacion >= c.fecha_referencia && m.fecha_operacion <= fecha) pagado -= m.importe
  return r2(Math.max(0, c.deuda_inicial - pagado))
}

// ---------------------------------------------------------------------------
// Patrimonio
// ---------------------------------------------------------------------------

export interface LineaBien {
  bien: Bien
  valor: number
  fecha: string
  /** La valoración tiene más de un año */
  antigua: boolean
}

export interface LineaHipoteca {
  cuenta: Cuenta
  prestamo: Prestamo
  pendiente: number
  cuota: number
  /** Mes de la última cuota (AAAA-MM) */
  fin: string
}

export interface PuntoPatrimonio {
  mes: string
  liquidez: number
  bienes: number
  deudas: number
  neto: number
}

export interface Patrimonio {
  /** Cuentas según el banco menos lo pendiente de la tarjeta; null sin datos importados */
  liquidez: number | null
  inmuebles: LineaBien[]
  otros: LineaBien[]
  hipotecas: LineaHipoteca[]
  /** Hipotecas sin capital pendiente: la app no sabe lo que queda */
  hipotecasSinDatos: Cuenta[]
  deudaFamiliar: number
  activos: number
  deudas: number
  neto: number
  /** A final de cada mes con datos de las cuentas, y hoy al final */
  evolucion: PuntoPatrimonio[]
}

function calcular(db: BaseDatos, hoy: string): Patrimonio {
  const posicion = calcularPosicion(db)
  const bienes = db.ajustes.bienes ?? []
  const haceUnAno = `${Number(hoy.slice(0, 4)) - 1}${hoy.slice(4, 10)}`
  const linea = (b: Bien): LineaBien => ({ bien: b, valor: valorActual(b), fecha: fechaValoracion(b), antigua: fechaValoracion(b) < haceUnAno })
  const hipotecasActivas = db.cuentas.filter((c) => c.tipo === 'hipoteca' && c.activa)
  const hipotecas = hipotecasActivas
    .filter((c) => c.prestamo)
    .map((c) => ({ cuenta: c, prestamo: c.prestamo!, pendiente: pendientePrestamo(c.prestamo!, hoy), cuota: cuotaPrestamo(c.prestamo!), fin: finPrestamo(c.prestamo!) }))
  const compromiso = db.compromisos.find((c) => c.activo && c.deuda_inicial > 0)

  // En una fecha: lo que valen los bienes y lo que se debe (hipotecas y deuda familiar)
  const enFecha = (fecha: string) => {
    const valorBienes = bienes.reduce((s, b) => s + valorBien(b, fecha), 0)
    const hipoteca = hipotecas.reduce((s, h) => s + pendientePrestamo(h.prestamo, fecha), 0)
    return { bienes: r2(valorBienes), deudas: r2(hipoteca + (compromiso ? deudaEn(db, compromiso, fecha) : 0)) }
  }
  const actual = enFecha(hoy)
  const liquidez = posicion?.capital ?? null
  const activos = r2((liquidez ?? 0) + actual.bienes)
  const evolucion: PuntoPatrimonio[] = (posicion?.evolucion ?? []).map((e, i, lista) => {
    const fecha = i === lista.length - 1 ? hoy : ultimoDeMes(`${e.mes}-01`)
    const x = enFecha(fecha)
    return { mes: e.mes, liquidez: e.capital, bienes: x.bienes, deudas: x.deudas, neto: r2(e.capital + x.bienes - x.deudas) }
  })
  return {
    liquidez,
    inmuebles: bienes.filter((b) => b.tipo === 'inmueble').map(linea),
    otros: bienes.filter((b) => b.tipo !== 'inmueble').map(linea),
    hipotecas,
    hipotecasSinDatos: hipotecasActivas.filter((c) => !c.prestamo),
    deudaFamiliar: compromiso ? deudaEn(db, compromiso, hoy) : 0,
    activos,
    deudas: actual.deudas,
    neto: r2(activos - actual.deudas),
    evolucion,
  }
}

// Una vez por versión de los datos y día: el Extracto, la pantalla y Claude lo comparten
const guardado = porVersionYClave(calcular)
export const calcularPatrimonio = (db: BaseDatos, hoy: string) => guardado(db, hoy)

/** Hay algo más que las cuentas: bienes o una hipoteca con su capital pendiente */
export const hayPatrimonio = (db: BaseDatos) => (db.ajustes.bienes ?? []).length > 0 || db.cuentas.some((c) => c.tipo === 'hipoteca' && c.activa && c.prestamo)

/** Cuotas de las hipotecas que se siguen pagando en un mes (AAAA-MM) */
export function cuotasHipotecaEn(db: BaseDatos, mes: string): number {
  let total = 0
  for (const c of db.cuentas) if (c.tipo === 'hipoteca' && c.activa && c.prestamo && mes <= finPrestamo(c.prestamo)) total += cuotaPrestamo(c.prestamo)
  return r2(total)
}
