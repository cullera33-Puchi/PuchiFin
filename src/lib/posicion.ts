/**
 * Posición global: lo que tienes hoy. Saldo de las cuentas bancarias según el banco (columna
 * Disponible del último movimiento importado) menos lo gastado con la tarjeta que aún no se ha
 * cargado en la cuenta. Con la evolución del saldo bancario a final de cada mes.
 */
import { sumarDias, sumarMeses } from './fechas'
import { cuadrarCuenta } from './saldos'
import { cuadrarLiquidaciones, pendienteTarjeta, type PendienteTarjeta } from './tarjeta'
import type { BaseDatos, Cuenta } from './tipos'

const redondear = (n: number) => Math.round(n * 100) / 100

export interface SaldoCuenta {
  cuenta: Cuenta
  saldo: number
  /** Fecha del último movimiento con saldo */
  fecha: string
}

export interface Posicion {
  cuentas: SaldoCuenta[]
  tarjetas: { cuenta: Cuenta; pendiente: PendienteTarjeta }[]
  /** Suma de los saldos de las cuentas */
  bancos: number
  /** Bancos menos lo pendiente de las tarjetas */
  capital: number
  /** Fecha más reciente de los saldos */
  fecha: string
  /** A final de cada mes (los últimos 12 con datos) y hoy al final: saldo de las cuentas y capital */
  evolucion: { mes: string; saldo: number; capital: number }[]
  /** Diferencia del saldo de las cuentas frente al cierre del mes anterior */
  variacionMes: number | null
}

/** Saldo de una cuenta al final de un día (null si aún no hay datos) */
function saldoA(db: BaseDatos, cuentaId: string, dia: string): number | null {
  return cuadrarCuenta(db.movimientos.filter((m) => m.cuenta_id === cuentaId && m.fecha_operacion <= dia)).saldoBanco
}

const finDeMes = (mes: string) => sumarDias(sumarMeses(`${mes}-01`, 1), -1)
const mesAnterior = (mes: string) => sumarMeses(`${mes}-01`, -1).slice(0, 7)

export function calcularPosicion(db: BaseDatos, meses = 12): Posicion | null {
  const bancarias = db.cuentas.filter((c) => c.activa && c.tipo === 'cuenta')
  const cuentas: SaldoCuenta[] = []
  for (const c of bancarias) {
    const r = cuadrarCuenta(db.movimientos.filter((m) => m.cuenta_id === c.id))
    if (r.saldoBanco !== null && r.fecha) cuentas.push({ cuenta: c, saldo: r.saldoBanco, fecha: r.fecha })
  }
  if (!cuentas.length) return null
  const tarjetas = db.cuentas
    .filter((c) => c.activa && c.tipo === 'tarjeta_credito')
    .map((cuenta) => ({ cuenta, pendiente: pendienteTarjeta(db, cuenta.id) }))
    .filter((t) => t.pendiente.desde !== null)
  const bancos = redondear(cuentas.reduce((s, c) => s + c.saldo, 0))
  const capital = redondear(bancos + tarjetas.reduce((s, t) => s + t.pendiente.importe, 0))
  const fecha = cuentas.reduce((max, c) => (c.fecha > max ? c.fecha : max), '')

  // Cierre de cada mes: suma de las cuentas que ya tenían datos ese mes
  const actual = fecha.slice(0, 7)
  const lista: string[] = []
  for (let m = mesAnterior(actual), i = 0; i < meses - 1; i++, m = mesAnterior(m)) lista.unshift(m)
  const liquidaciones = cuadrarLiquidaciones(db)
  const cierres = lista
    .map((mes) => {
      const dia = finDeMes(mes)
      const saldos = cuentas.map((c) => saldoA(db, c.cuenta.id, dia)).filter((x): x is number => x !== null)
      if (!saldos.length) return null
      const saldo = redondear(saldos.reduce((s, x) => s + x, 0))
      const pendiente = tarjetas.reduce((s, t) => s + pendienteTarjeta(db, t.cuenta.id, dia, liquidaciones).importe, 0)
      return { mes, saldo, capital: redondear(saldo + pendiente) }
    })
    .filter((x): x is { mes: string; saldo: number; capital: number } => !!x)
  const anterior = cierres.find((c) => c.mes === mesAnterior(actual))
  return {
    cuentas,
    tarjetas,
    bancos,
    capital,
    fecha,
    evolucion: [...cierres, { mes: actual, saldo: bancos, capital }],
    variacionMes: anterior ? redondear(bancos - anterior.saldo) : null,
  }
}
