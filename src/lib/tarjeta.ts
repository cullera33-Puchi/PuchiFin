/**
 * Liquidación de la tarjeta de crédito. BBVA carga en la cuenta, una vez al mes, lo gastado con la
 * tarjeta en su periodo de liquidación, que no tiene por qué coincidir con el mes natural (por ejemplo,
 * del 4 de un mes al 3 del siguiente). En la app el gasto cuenta en cada compra de la tarjeta y el
 * cargo en la cuenta es un traspaso interno: se netea.
 *
 * Para comprobarlo sin conocer el día de corte, se busca el tramo de días seguidos de compras de la
 * tarjeta (devoluciones incluidas) que suma exactamente el cargo, en los 45 días anteriores, y que
 * empieza justo después del tramo de la liquidación anterior si la hay. Si ninguno cuadra, se compara
 * con el mes natural anterior y se da la diferencia.
 *
 * Cuenta todo lo que pasa por la tarjeta: compras, devoluciones y también los abonos de compras que se
 * fraccionan o financian (BBVA los devuelve en la tarjeta y cobra menos ese mes). Solo se excluye el
 * pago de la propia liquidación, si el Excel de la tarjeta lo trae («Rebut mes anterior»).
 * El usuario puede dar por buena una liquidación que no cuadra (cuadre_confirmado).
 */
import { sumarDias } from './fechas'
import type { BaseDatos, Movimiento } from './tipos'

const cent = (n: number) => Math.round(n * 100)
const PATRON = /\b(liquidacion|liq)\b.*\btarj|\bpago\b.*\btarjeta (de )?credito\b|\bcargo\b.*\btarjeta\b|\badeudo mensual de tarjeta\b/
/** Pago de la liquidación visto desde la tarjeta: no es una compra */
const PAGO_EN_TARJETA = /\b(rebut|recibo) (del )?mes anterior\b|\babono\b.*\bliquidacion\b|\b(liquidacion|liq)\b.*\btarj/

export type EstadoLiquidacion = 'cuadra' | 'no_cuadra' | 'sin_tarjeta' | 'anterior_al_inicio' | 'confirmada'

export interface CuadreLiquidacion {
  movimiento: Movimiento
  estado: EstadoLiquidacion
  /** Periodo de compras de la tarjeta que cubre (el que cuadra o, si no, el mes natural anterior) */
  desde: string | null
  hasta: string | null
  /** Suma de las compras del periodo (en negativo, como el cargo) */
  compras: number
  /** Cargo menos compras */
  diferencia: number
}

/** Cargos de la liquidación de la tarjeta en las cuentas bancarias */
export function esLiquidacion(m: Movimiento, idRegla: string | undefined, bancarias: Set<string>): boolean {
  if (!bancarias.has(m.cuenta_id) || m.importe >= 0) return false
  return (!!idRegla && m.regla_id === idRegla) || (m.tipo === 'traspaso_interno' && PATRON.test(m.concepto_normalizado))
}

export function cuadrarLiquidaciones(db: BaseDatos, extra: Movimiento[] = []): CuadreLiquidacion[] {
  const movs = [...db.movimientos, ...extra]
  const tarjetas = new Set(db.cuentas.filter((c) => c.tipo === 'tarjeta_credito').map((c) => c.id))
  const bancarias = new Set(db.cuentas.filter((c) => c.tipo === 'cuenta').map((c) => c.id))
  const idRegla = db.reglas.find((r) => r.origen === 'sistema' && r.nombre === 'Liquidación de tarjeta')?.id
  const liquidaciones = movs.filter((m) => esLiquidacion(m, idRegla, bancarias)).sort((a, b) => a.fecha_operacion.localeCompare(b.fecha_operacion))

  // Todo lo de la tarjeta por día, menos el pago de la propia liquidación
  const idAbono = db.reglas.find((r) => r.origen === 'sistema' && r.nombre === 'Abono de la liquidación en la tarjeta')?.id
  const esPago = (m: Movimiento) => m.importe > 0 && ((!!idAbono && m.regla_id === idAbono) || PAGO_EN_TARJETA.test(m.concepto_normalizado))
  const porDia = new Map<string, number>()
  for (const m of movs) {
    if (!tarjetas.has(m.cuenta_id) || esPago(m)) continue
    porDia.set(m.fecha_operacion, (porDia.get(m.fecha_operacion) ?? 0) + cent(m.importe))
  }
  const dias = [...porDia.keys()].sort()
  const acumulado = [0]
  for (const d of dias) acumulado.push(acumulado[acumulado.length - 1] + porDia.get(d)!)
  const suma = (i: number, j: number) => acumulado[j + 1] - acumulado[i]

  let finAnterior: string | null = null
  return liquidaciones.map((l) => {
    const objetivo = cent(l.importe)
    const limite = sumarDias(l.fecha_operacion, -45)
    let mejor: { i: number; j: number; seguido: boolean } | null = null
    for (let j = dias.length - 1; j >= 0; j--) {
      if (dias[j] >= l.fecha_operacion) continue
      if (dias[j] < limite) break
      for (let i = j; i >= 0 && dias[i] >= sumarDias(dias[j], -40); i--) {
        if (finAnterior && dias[i] <= finAnterior) break
        if (suma(i, j) !== objetivo) continue
        // Mejor el tramo que sigue al de la liquidación anterior; si no, el que acaba más tarde
        const seguido = !!finAnterior && (i === 0 || dias[i - 1] <= finAnterior)
        if (!mejor || (seguido && !mejor.seguido)) mejor = { i, j, seguido }
      }
      if (mejor?.seguido) break
    }
    if (mejor) {
      finAnterior = dias[mejor.j]
      return { movimiento: l, estado: 'cuadra' as const, desde: dias[mejor.i], hasta: dias[mejor.j], compras: suma(mejor.i, mejor.j) / 100, diferencia: 0 }
    }
    // Sin tramo exacto: mes natural anterior, para dar una diferencia orientativa
    const mes = sumarDias(`${l.fecha_operacion.slice(0, 7)}-01`, -1).slice(0, 7)
    const delMes = dias.filter((d) => d.startsWith(mes))
    const compras = delMes.reduce((s, d) => s + porDia.get(d)!, 0)
    const hayAntes = dias.some((d) => d < l.fecha_operacion && d >= limite)
    // Un cargo en las primeras semanas de lo importado de la tarjeta liquida compras anteriores, que no están
    const estado: EstadoLiquidacion = l.cuadre_confirmado
      ? 'confirmada'
      : dias.length && l.fecha_operacion < sumarDias(dias[0], 28)
        ? 'anterior_al_inicio'
        : hayAntes
          ? 'no_cuadra'
          : 'sin_tarjeta'
    return { movimiento: l, estado, desde: `${mes}-01`, hasta: sumarDias(`${l.fecha_operacion.slice(0, 7)}-01`, -1), compras: compras / 100, diferencia: (objetivo - compras) / 100 }
  })
}

export interface PendienteTarjeta {
  /** Compras y devoluciones de la tarjeta aún no cargadas en la cuenta (negativo: lo que se debe) */
  importe: number
  /** Desde qué día cuenta (el siguiente al último tramo liquidado) */
  desde: string | null
  /** Sin ninguna liquidación importada: solo el mes de la última compra, como aproximación */
  aproximado: boolean
}

/**
 * Lo pendiente de cargar de una tarjeta: lo que pasa por ella después del último tramo liquidado
 * (el que cuadró con su cargo en la cuenta o, si no cuadró, el mes natural anterior al cargo).
 */
export function pendienteTarjeta(db: BaseDatos, tarjetaId: string): PendienteTarjeta {
  const idAbono = db.reglas.find((r) => r.origen === 'sistema' && r.nombre === 'Abono de la liquidación en la tarjeta')?.id
  const esPago = (m: Movimiento) => m.importe > 0 && ((!!idAbono && m.regla_id === idAbono) || PAGO_EN_TARJETA.test(m.concepto_normalizado))
  const movs = db.movimientos.filter((m) => m.cuenta_id === tarjetaId && !esPago(m))
  if (!movs.length) return { importe: 0, desde: null, aproximado: false }
  const liquidaciones = cuadrarLiquidaciones(db).filter((l) => l.hasta)
  const ultima = liquidaciones[liquidaciones.length - 1]
  const ultimaCompra = movs.reduce((max, m) => (m.fecha_operacion > max ? m.fecha_operacion : max), '')
  const desde = ultima ? sumarDias(ultima.hasta!, 1) : `${ultimaCompra.slice(0, 7)}-01`
  const importe = movs.filter((m) => m.fecha_operacion >= desde).reduce((s, m) => s + cent(m.importe), 0) / 100
  return { importe, desde, aproximado: !ultima }
}
