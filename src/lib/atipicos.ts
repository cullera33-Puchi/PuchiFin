/**
 * Gastos fuera de lo normal (R2, v0.34.0). Dos casos, sobre los gastos de tipo Normal del mes:
 * - En un comercio con historia (al menos tres cargos en los doce meses anteriores), un cargo que pasa de
 *   1,6 veces la mediana de esos cargos y la supera en 30 € o más.
 * - Un gasto de 300 € o más en un comercio sin cargos en los doce meses anteriores.
 * PayPal no dice el comercio: solo cuenta el segundo caso. Se calcula una vez por versión de los datos y mes.
 */
import { porVersionYClave } from './cache'
import { claveComercio, esPasarela } from './conceptos'
import { sumarMeses } from './fechas'
import { mesEfectivo } from './imputacion'
import type { BaseDatos, Movimiento } from './tipos'

export const UMBRAL_GRANDE = 300

export interface GastoAtipico {
  movimiento: Movimiento
  motivo: 'comercio' | 'nuevo'
  /** Mediana de los cargos anteriores del comercio (solo en «comercio») */
  habitual: number | null
  /** Cargos anteriores del comercio en los doce meses previos */
  veces: number
}

const mediana = (xs: number[]) => {
  const o = [...xs].sort((a, b) => a - b)
  const m = Math.floor(o.length / 2)
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2
}

function calcular(db: BaseDatos, mes: string): GastoAtipico[] {
  const gastoNatural = new Set(db.categorias.filter((c) => c.naturaleza === 'gasto').map((c) => c.id))
  const esGasto = (m: Movimiento) => m.tipo === 'normal' && m.importe < 0 && (!m.categoria_id || gastoNatural.has(m.categoria_id))
  const clave = (m: Movimiento) => claveComercio(m.concepto_limpio) || m.concepto_normalizado
  const desde = sumarMeses(`${mes}-01`, -12).slice(0, 7)
  // Cargos de los doce meses anteriores por comercio
  const previos = new Map<string, number[]>()
  for (const m of db.movimientos) {
    if (!esGasto(m)) continue
    const me = mesEfectivo(m)
    if (me < desde || me >= mes) continue
    const k = clave(m)
    const l = previos.get(k)
    if (l) l.push(-m.importe)
    else previos.set(k, [-m.importe])
  }
  const res: GastoAtipico[] = []
  for (const m of db.movimientos) {
    if (!esGasto(m) || mesEfectivo(m) !== mes) continue
    const k = clave(m)
    const importe = -m.importe
    const antes = previos.get(k) ?? []
    if (!esPasarela(k) && antes.length >= 3) {
      const habitual = mediana(antes)
      if (importe > habitual * 1.6 && importe - habitual >= 30) res.push({ movimiento: m, motivo: 'comercio', habitual: Math.round(habitual * 100) / 100, veces: antes.length })
    } else if (!antes.length && importe >= UMBRAL_GRANDE) {
      res.push({ movimiento: m, motivo: 'nuevo', habitual: null, veces: 0 })
    }
  }
  return res.sort((a, b) => a.movimiento.importe - b.movimiento.importe)
}

export const gastosAtipicos = porVersionYClave(calcular)
