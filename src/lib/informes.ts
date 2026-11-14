/**
 * Informes: gastos o ingresos de un mes o de un año, por categoría y subcategoría, con la comparativa
 * con el periodo anterior. Mismas reglas que el Extracto: solo computan los movimientos de tipo Normal,
 * cada uno en su mes efectivo (fin de mes), y una devolución en una categoría de gasto resta gasto.
 */
import { fechaDeLosDatos } from './extracto'
import { sumarMeses } from './fechas'
import { fechaEfectiva } from './imputacion'
import { calcularTotales, type Totales } from './resumen'
import type { BaseDatos, Categoria, Movimiento } from './tipos'

export type Vista = 'gasto' | 'ingreso'
export type Escala = 'mes' | 'anio'
/** Mes («2026-11») o año («2026») */
export interface PeriodoInforme {
  escala: Escala
  clave: string
}

const redondear = (n: number) => Math.round(n * 100) / 100

export const periodoDeFecha = (escala: Escala, fecha: string): PeriodoInforme => ({ escala, clave: escala === 'mes' ? fecha.slice(0, 7) : fecha.slice(0, 4) })

export function moverPeriodo(p: PeriodoInforme, pasos: number): PeriodoInforme {
  if (p.escala === 'anio') return { escala: 'anio', clave: String(Number(p.clave) + pasos) }
  return { escala: 'mes', clave: sumarMeses(`${p.clave}-01`, pasos).slice(0, 7) }
}

export interface Porcion {
  /** Categoría (raíz o subcategoría); null para «Sin categoría» */
  id: string | null
  nombre: string
  icono: string | null
  color: string
  importe: number
  /** Peso sobre el total de la vista (0 a 1) */
  peso: number
  /** Importe del periodo anterior (con los mismos días si el periodo está en curso) */
  anterior: number
  movimientos: number
}

export interface Informe {
  periodo: PeriodoInforme
  anterior: PeriodoInforme
  /** Periodo en curso: la comparativa usa los mismos días del anterior */
  enCurso: boolean
  totales: Totales
  totalesAnteriores: Totales
  vista: Vista
  total: number
  totalAnterior: number
  porciones: Porcion[]
  /** Movimientos de la vista (de la categoría pedida si la hay), del más reciente al más antiguo */
  movimientos: Movimiento[]
  /** Vista mensual: el mismo mes del año anterior (mismos días si está en curso), si hay datos */
  haceUnAno: { totales: Totales; total: number } | null
}

/** Recorte del periodo anterior cuando el actual está en curso: mismos días (mes) o misma fecha (año) */
function corteAnterior(p: PeriodoInforme, hoy: string | undefined, referencia: string | undefined): { enCurso: boolean; corte: (fecha: string) => boolean } {
  const enCurso = !!hoy && hoy.startsWith(p.clave)
  if (!enCurso || !referencia) return { enCurso, corte: () => true }
  if (p.escala === 'mes') {
    const dia = referencia.slice(8, 10)
    return { enCurso, corte: (f) => f.slice(8, 10) <= dia }
  }
  const mesDia = referencia.slice(5, 10)
  return { enCurso, corte: (f) => f.slice(5, 10) <= mesDia }
}

const NOMBRE_SIN = 'Sin categoría'

/**
 * @param categoria undefined: por categoría raíz; id de una raíz: por sus subcategorías;
 *                  null: los movimientos sin categoría (sin desglose)
 */
export function calcularInforme(db: BaseDatos, periodo: PeriodoInforme, vista: Vista, categoria?: string | null, hoy?: string): Informe {
  const porId = new Map(db.categorias.map((c) => [c.id, c]))
  const raiz = (id: string | null): Categoria | undefined => {
    const c = id ? porId.get(id) : undefined
    return c?.padre_id ? porId.get(c.padre_id) ?? c : c
  }
  const naturaleza = (m: Movimiento): Vista => {
    const c = m.categoria_id ? porId.get(m.categoria_id) : undefined
    return c ? c.naturaleza : m.importe >= 0 ? 'ingreso' : 'gasto'
  }
  const signo = vista === 'gasto' ? -1 : 1
  const anterior = moverPeriodo(periodo, -1)
  // «A estas alturas»: hasta el último dato importado si cae dentro del periodo, como el Extracto (v0.34.0)
  const datos = hoy ? fechaDeLosDatos(db, hoy) : undefined
  const { enCurso, corte } = corteAnterior(periodo, hoy, datos && datos.startsWith(periodo.clave) ? datos : hoy)

  const delPeriodo = (p: PeriodoInforme, recorte: (f: string) => boolean) =>
    db.movimientos.filter((m) => {
      const f = fechaEfectiva(m)
      return f.startsWith(p.clave) && recorte(f)
    })
  const actuales = delPeriodo(periodo, () => true)
  const previos = delPeriodo(anterior, corte)

  // Movimientos de la vista y, si se pide, de una categoría
  const deLaVista = (movs: Movimiento[]) =>
    movs.filter((m) => {
      if (m.tipo !== 'normal' || naturaleza(m) !== vista) return false
      if (categoria === undefined) return true
      if (categoria === null) return !m.categoria_id
      return raiz(m.categoria_id)?.id === categoria
    })

  // Clave de agrupación: la raíz, o la subcategoría dentro de una raíz (lo cargado en la raíz va aparte)
  const clave = (m: Movimiento): string | null => {
    if (categoria === undefined) return raiz(m.categoria_id)?.id ?? null
    if (categoria === null) return null
    return m.categoria_id
  }
  const sumar = (movs: Movimiento[]) => {
    const r = new Map<string | null, { importe: number; n: number }>()
    for (const m of deLaVista(movs)) {
      const k = clave(m)
      const v = r.get(k) ?? { importe: 0, n: 0 }
      r.set(k, { importe: v.importe + signo * m.importe, n: v.n + 1 })
    }
    return r
  }
  const ahora = sumar(actuales)
  const antes = sumar(previos)

  const total = redondear([...ahora.values()].reduce((s, v) => s + v.importe, 0))
  const totalAnterior = redondear([...antes.values()].reduce((s, v) => s + v.importe, 0))
  const porciones: Porcion[] = [...ahora.entries()]
    .map(([id, v]) => {
      const c = id ? porId.get(id) : undefined
      const nombre = !id ? NOMBRE_SIN : c && categoria && c.id === categoria ? `${c.nombre}, general` : (c?.nombre ?? NOMBRE_SIN)
      return {
        id,
        nombre,
        icono: c?.icono ?? raiz(id)?.icono ?? null,
        color: c?.color ?? '#8E8E93',
        importe: redondear(v.importe),
        peso: total > 0 ? v.importe / total : 0,
        anterior: redondear(antes.get(id)?.importe ?? 0),
        movimientos: v.n,
      }
    })
    .filter((p) => Math.abs(p.importe) >= 0.005)
    .sort((a, b) => b.importe - a.importe)

  // El mismo mes del año anterior (en la vista anual, el periodo anterior ya es el año pasado)
  let haceUnAno: Informe['haceUnAno'] = null
  if (periodo.escala === 'mes') {
    const movs = delPeriodo({ escala: 'mes', clave: sumarMeses(`${periodo.clave}-01`, -12).slice(0, 7) }, corte)
    if (movs.length)
      haceUnAno = { totales: calcularTotales(movs, db.categorias), total: redondear(deLaVista(movs).reduce((s, m) => s + signo * m.importe, 0)) }
  }

  return {
    haceUnAno,
    periodo,
    anterior,
    enCurso,
    totales: calcularTotales(actuales, db.categorias),
    totalesAnteriores: calcularTotales(previos, db.categorias),
    vista,
    total,
    totalAnterior,
    porciones,
    movimientos: deLaVista(actuales).sort((a, b) => fechaEfectiva(b).localeCompare(fechaEfectiva(a)) || b.fecha_operacion.localeCompare(a.fecha_operacion)),
  }
}

/** Para el gráfico: las 7 mayores y el resto agrupado en «Otras» (solo importes positivos) */
export function porcionesGrafico(porciones: Porcion[], max = 7): (Porcion & { otras?: true })[] {
  const positivas = porciones.filter((p) => p.importe > 0)
  if (positivas.length <= max + 1) return positivas
  const resto = positivas.slice(max)
  const importe = redondear(resto.reduce((s, p) => s + p.importe, 0))
  return [
    ...positivas.slice(0, max),
    {
      id: '__otras',
      nombre: `Otras (${resto.length})`,
      icono: null,
      color: '#8E8E93',
      importe,
      peso: resto.reduce((s, p) => s + p.peso, 0),
      anterior: redondear(resto.reduce((s, p) => s + p.anterior, 0)),
      movimientos: resto.reduce((s, p) => s + p.movimientos, 0),
      otras: true,
    },
  ]
}
