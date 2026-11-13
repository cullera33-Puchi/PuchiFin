/**
 * Reporting por comercio: dónde se gasta más (por importe o por número de compras) y los gastos
 * hormiga, compras pequeñas y frecuentes que sumadas pesan (cafés, snacks, apps).
 */
import { claveComercio, esPasarela, nombrePasarela } from './conceptos'
import type { Movimiento } from './tipos'

const redondear = (n: number) => Math.round(n * 100) / 100

export interface LineaComercio {
  /** Clave del comercio (sirve para buscarlo en Movimientos) */
  clave: string
  nombre: string
  /** Importe del periodo, en positivo para la vista (gasto o ingreso) */
  importe: number
  veces: number
}

const claveDe = (m: Movimiento) => claveComercio(m.concepto_limpio) || m.concepto_normalizado

/** Agrupa por comercio (PayPal, todo junto) con el nombre del movimiento más reciente */
export function porComercio(movs: Movimiento[], signo: 1 | -1): LineaComercio[] {
  const grupos = new Map<string, { nombre: string; fecha: string; importe: number; veces: number }>()
  for (const m of movs) {
    const clave = claveDe(m)
    const g = grupos.get(clave) ?? { nombre: m.concepto_limpio, fecha: m.fecha_operacion, importe: 0, veces: 0 }
    if (m.fecha_operacion >= g.fecha) {
      g.nombre = esPasarela(clave) ? nombrePasarela(clave) : m.concepto_limpio
      g.fecha = m.fecha_operacion
    }
    g.importe += signo * m.importe
    g.veces++
    grupos.set(clave, g)
  }
  return [...grupos].map(([clave, g]) => ({ clave, nombre: g.nombre, importe: redondear(g.importe), veces: g.veces }))
}

/** Los comercios con más importe o con más compras en el periodo */
export function rankingComercios(movs: Movimiento[], signo: 1 | -1, orden: 'importe' | 'veces', max = 8): LineaComercio[] {
  return porComercio(movs, signo)
    .filter((l) => l.importe > 0)
    .sort((a, b) => (orden === 'importe' ? b.importe - a.importe || b.veces - a.veces : b.veces - a.veces || b.importe - a.importe))
    .slice(0, max)
}

/** Una compra hormiga cuesta como mucho esto */
export const IMPORTE_HORMIGA = 10
/** Y el comercio se repite al menos estas veces al mes */
export const VECES_HORMIGA = 3

export interface GastosHormiga {
  total: number
  compras: number
  /** Lo que sumarían en un año a este ritmo */
  alAno: number
  comercios: LineaComercio[]
}

/**
 * Gastos hormiga de un periodo: compras de hasta 10 € en comercios que se repiten al menos 3 veces al
 * mes. «meses» es lo que dura el periodo en meses (fraccionario si está en curso), para el ritmo anual.
 * movs: los gastos de tipo Normal del periodo.
 */
export function gastosHormiga(movs: Movimiento[], meses: number): GastosHormiga | null {
  const pequenas = movs.filter((m) => m.tipo === 'normal' && m.importe < 0 && -m.importe <= IMPORTE_HORMIGA)
  const minimo = Math.max(VECES_HORMIGA, Math.ceil(VECES_HORMIGA * Math.floor(Math.max(meses, 1))))
  const comercios = porComercio(pequenas, -1)
    .filter((l) => l.veces >= minimo)
    .sort((a, b) => b.importe - a.importe)
  if (!comercios.length) return null
  const total = redondear(comercios.reduce((s, c) => s + c.importe, 0))
  return { total, compras: comercios.reduce((s, c) => s + c.veces, 0), alAno: Math.round((total / Math.max(meses, 0.25)) * 12), comercios }
}
