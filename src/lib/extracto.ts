/**
 * Extracto mensual (apartado 8) y vistas de análisis. Solo computan los movimientos de tipo Normal.
 * La comparativa es con la media de los meses anteriores con datos, hasta un máximo de 12.
 */
import { calcularTotales, type Totales } from './resumen'
import { sumarMeses } from './fechas'
import { formatearRedondo } from './formato'
import { fechaEfectiva, mesEfectivo } from './imputacion'
import type { BaseDatos, Categoria, Movimiento } from './tipos'

const redondear = (n: number) => Math.round(n * 100) / 100
export const mesDe = (fecha: string) => fecha.slice(0, 7)

/** Meses (AAAA-MM) con movimientos, ordenados */
export function mesesConDatos(movs: Movimiento[]): string[] {
  return [...new Set(movs.map(mesEfectivo))].sort()
}

function raiz(categorias: Map<string, Categoria>, id: string | null): string | null {
  if (!id) return null
  const c = categorias.get(id)
  return c?.padre_id ?? c?.id ?? null
}

/** Gasto neto por categoría raíz (en positivo) de los movimientos Normal de gasto */
export function gastoPorCategoria(movs: Movimiento[], categorias: Categoria[]): Map<string | null, number> {
  const porId = new Map(categorias.map((c) => [c.id, c]))
  const res = new Map<string | null, number>()
  for (const m of movs) {
    if (m.tipo !== 'normal') continue
    const c = m.categoria_id ? porId.get(m.categoria_id) : undefined
    const natur = c?.naturaleza ?? (m.importe >= 0 ? 'ingreso' : 'gasto')
    if (natur !== 'gasto') continue
    const k = raiz(porId, m.categoria_id)
    res.set(k, redondear((res.get(k) ?? 0) - m.importe))
  }
  return res
}

export interface LineaExtracto {
  id: string | null
  nombre: string
  icono: string | null
  color: string
  importe: number
  peso: number
  media: number | null
  movimientos: number
}

export interface Extracto {
  mes: string
  totales: Totales
  media: Totales | null
  mesesMedia: number
  categorias: LineaExtracto[]
  sinCategoria: number
  hayAnterior: boolean
  haySiguiente: boolean
  /** Mes en curso: la media se calcula con los mismos días (del 1 a diaCorte) de los meses anteriores */
  enCurso: boolean
  diaCorte: number | null
  /** El mismo mes del año anterior (con los mismos días si el mes está en curso), si hay datos */
  haceUnAno: Totales | null
}

/**
 * Hasta dónde llegan los datos: la fecha del último movimiento importado, sin pasar de hoy. Las
 * comparaciones «a estas alturas del mes» se hacen hasta ahí: si el Excel es de hace unos días, los días
 * sin importar no cuentan como días sin gasto.
 */
export function fechaDeLosDatos(db: BaseDatos, hoy: string): string {
  let ultima = ''
  for (const m of db.movimientos) if (m.fecha_operacion <= hoy && m.fecha_operacion > ultima) ultima = m.fecha_operacion
  return ultima || hoy
}

export function calcularExtracto(db: BaseDatos, mes: string, hoy?: string): Extracto {
  const enCurso = !!hoy && mesDe(hoy) === mes
  const corte = hoy ? fechaDeLosDatos(db, hoy) : null
  const diaCorte = enCurso ? Number((corte!.startsWith(mes) ? corte! : hoy!).slice(8, 10)) : null
  const delPeriodo = (p: string) => db.movimientos.filter((m) => mesEfectivo(m) === p && (diaCorte === null || Number(fechaEfectiva(m).slice(8, 10)) <= diaCorte))
  const delMes = db.movimientos.filter((m) => mesEfectivo(m) === mes)
  const totales = calcularTotales(delMes, db.categorias)
  const meses = mesesConDatos(db.movimientos)
  const previos = meses.filter((m) => m < mes).slice(-12)

  let media: Totales | null = null
  const mediasCat = new Map<string | null, number>()
  if (previos.length) {
    const tot = previos.map((p) => calcularTotales(delPeriodo(p), db.categorias))
    const prom = (f: (t: Totales) => number) => redondear(tot.reduce((s, t) => s + f(t), 0) / tot.length)
    const ingresos = prom((t) => t.ingresos)
    const ahorro = prom((t) => t.ahorro)
    media = { ingresos, gastos: prom((t) => t.gastos), ahorro, tasaAhorro: ingresos > 0 ? ahorro / ingresos : null, movimientos: Math.round(prom((t) => t.movimientos)) }
    for (const p of previos) {
      for (const [k, v] of gastoPorCategoria(delPeriodo(p), db.categorias)) {
        mediasCat.set(k, (mediasCat.get(k) ?? 0) + v / previos.length)
      }
    }
  }

  const porId = new Map(db.categorias.map((c) => [c.id, c]))
  const gastos = gastoPorCategoria(delMes, db.categorias)
  const cuenta = new Map<string | null, number>()
  for (const m of delMes) if (m.tipo === 'normal') cuenta.set(raiz(porId, m.categoria_id), (cuenta.get(raiz(porId, m.categoria_id)) ?? 0) + 1)
  const categorias: LineaExtracto[] = [...gastos.entries()]
    .map(([id, importe]) => {
      const c = id ? porId.get(id) : undefined
      return {
        id,
        nombre: c?.nombre ?? 'Sin categoría',
        icono: c?.icono ?? null,
        color: c?.color ?? '#8E8E93',
        importe,
        peso: totales.gastos > 0 ? importe / totales.gastos : 0,
        media: previos.length ? redondear(mediasCat.get(id) ?? 0) : null,
        movimientos: cuenta.get(id) ?? 0,
      }
    })
    .sort((a, b) => b.importe - a.importe)

  const mesAnio = sumarMeses(`${mes}-01`, -12).slice(0, 7)
  const haceUnAno = meses.includes(mesAnio) ? calcularTotales(delPeriodo(mesAnio), db.categorias) : null

  return {
    mes,
    totales,
    media,
    haceUnAno,
    mesesMedia: previos.length,
    categorias,
    sinCategoria: db.movimientos.filter((m) => m.tipo === 'normal' && !m.categoria_id).length,
    hayAnterior: meses.some((m) => m < mes),
    haySiguiente: meses.some((m) => m > mes),
    enCurso,
    diaCorte,
  }
}

/** Movimientos del mes de una categoría raíz (o sin categoría con null), de tipo Normal */
export function movimientosDeCategoria(db: BaseDatos, mes: string, categoriaId: string | null): Movimiento[] {
  const porId = new Map(db.categorias.map((c) => [c.id, c]))
  return db.movimientos
    .filter((m) => m.tipo === 'normal' && mesEfectivo(m) === mes && raiz(porId, m.categoria_id) === categoriaId)
    .sort((a, b) => b.fecha_operacion.localeCompare(a.fecha_operacion))
}

// ---------------------------------------------------------------------------
// Vistas de análisis
// ---------------------------------------------------------------------------

export interface PuntoEvolucion {
  mes: string
  ingresos: number
  gastos: number
  ahorro: number
}

/** Ingresos, gastos y ahorro por mes en todo el histórico, sin huecos entre el primero y el último */
export function evolucionMensual(db: BaseDatos): PuntoEvolucion[] {
  const meses = mesesConDatos(db.movimientos)
  if (!meses.length) return []
  const res: PuntoEvolucion[] = []
  for (let m = meses[0]; m <= meses[meses.length - 1]; m = sumarMeses(`${m}-01`, 1).slice(0, 7)) {
    const t = calcularTotales(db.movimientos.filter((x) => mesEfectivo(x) === m), db.categorias)
    res.push({ mes: m, ingresos: t.ingresos, gastos: t.gastos, ahorro: t.ahorro })
  }
  return res
}

/** Gasto mensual de una categoría raíz y su media móvil de 3 meses */
export function serieCategoria(db: BaseDatos, categoriaId: string | null): { mes: string; importe: number; mediaMovil: number }[] {
  const meses = evolucionMensual(db).map((p) => p.mes)
  const valores = meses.map((mes) => gastoPorCategoria(db.movimientos.filter((m) => mesEfectivo(m) === mes), db.categorias).get(categoriaId) ?? 0)
  return meses.map((mes, i) => {
    const ventana = valores.slice(Math.max(0, i - 2), i + 1)
    return { mes, importe: valores[i], mediaMovil: redondear(ventana.reduce((s, v) => s + v, 0) / ventana.length) }
  })
}

/** Cierre por año natural */
export function cierreAnual(db: BaseDatos): ({ anio: string; meses: number } & Totales)[] {
  const anios = [...new Set(db.movimientos.map((m) => fechaEfectiva(m).slice(0, 4)))].sort()
  return anios.map((anio) => {
    const movs = db.movimientos.filter((m) => fechaEfectiva(m).startsWith(anio))
    return { anio, meses: mesesConDatos(movs).length, ...calcularTotales(movs, db.categorias) }
  })
}

const eur = formatearRedondo

/** La categoría que más sube frente a su media (al menos 30 € y un 15 %); lo pendiente de categorizar no cuenta */
export function categoriaQueMasSube(e: Extracto): LineaExtracto | null {
  return (
    e.categorias
      .filter((c) => c.id !== null && c.media !== null && c.importe - c.media >= Math.max(30, c.media * 0.15))
      .sort((a, b) => b.importe - b.media! - (a.importe - a.media!))[0] ?? null
  )
}

/** Diferencia frente a la media que merece verse: al menos 20 € y un 15 % (sin «0,00 €» ni céntimos de ruido) */
export function diferenciaRelevante(c: LineaExtracto): number | null {
  if (c.media === null) return null
  const dif = Math.round((c.importe - c.media) * 100) / 100
  return Math.abs(dif) >= 20 && (c.media === 0 || Math.abs(dif) / c.media >= 0.15) ? dif : null
}

/**
 * El mes en una frase, para leerlo de un vistazo: lo gastado (hasta hoy si está en curso), frente a la
 * media de los meses anteriores y la categoría que más se desvía hacia arriba.
 */
export function fraseDelMes(e: Extracto, nombreMes: string): string | null {
  const t = e.totales
  if (!t.movimientos) return null
  const partes = [e.enCurso ? `Llevas ${eur(t.gastos)} gastados en ${nombreMes}` : `En ${nombreMes} gastaste ${eur(t.gastos)}`]
  if (e.media && e.media.gastos > 0) {
    const v = (t.gastos - e.media.gastos) / e.media.gastos
    const cuando = e.enCurso ? ' a estas alturas del mes' : ''
    partes[0] += Math.abs(v) < 0.05 ? `, en línea con tu media${cuando}` : `, un ${Math.round(Math.abs(v) * 100)} % ${v > 0 ? 'más' : 'menos'} que tu media${cuando}`
  }
  const sube = categoriaQueMasSube(e)
  if (sube) partes.push(`Lo que más sube: ${sube.nombre}, ${eur(sube.importe - sube.media!)} por encima de lo habitual`)
  if (t.ingresos > 0) partes.push(t.ahorro >= 0 ? `Ahorras ${eur(t.ahorro)}` : `Gastas ${eur(-t.ahorro)} más de lo que ingresas`)
  return `${partes.join('. ')}.`
}
