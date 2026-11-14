/**
 * Comparar dos periodos cualesquiera (R4, v0.34.0): meses, trimestres o años. Totales y gasto por
 * categoría principal de cada uno, con la diferencia. Solo cuentan los movimientos de tipo Normal.
 */
import { gastoPorCategoria } from './extracto'
import { MESES, sumarMeses } from './fechas'
import { mesEfectivo } from './imputacion'
import { calcularTotales, type Totales } from './resumen'
import type { BaseDatos } from './tipos'

export type TipoComparacion = 'mes' | 'trimestre' | 'anio'

export interface PeriodoComparable {
  clave: string
  nombre: string
  /** Meses que abarca, AAAA-MM */
  desde: string
  hasta: string
  enCurso: boolean
}

const conMayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

function periodoDe(tipo: TipoComparacion, mes: string, actual: string): PeriodoComparable {
  const anio = mes.slice(0, 4)
  if (tipo === 'mes') return { clave: mes, nombre: `${conMayuscula(MESES[Number(mes.slice(5, 7)) - 1])} ${anio}`, desde: mes, hasta: mes, enCurso: mes === actual }
  if (tipo === 'anio') return { clave: anio, nombre: `Año ${anio}`, desde: `${anio}-01`, hasta: `${anio}-12`, enCurso: actual.startsWith(anio) }
  const t = Math.floor((Number(mes.slice(5, 7)) - 1) / 3)
  const desde = `${anio}-${String(t * 3 + 1).padStart(2, '0')}`
  const hasta = `${anio}-${String(t * 3 + 3).padStart(2, '0')}`
  return { clave: `${anio}-T${t + 1}`, nombre: `${t + 1}.º trimestre ${anio}`, desde, hasta, enCurso: actual >= desde && actual <= hasta }
}

/** Periodos con datos, del más reciente al más antiguo */
export function periodosDisponibles(db: BaseDatos, tipo: TipoComparacion, hoy: string): PeriodoComparable[] {
  const meses = [...new Set(db.movimientos.map(mesEfectivo))].sort()
  if (!meses.length) return []
  const actual = hoy.slice(0, 7)
  const ultimo = meses[meses.length - 1] > actual ? meses[meses.length - 1] : actual
  const vistos = new Map<string, PeriodoComparable>()
  for (let m = meses[0]; m <= ultimo; m = sumarMeses(`${m}-01`, 1).slice(0, 7)) {
    const p = periodoDe(tipo, m, actual)
    if (!vistos.has(p.clave)) vistos.set(p.clave, p)
  }
  return [...vistos.values()].reverse()
}

export interface LineaComparada {
  id: string | null
  nombre: string
  color: string
  icono: string | null
  a: number
  b: number
  diferencia: number
}

export interface Comparacion {
  a: Totales
  b: Totales
  categorias: LineaComparada[]
}

const redondear = (n: number) => Math.round(n * 100) / 100

export function compararPeriodos(db: BaseDatos, a: PeriodoComparable, b: PeriodoComparable): Comparacion {
  const de = (p: PeriodoComparable) => db.movimientos.filter((m) => {
    const me = mesEfectivo(m)
    return me >= p.desde && me <= p.hasta
  })
  const ma = de(a)
  const mb = de(b)
  const ga = gastoPorCategoria(ma, db.categorias)
  const gb = gastoPorCategoria(mb, db.categorias)
  const ids = new Set([...ga.keys(), ...gb.keys()])
  const porId = new Map(db.categorias.map((c) => [c.id, c]))
  const categorias = [...ids]
    .map((id) => {
      const c = id ? porId.get(id) : undefined
      const va = ga.get(id) ?? 0
      const vb = gb.get(id) ?? 0
      return { id, nombre: c?.nombre ?? 'Sin categoría', color: c?.color ?? '#8E8E93', icono: c?.icono ?? null, a: va, b: vb, diferencia: redondear(vb - va) }
    })
    .filter((l) => l.a || l.b)
    .sort((x, y) => Math.abs(y.diferencia) - Math.abs(x.diferencia) || y.b - x.b)
  return { a: calcularTotales(ma, db.categorias), b: calcularTotales(mb, db.categorias), categorias }
}
