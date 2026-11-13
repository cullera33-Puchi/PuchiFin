/**
 * Lectura de los Excel de BBVA: localiza la fila de cabeceras, reconoce el origen por sus columnas
 * (plantillas en ./plantillas) y extrae las filas de movimientos. Solo se leen las columnas de la
 * plantilla: el resto (número de cuenta, IBAN, titular…) se descarta al leer.
 */
import * as XLSX from 'xlsx'
import cuenta from './plantillas/bbva-cuenta.json'
import tarjeta from './plantillas/bbva-tarjeta.json'
import type { OrigenImportacion, TipoCuenta } from '../lib/tipos'

export type Campo = 'fecha_operacion' | 'fecha_valor' | 'concepto' | 'detalle' | 'concepto_extra' | 'importe' | 'saldo'

export interface Plantilla {
  origen: OrigenImportacion
  nombre: string
  tipo_cuenta: TipoCuenta
  columnas: Partial<Record<Campo, string[]>>
  obligatorias: Campo[]
  /** Campos que deben existir para distinguir este origen */
  firma?: Campo[]
  /** Campos que no deben existir */
  sin?: Campo[]
  signo: 'tal_cual' | 'invertido'
  /** «la_anterior»: la anterior entre fecha y fecha valor (compras del fin de semana cargadas el lunes) */
  fecha?: 'operacion' | 'la_anterior'
  /** Concepto en campos de ancho fijo: comercio, población y país */
  concepto_ancho_fijo?: [number, number, number]
  /** Valores de la columna de detalle que son solo el tipo de operación */
  operaciones?: string[]
  /** Categorías que BBVA pone en la columna del detalle: se tratan como operación, fuera del nombre del comercio */
  categorias_banco?: string[]
  /** Conceptos en los que el detalle es el nombre de una persona (traspasos, transferencias) */
  tercero_si_concepto?: string[]
  /** Conceptos que no dicen nada por sí solos: el concepto limpio es el detalle */
  concepto_generico?: string[]
}

export const PLANTILLAS: Plantilla[] = [cuenta as unknown as Plantilla, tarjeta as unknown as Plantilla]

export interface FilaBruta {
  /** Número de fila en el Excel (1 = primera), para señalar la línea afectada */
  numero: number
  fecha_operacion: string
  fecha_valor: string | null
  /** Concepto principal (el comercio, si viene en ancho fijo) */
  concepto: string
  /** Detalle útil para el concepto (Bizum, adeudos…) */
  detalle: string | null
  /** Nombre de una persona (titular u ordenante): se sustituye por alias o se quita */
  tercero: string | null
  /** Tipo de operación («Pago con tarjeta»): solo para las reglas */
  operacion: string | null
  /** Observaciones */
  extra: string | null
  poblacion: string | null
  /** El concepto principal es genérico («Adeudo a su cargo»): el detalle hace de concepto */
  generico: boolean
  importe: number
  saldo: number | null
}

/** Separa un concepto de ancho fijo (comercio, población, país) si tiene ese formato */
export function partirAnchoFijo(texto: string, anchos?: [number, number, number]): { comercio: string; poblacion: string | null } {
  const t = texto.replace(/\s+$/, '')
  if (anchos) {
    const [a, b, c] = anchos
    if (t.length === a + b + c && /^[a-z]{2}$/i.test(t.slice(a + b)) && (/\s$/.test(t.slice(0, a)) || /\s{2}/.test(t))) {
      const comercio = t.slice(0, a).trim()
      const poblacion = t.slice(a, a + b).replace(/[\s,]+$/, '').trim()
      if (comercio) return { comercio, poblacion: poblacion || null }
    }
  }
  return { comercio: t.replace(/\s+/g, ' ').trim(), poblacion: null }
}

export interface Lectura {
  plantilla: Plantilla
  hoja: string
  filas: FilaBruta[]
  /** Filas que parecían movimientos pero no se pudieron leer (fecha o importe no válidos) */
  ilegibles: number[]
}

export class ErrorLectura extends Error {}

/** Cabecera comparable: minúsculas, sin acentos ni signos */
export const normalizarCabecera = (v: unknown) =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

type Columnas = Partial<Record<Campo, number[]>>

function columnasDe(fila: unknown[], p: Plantilla): Columnas {
  const cab = fila.map(normalizarCabecera)
  const res: Columnas = {}
  for (const [campo, nombres] of Object.entries(p.columnas) as [Campo, string[]][]) {
    const idx = cab.flatMap((c, i) => (nombres.map(normalizarCabecera).includes(c) ? [i] : []))
    if (idx.length) res[campo] = campo === 'concepto_extra' ? idx : [idx[0]]
  }
  return res
}

/** Busca la fila de cabeceras y la plantilla que encaja, en las primeras 40 filas */
export function detectar(filas: unknown[][], plantillas = PLANTILLAS): { plantilla: Plantilla; fila: number; columnas: Columnas } | null {
  for (let i = 0; i < Math.min(filas.length, 40); i++) {
    const candidatas = plantillas
      .map((p) => ({ p, c: columnasDe(filas[i] ?? [], p) }))
      .filter(({ p, c }) => p.obligatorias.every((o) => c[o]) && (p.firma ?? []).every((f) => c[f]) && !(p.sin ?? []).some((f) => c[f]))
    if (candidatas.length) return { plantilla: candidatas[0].p, fila: i, columnas: candidatas[0].c }
  }
  return null
}

const iso = (a: number, m: number, d: number) => {
  if (a < 100) a += 2000
  const f = new Date(Date.UTC(a, m - 1, d))
  if (f.getUTCFullYear() !== a || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) return null
  return f.toISOString().slice(0, 10)
}

/** Fecha de Excel: objeto Date, número de serie o texto dd/mm/aaaa o aaaa-mm-dd */
export function leerFecha(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) {
    // SheetJS crea la fecha a medianoche local: se usan los componentes locales
    return iso(v.getFullYear(), v.getMonth() + 1, v.getDate())
  }
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const d = XLSX.SSF.parse_date_code(v)
    return d ? iso(d.y, d.m, d.d) : null
  }
  const s = String(v ?? '').trim()
  let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s)
  if (m) return iso(Number(m[3]), Number(m[2]), Number(m[1]))
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]))
  return null
}

/** Importe: número o texto en formato español ("-1.234,56 €", "1234.56") */
export function leerImporte(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) / 100 : null
  let s = String(v ?? '').replace(/[€\s]|EUR/gi, '').replace(/−/g, '-')
  if (!s) return null
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.')
  else s = s.replace(/,/g, '')
  const n = Number(s)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}

const texto = (fila: unknown[], idx: number[] | undefined) =>
  (idx ?? [])
    .map((i) => String(fila[i] ?? '').trim())
    .filter(Boolean)
    .join(' ')

/** Extrae los movimientos de un libro ya convertido en filas */
export function extraer(filas: unknown[][], hoja = 'Hoja 1', plantillas = PLANTILLAS): Lectura {
  const d = detectar(filas, plantillas)
  if (!d) throw new ErrorLectura('No se reconoce el fichero: no es un Excel de movimientos de cuenta ni de tarjeta de BBVA, o sus columnas han cambiado')
  const { plantilla, columnas } = d
  const res: FilaBruta[] = []
  const ilegibles: number[] = []
  for (let i = d.fila + 1; i < filas.length; i++) {
    const fila = filas[i] ?? []
    const conceptoBruto = (columnas.concepto ?? []).map((i) => String(fila[i] ?? '')).join(' ')
    const concepto = conceptoBruto.trim()
    const extra = texto(fila, columnas.concepto_extra)
    const detalleBruto = texto(fila, columnas.detalle)
    const brutoFecha = fila[columnas.fecha_operacion![0]]
    const brutoImporte = fila[columnas.importe![0]]
    if (!concepto && (brutoImporte === undefined || brutoImporte === '')) continue // fila vacía
    if (/^(total|saldo|suma)/i.test(normalizarCabecera(concepto)) || /^(total|saldo)/i.test(normalizarCabecera(brutoFecha))) continue
    const fecha = leerFecha(brutoFecha)
    const importe = leerImporte(brutoImporte)
    if (!fecha || importe === null) {
      ilegibles.push(i + 1)
      continue
    }
    const valor = columnas.fecha_valor ? leerFecha(fila[columnas.fecha_valor[0]]) : null
    const operacionFecha = plantilla.fecha === 'la_anterior' && valor && valor < fecha ? valor : fecha
    const { comercio, poblacion } = partirAnchoFijo(conceptoBruto, plantilla.concepto_ancho_fijo)
    const conceptoN = normalizarCabecera(comercio)
    const detalleN = normalizarCabecera(detalleBruto)
    const esOperacion =
      !!detalleBruto && [...(plantilla.operaciones ?? []), ...(plantilla.categorias_banco ?? [])].map(normalizarCabecera).includes(detalleN)
    const esTercero = !!detalleBruto && !esOperacion && (plantilla.tercero_si_concepto ?? []).some((r) => new RegExp(r, 'i').test(conceptoN))
    res.push({
      numero: i + 1,
      fecha_operacion: operacionFecha,
      fecha_valor: valor ?? (operacionFecha !== fecha ? fecha : null),
      concepto: comercio,
      detalle: detalleBruto && !esOperacion && !esTercero ? detalleBruto : null,
      tercero: esTercero ? detalleBruto : null,
      operacion: esOperacion ? detalleBruto : null,
      extra: extra || null,
      poblacion,
      generico: (plantilla.concepto_generico ?? []).map(normalizarCabecera).includes(conceptoN),
      importe: plantilla.signo === 'invertido' ? -importe : importe,
      saldo: columnas.saldo ? leerImporte(fila[columnas.saldo[0]]) : null,
    })
  }
  if (!res.length) throw new ErrorLectura('El fichero no tiene movimientos')
  return { plantilla, hoja, filas: res, ilegibles }
}

/** Lee un fichero Excel (xlsx o xls) o CSV y extrae sus movimientos de la primera hoja que se reconozca */
export function leerFichero(datos: ArrayBuffer | Uint8Array): Lectura {
  let libro: XLSX.WorkBook
  try {
    libro = XLSX.read(datos, { type: 'array', cellDates: true, dense: true })
  } catch {
    throw new ErrorLectura('El fichero no se puede abrir como Excel')
  }
  let ultimoError: Error | null = null
  for (const nombre of libro.SheetNames) {
    const filas = XLSX.utils.sheet_to_json<unknown[]>(libro.Sheets[nombre], { header: 1, raw: true, defval: '' })
    try {
      return extraer(filas, nombre)
    } catch (e) {
      ultimoError = e as Error
    }
  }
  throw ultimoError ?? new ErrorLectura('El fichero está vacío')
}

/** Lee lo pegado: una tabla copiada de la web (HTML) o texto separado por tabuladores, punto y coma o comas */
export function leerTexto(texto: string, html = false): Lectura {
  const limpio = texto.replace(/\r\n?/g, '\n').trim()
  if (!limpio) throw new ErrorLectura('No hay nada pegado')
  let filas: unknown[][]
  if (html || /<table[\s>]/i.test(limpio)) {
    const libro = XLSX.read(limpio, { type: 'string', raw: true })
    filas = XLSX.utils.sheet_to_json<unknown[]>(libro.Sheets[libro.SheetNames[0]], { header: 1, raw: false, defval: '' })
  } else {
    // Separador: el que más aparece en las primeras líneas
    const muestra = limpio.split('\n').slice(0, 10).join('\n')
    const sep = ['\t', ';', ','].map((s) => [s, muestra.split(s).length] as const).sort((a, b) => b[1] - a[1])[0][0]
    filas = limpio.split('\n').map((l) => l.split(sep).map((c) => c.trim().replace(/^"(.*)"$/, '$1')))
  }
  return extraer(filas, 'Pegado')
}

/** Lee lo que venga del portapapeles: un fichero, HTML o texto */
export async function leerPortapapeles(contenido: { archivo?: Blob | null; html?: string | null; texto?: string | null }): Promise<Lectura> {
  if (contenido.archivo) return leerFichero(new Uint8Array(await contenido.archivo.arrayBuffer()))
  if (contenido.html && /<table[\s>]/i.test(contenido.html)) return leerTexto(contenido.html, true)
  if (contenido.texto) return leerTexto(contenido.texto)
  throw new ErrorLectura('Lo copiado no es un Excel ni una tabla de movimientos')
}
