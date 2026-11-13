/**
 * Cálculo de los resúmenes semanal y mensual (pantalla Resúmenes y PDF).
 *
 * Reglas:
 * - Solo los movimientos de tipo Normal computan (regla 5). El resto se muestra aparte.
 * - Categoría de ingreso: suma a ingresos. Categoría de gasto: el importe neto resta (una devolución
 *   positiva reduce el gasto de su categoría). Sin categoría: se clasifica por el signo.
 * - Semana de lunes a domingo. En el resumen mensual, las semanas se recortan al mes.
 */
import { diaLargo, lunesDe, mesLargo, nombreMes, primeroDeMes, sumarDias, sumarMeses, ultimoDeMes } from './fechas'
import { formatearImporte } from './formato'
import { fechaEfectiva } from './imputacion'
import type { Categoria, TipoMovimiento } from './tipos'

export type TipoPeriodo = 'semana' | 'mes'

export interface Periodo {
  tipo: TipoPeriodo
  inicio: string
  fin: string // incluido
  etiqueta: string
  /** Nombre corto para las comparativas: "octubre", "la semana anterior" */
  nombreCorto: string
}

export interface MovimientoResumen {
  id: string
  cuenta_id: string
  fecha_operacion: string
  /** Mes al que se imputa, si no es el de la fecha (nómina del 30 que es del mes siguiente) */
  mes_imputacion?: string | null
  concepto_limpio: string
  importe: number
  tipo: TipoMovimiento
  categoria_id: string | null
}

export interface LineaCategoria {
  id: string | null // null: sin categoría
  nombre: string
  color: string
  icono: string | null
  importe: number // gasto neto, en positivo
  peso: number // sobre el gasto total, de 0 a 1
  anterior: number | null
  diferencia: number | null
  subcategorias: { id: string; nombre: string; importe: number }[]
}

export interface Totales {
  ingresos: number
  gastos: number // en positivo
  ahorro: number
  tasaAhorro: number | null // ahorro sobre ingresos, de 0 a 1
  movimientos: number
}

export interface Resumen {
  periodo: Periodo
  /** Periodo anterior; si el actual está en curso, recortado a los mismos días */
  anterior: Periodo
  /** El periodo incluye hoy: los datos llegan hasta "corte" */
  enCurso: boolean
  corte: string
  totales: Totales
  totalesAnterior: Totales
  categorias: LineaCategoria[]
  ingresosPorCategoria: { id: string | null; nombre: string; importe: number }[]
  semanas: (Totales & { periodo: Periodo })[] // solo en el resumen mensual
  mayoresGastos: MovimientoResumen[]
  movimientos: MovimientoResumen[] // todos los del periodo, de cualquier tipo, por fecha
  fueraDelExtracto: { tipo: TipoMovimiento; importe: number; movimientos: number }[]
  empleado: { gastos: number; gastosNumero: number; reembolsos: number; reembolsosNumero: number }
  sinCategoria: number
}

const redondear = (n: number) => Math.round(n * 100) / 100

export function periodoSemana(fecha: string): Periodo {
  const inicio = lunesDe(fecha)
  const fin = sumarDias(inicio, 6)
  const mismoMes = inicio.slice(0, 7) === fin.slice(0, 7)
  const etiqueta = mismoMes
    ? `Semana del ${Number(inicio.slice(8))} al ${diaLargo(fin, true)}`
    : `Semana del ${diaLargo(inicio)} al ${diaLargo(fin, true)}`
  return { tipo: 'semana', inicio, fin, etiqueta, nombreCorto: 'la semana anterior' }
}

export function periodoMes(fecha: string): Periodo {
  const inicio = primeroDeMes(fecha)
  return { tipo: 'mes', inicio, fin: ultimoDeMes(inicio), etiqueta: mesLargo(inicio), nombreCorto: nombreMes(inicio) }
}

export function periodoDe(tipo: TipoPeriodo, fecha: string): Periodo {
  return tipo === 'semana' ? periodoSemana(fecha) : periodoMes(fecha)
}

export function desplazarPeriodo(p: Periodo, pasos: number): Periodo {
  return p.tipo === 'semana' ? periodoSemana(sumarDias(p.inicio, 7 * pasos)) : periodoMes(sumarMeses(p.inicio, pasos))
}

/** Semanas de lunes a domingo que tocan el mes, recortadas a sus días */
export function semanasDelMes(mes: Periodo): Periodo[] {
  const semanas: Periodo[] = []
  for (let lunes = lunesDe(mes.inicio); lunes <= mes.fin; lunes = sumarDias(lunes, 7)) {
    const inicio = lunes < mes.inicio ? mes.inicio : lunes
    const domingo = sumarDias(lunes, 6)
    const fin = domingo > mes.fin ? mes.fin : domingo
    const etiqueta = inicio === fin ? diaLargo(inicio) : `Del ${Number(inicio.slice(8))} al ${diaLargo(fin)}`
    semanas.push({ tipo: 'semana', inicio, fin, etiqueta, nombreCorto: etiqueta })
  }
  return semanas
}

/** Por fecha efectiva: lo imputado al mes siguiente cuenta desde el día 1 de ese mes */
export const enPeriodo = (m: { fecha_operacion: string; mes_imputacion?: string | null }, p: { inicio: string; fin: string }) => {
  const f = fechaEfectiva(m)
  return f >= p.inicio && f <= p.fin
}

function naturalezaDe(m: MovimientoResumen, porId: Map<string, Categoria>): 'gasto' | 'ingreso' {
  const c = m.categoria_id ? porId.get(m.categoria_id) : undefined
  if (c) return c.naturaleza
  return m.importe >= 0 ? 'ingreso' : 'gasto'
}

export function calcularTotales(movs: MovimientoResumen[], categorias: Categoria[]): Totales {
  const porId = new Map(categorias.map((c) => [c.id, c]))
  let ingresos = 0
  let gastos = 0
  let movimientos = 0
  for (const m of movs) {
    if (m.tipo !== 'normal') continue
    movimientos++
    if (naturalezaDe(m, porId) === 'ingreso') ingresos += m.importe
    else gastos -= m.importe
  }
  ingresos = redondear(ingresos)
  gastos = redondear(gastos)
  const ahorro = redondear(ingresos - gastos)
  return { ingresos, gastos, ahorro, tasaAhorro: ingresos > 0 ? ahorro / ingresos : null, movimientos }
}

function raizDe(id: string | null, porId: Map<string, Categoria>): Categoria | undefined {
  if (!id) return undefined
  const c = porId.get(id)
  if (!c) return undefined
  return c.padre_id ? porId.get(c.padre_id) ?? c : c
}

function gastoPorCategoria(movs: MovimientoResumen[], porId: Map<string, Categoria>) {
  const raices = new Map<string | null, number>()
  const subs = new Map<string, number>()
  for (const m of movs) {
    if (m.tipo !== 'normal' || naturalezaDe(m, porId) !== 'gasto') continue
    const raiz = raizDe(m.categoria_id, porId)
    const clave = raiz?.id ?? null
    raices.set(clave, (raices.get(clave) ?? 0) - m.importe)
    const c = m.categoria_id ? porId.get(m.categoria_id) : undefined
    if (c?.padre_id) subs.set(c.id, (subs.get(c.id) ?? 0) - m.importe)
  }
  return { raices, subs }
}

/**
 * Periodo anterior comparable. Si el actual está en curso (incluye hoy), se recorta a los mismos
 * días: del 1 al 13 de octubre frente al 1 al 13 de noviembre, o de lunes a viernes.
 */
export function periodoComparable(periodo: Periodo, hoy?: string): { anterior: Periodo; enCurso: boolean; corte: string } {
  const anterior = desplazarPeriodo(periodo, -1)
  if (!hoy || hoy < periodo.inicio || hoy >= periodo.fin) return { anterior, enCurso: false, corte: periodo.fin }
  const dias = Math.round((Date.parse(hoy) - Date.parse(periodo.inicio)) / 86400000)
  const fin = sumarDias(anterior.inicio, dias) < anterior.fin ? sumarDias(anterior.inicio, dias) : anterior.fin
  const nombreCorto =
    periodo.tipo === 'mes'
      ? `${anterior.nombreCorto} (del 1 al ${Number(fin.slice(8))})`
      : `la semana anterior (hasta el ${diaSemanaNombre(fin)})`
  return { anterior: { ...anterior, fin, nombreCorto }, enCurso: true, corte: hoy }
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const diaSemanaNombre = (iso: string) => DIAS[new Date(`${iso}T00:00:00Z`).getUTCDay()]

export function calcularResumen(
  periodo: Periodo,
  movs: MovimientoResumen[],
  categorias: Categoria[],
  topGastos = 10,
  hoy?: string,
): Resumen {
  const { anterior, enCurso, corte } = periodoComparable(periodo, hoy)
  const porId = new Map(categorias.map((c) => [c.id, c]))
  const actuales = movs
    .filter((m) => enPeriodo(m, periodo))
    .sort((a, b) => fechaEfectiva(a).localeCompare(fechaEfectiva(b)) || a.importe - b.importe)
  const previos = movs.filter((m) => enPeriodo(m, anterior))

  const totales = calcularTotales(actuales, categorias)
  const totalesAnterior = calcularTotales(previos, categorias)

  const ahora = gastoPorCategoria(actuales, porId)
  const antes = gastoPorCategoria(previos, porId)
  const claves = new Set([...ahora.raices.keys(), ...antes.raices.keys()])
  const lineas: LineaCategoria[] = [...claves].map((id) => {
    const c = id ? porId.get(id) : undefined
    const importe = redondear(ahora.raices.get(id) ?? 0)
    const previo = antes.raices.has(id) ? redondear(antes.raices.get(id) ?? 0) : null
    const subcategorias = categorias
      .filter((s) => s.padre_id === id && ahora.subs.has(s.id))
      .map((s) => ({ id: s.id, nombre: s.nombre, importe: redondear(ahora.subs.get(s.id) ?? 0) }))
      .sort((a, b) => b.importe - a.importe)
    return {
      id,
      nombre: c?.nombre ?? 'Sin categoría',
      color: c?.color ?? '#9E9E9E',
      icono: c?.icono ?? null,
      importe,
      peso: totales.gastos > 0 ? importe / totales.gastos : 0,
      anterior: previo,
      diferencia: previo === null ? null : redondear(importe - previo),
      subcategorias,
    }
  })
  lineas.sort((a, b) => b.importe - a.importe || (b.anterior ?? 0) - (a.anterior ?? 0))

  const ingresosMapa = new Map<string | null, number>()
  for (const m of actuales) {
    if (m.tipo !== 'normal' || naturalezaDe(m, porId) !== 'ingreso') continue
    const raiz = raizDe(m.categoria_id, porId)
    const c = m.categoria_id ? porId.get(m.categoria_id) : undefined
    const id = c?.padre_id ? c.id : raiz?.id ?? null // los ingresos se ven por subcategoría (Nómina, Otros)
    ingresosMapa.set(id, (ingresosMapa.get(id) ?? 0) + m.importe)
  }
  const ingresosPorCategoria = [...ingresosMapa.entries()]
    .map(([id, importe]) => ({ id, nombre: id ? porId.get(id)?.nombre ?? '?' : 'Sin categoría', importe: redondear(importe) }))
    .sort((a, b) => b.importe - a.importe)

  const semanas =
    periodo.tipo === 'mes'
      ? semanasDelMes(periodo)
          .filter((s) => s.inicio <= corte) // en curso, sin las semanas que no han empezado
          .map((s) => ({ periodo: s, ...calcularTotales(actuales.filter((m) => enPeriodo(m, s)), categorias) }))
      : []

  const mayoresGastos = actuales
    .filter((m) => m.tipo === 'normal' && m.importe < 0 && naturalezaDe(m, porId) === 'gasto')
    .sort((a, b) => a.importe - b.importe)
    .slice(0, topGastos)

  const fuera = new Map<TipoMovimiento, { importe: number; movimientos: number }>()
  for (const m of actuales) {
    if (m.tipo === 'normal') continue
    const f = fuera.get(m.tipo) ?? { importe: 0, movimientos: 0 }
    f.importe += m.importe
    f.movimientos++
    fuera.set(m.tipo, f)
  }
  const fueraDelExtracto = [...fuera.entries()].map(([tipo, f]) => ({ tipo, importe: redondear(f.importe), movimientos: f.movimientos }))

  const gastosEmp = actuales.filter((m) => m.tipo === 'gasto_empleado')
  const reembolsos = actuales.filter((m) => m.tipo === 'reembolso_empresa')

  return {
    periodo,
    anterior,
    enCurso,
    corte,
    totales,
    totalesAnterior,
    categorias: lineas,
    ingresosPorCategoria,
    semanas,
    mayoresGastos,
    movimientos: actuales,
    fueraDelExtracto,
    empleado: {
      gastos: redondear(-gastosEmp.reduce((s, m) => s + m.importe, 0)),
      gastosNumero: gastosEmp.length,
      reembolsos: redondear(reembolsos.reduce((s, m) => s + m.importe, 0)),
      reembolsosNumero: reembolsos.length,
    },
    sinCategoria: actuales.filter((m) => m.tipo === 'normal' && !m.categoria_id).length,
  }
}

/** Variación relativa frente al periodo anterior, o null si no hay base */
export function variacion(actual: number, anterior: number | null): number | null {
  if (anterior === null || anterior === 0) return null
  return (actual - anterior) / Math.abs(anterior)
}

export type Tono = 'bueno' | 'malo' | 'neutro'

export const porcentaje = (v: number) =>
  `${(v * 100).toLocaleString('es-ES', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} %`

const enNombre = (nombre: string) => (nombre.startsWith('la semana') ? nombre : `en ${nombre}`)

/** "8,2 % más que en octubre", con el tono según sea bueno o malo */
export function textoComparacion(actual: number, anterior: number, nombre: string, subirEsBueno: boolean): { texto: string; tono: Tono } {
  const v = variacion(actual, anterior)
  if (v === null) return { texto: `Sin datos de ${nombre}`, tono: 'neutro' }
  if (Math.abs(v) < 0.0005) return { texto: `Igual que ${enNombre(nombre)}`, tono: 'neutro' }
  const sube = v > 0
  return { texto: `${porcentaje(Math.abs(v))} ${sube ? 'más' : 'menos'} que ${enNombre(nombre)}`, tono: sube === subirEsBueno ? 'bueno' : 'malo' }
}

const conSigno = (n: number) => (n > 0 ? `+${formatearImporte(n)}` : formatearImporte(n))

/** Indicadores de cabecera con su comparación con el periodo anterior */
export function indicadores(r: Resumen): { etiqueta: string; valor: string; comparacion: { texto: string; tono: Tono } }[] {
  const t = r.totales
  const a = r.totalesAnterior
  const nombre = r.anterior.nombreCorto
  const hayAnterior = a.movimientos > 0
  return [
    { etiqueta: 'Ingresos', valor: formatearImporte(t.ingresos), comparacion: hayAnterior ? textoComparacion(t.ingresos, a.ingresos, nombre, true) : { texto: `Sin datos de ${nombre}`, tono: 'neutro' } },
    { etiqueta: 'Gastos', valor: formatearImporte(t.gastos), comparacion: hayAnterior ? textoComparacion(t.gastos, a.gastos, nombre, false) : { texto: `Sin datos de ${nombre}`, tono: 'neutro' } },
    {
      etiqueta: 'Ahorro',
      valor: formatearImporte(t.ahorro),
      comparacion: hayAnterior
        ? { texto: `${conSigno(redondear(t.ahorro - a.ahorro))} frente a ${nombre}`, tono: t.ahorro >= a.ahorro ? 'bueno' : 'malo' }
        : { texto: `Sin datos de ${nombre}`, tono: 'neutro' },
    },
    {
      etiqueta: 'Tasa de ahorro',
      valor: t.tasaAhorro === null ? 'Sin ingresos' : porcentaje(t.tasaAhorro),
      comparacion:
        t.tasaAhorro !== null && a.tasaAhorro !== null
          ? {
              texto: `${t.tasaAhorro >= a.tasaAhorro ? '+' : ''}${((t.tasaAhorro - a.tasaAhorro) * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} puntos frente a ${nombre}`,
              tono: t.tasaAhorro >= a.tasaAhorro ? 'bueno' : 'malo',
            }
          : { texto: '', tono: 'neutro' },
    },
  ]
}

/** Aviso de periodo en curso: "Mes en curso: datos hasta el 13 de noviembre…" */
export function textoEnCurso(r: Resumen): string | null {
  if (!r.enCurso) return null
  const que = r.periodo.tipo === 'mes' ? 'Mes en curso' : 'Semana en curso'
  return `${que}: datos hasta el ${diaLargo(r.corte)}. La comparación es con los mismos días de ${r.periodo.tipo === 'mes' ? r.anterior.etiqueta.split(' de ')[0].toLowerCase() : 'la semana anterior'}.`
}

/** Frases del bloque «Fuera del extracto»: gastos de empleado, reembolsos, traspasos y deuda (solo lo que hay) */
export function lineasFueraDelExtracto(r: Resumen): string[] {
  const e = r.empleado
  const eur = formatearImporte
  const lineas: string[] = []
  if (e.gastosNumero) lineas.push(`Gastos de empleado: ${eur(e.gastos)} en ${e.gastosNumero} ${e.gastosNumero === 1 ? 'movimiento' : 'movimientos'}.`)
  if (e.reembolsosNumero) lineas.push(`Reembolsos: ${eur(e.reembolsos)} en ${e.reembolsosNumero} ${e.reembolsosNumero === 1 ? 'movimiento' : 'movimientos'}.`)
  const traspasos = r.fueraDelExtracto.find((f) => f.tipo === 'traspaso_interno')
  if (traspasos) lineas.push(`Traspasos internos y liquidaciones de tarjeta: ${traspasos.movimientos} ${traspasos.movimientos === 1 ? 'movimiento' : 'movimientos'}, sin efecto en el gasto.`)
  const deuda = r.fueraDelExtracto.find((f) => f.tipo === 'pago_deuda')
  if (deuda) lineas.push(`Pagos de la deuda familiar: ${eur(-deuda.importe)}.`)
  if (r.sinCategoria) lineas.push(`${r.sinCategoria} ${r.sinCategoria === 1 ? 'movimiento sin categoría, incluido' : 'movimientos sin categoría, incluidos'} en «Sin categoría».`)
  return lineas
}
