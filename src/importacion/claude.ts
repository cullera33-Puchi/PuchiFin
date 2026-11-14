/**
 * Categorizar con Claude en el chat, sin que ningún dato personal llegue al código:
 *   1. Resumen de comercios: se leen los Excel de BBVA de cualquier periodo,
 *      se anonimizan igual que al importar y se agrupan por comercio. Solo sale el comercio, cuántas
 *      veces aparece, el importe total y medio y la categoría que pondría hoy la app. Sin fechas,
 *      saldos, cuentas ni nombres. No se guarda nada en el dispositivo.
 *   2. Reglas de Claude: el usuario pega el texto que devuelve Claude («comercio, tabulador,
 *      Categoría > Subcategoría») y la app crea reglas manuales en el dispositivo, con vista previa.
 */
import { ErrorDatos, exigirSinIdentificativos, nuevoId } from '../datos/operaciones'
import { claveComercio, normalizarConcepto } from '../lib/conceptos'
import { contieneIdentificativo } from '../lib/identificativos'
import { NOMBRE_TIPO_MOVIMIENTO, type BaseDatos, type Regla, type TipoMovimiento } from '../lib/tipos'
import { conceptosDeFila } from './importar'
import type { Lectura } from './lector'
import { categoriasAprendidas, clasificar } from './reglas'

const redondear = (n: number) => Math.round(n * 100) / 100

export interface LineaResumen {
  clave: string
  ejemplo: string
  signo: 'gasto' | 'ingreso'
  movimientos: number
  total: number
  /** Categoría o tipo que pondría hoy la app; null si quedaría sin categoría */
  categoriaApp: string | null
}

/** Ruta legible de una categoría: «Restaurantes > Cafeterías» */
export function rutaCategoria(db: BaseDatos, id: string | null): string | null {
  const c = id ? db.categorias.find((x) => x.id === id) : undefined
  if (!c) return null
  const p = c.padre_id ? db.categorias.find((x) => x.id === c.padre_id) : undefined
  return p ? `${p.nombre} > ${c.nombre}` : c.nombre
}

export function resumirComercios(db: BaseDatos, lecturas: Lectura[]): { lineas: LineaResumen[]; movimientos: number; descartadas: number } {
  const aprendidas = categoriasAprendidas(db)
  const grupos = new Map<string, LineaResumen>()
  let movimientos = 0
  let descartadas = 0
  for (const l of lecturas) {
    for (const f of l.filas) {
      const { original, limpio, normalizado } = conceptosDeFila(f, db.ajustes.alias_terceros)
      const clave = claveComercio(limpio) || normalizado
      // Verificación final: si quedara algo identificativo, la fila no sale
      if (!clave || contieneIdentificativo(clave) || contieneIdentificativo(limpio)) {
        descartadas++
        continue
      }
      movimientos++
      const signo = f.importe < 0 ? 'gasto' : 'ingreso'
      const k = `${signo}|${clave}`
      let g = grupos.get(k)
      if (!g) {
        const c = clasificar({ texto: normalizarConcepto(original), clave, cuenta_id: '', importe: f.importe }, db.reglas, aprendidas)
        const categoriaApp = c.tipo === 'traspaso_interno' ? 'Traspaso interno' : rutaCategoria(db, c.categoria_id)
        // Sin fechas ni referencias de mes en el ejemplo («Gastos 10/2026»)
        const ejemplo = limpio.replace(/\b\d{1,2}[/.-]\d{1,4}(?:[/.-]\d{2,4})?\b/g, '').replace(/\s{2,}/g, ' ').trim()
        g = { clave, ejemplo, signo, movimientos: 0, total: 0, categoriaApp }
        grupos.set(k, g)
      }
      g.movimientos++
      g.total = redondear(g.total + f.importe)
    }
  }
  const lineas = [...grupos.values()].sort((a, b) => Number(!!a.categoriaApp) - Number(!!b.categoriaApp) || b.movimientos - a.movimientos || Math.abs(b.total) - Math.abs(a.total))
  return { lineas, movimientos, descartadas }
}

/** Texto para pegar en el chat con Claude: instrucciones, categorías disponibles y comercios */
export function textoResumen(db: BaseDatos, r: ReturnType<typeof resumirComercios>): string {
  const fmt = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const rutas = db.categorias
    .filter((c) => c.padre_id && c.activa)
    .map((c) => rutaCategoria(db, c.id)!)
    .sort((a, b) => a.localeCompare(b, 'es'))
  const sin = r.lineas.filter((l) => !l.categoriaApp).length
  return [
    'PuchiFin: resumen de comercios para categorizar (anonimizado: sin fechas, saldos, cuentas ni nombres).',
    `${r.movimientos} movimientos en ${r.lineas.length} comercios; ${sin} sin categoría con las reglas actuales.`,
    'Devuélveme una línea por comercio con: clave, tabulador, Categoría > Subcategoría (de la lista).',
    'Con «~» delante de la clave, la palabra se busca en cualquier parte del concepto. En lugar de la categoría puede ir «Tipo: Traspaso interno», «Tipo: Pago de deuda», «Tipo: Reembolso de empresa» o «Tipo: Gasto de empleado».',
    '',
    'Categorías disponibles:',
    ...rutas.map((x) => `- ${x}`),
    '',
    ['clave', 'ejemplo', 'signo', 'movimientos', 'total', 'medio', 'categoria_app'].join('\t'),
    ...r.lineas.map((l) => [l.clave, l.ejemplo, l.signo, l.movimientos, fmt(l.total), fmt(l.total / l.movimientos), l.categoriaApp ?? 'SIN CATEGORIA'].join('\t')),
  ].join('\n')
}

export interface LineaRegla {
  linea: number
  clave: string
  /** «exacto»: el comercio; «contiene»: una palabra o frase en cualquier parte del concepto (línea con «~») */
  modo: 'exacto' | 'contiene'
  categoria_id: string | null
  /** Reglas de tipo («Tipo: Traspaso interno»): sin categoría */
  tipo: TipoMovimiento | null
  error: string | null
}

const TIPOS_POR_NOMBRE = new Map(Object.entries(NOMBRE_TIPO_MOVIMIENTO).map(([k, v]) => [v.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''), k as TipoMovimiento]))

const sinAcentos = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

/**
 * Lee las reglas pegadas: «clave<TAB>Categoría > Subcategoría» (también vale «;» o « | »).
 * «~palabra<TAB>…» busca la palabra en cualquier parte del concepto; «…<TAB>Tipo: Traspaso interno»
 * cambia el tipo en lugar de la categoría.
 */
export function leerReglas(db: BaseDatos, texto: string): LineaRegla[] {
  const porRuta = new Map(db.categorias.filter((c) => c.activa).map((c) => [sinAcentos(rutaCategoria(db, c.id)!), c.id]))
  const res: LineaRegla[] = []
  texto.split(/\r?\n/).forEach((bruta, i) => {
    const t = bruta.trim().replace(/^[-*]\s+/, '')
    if (!t || t.startsWith('#') || /^clave\b/i.test(t)) return
    const partes = t.split(/\t|\s*;\s*|\s+\|\s+|\s+(?:→|->)\s+/).map((x) => x.trim()).filter(Boolean)
    const modo = partes[0]?.startsWith('~') ? 'contiene' : 'exacto'
    if (partes.length < 2) return res.push({ linea: i + 1, clave: t, modo, categoria_id: null, tipo: null, error: 'Falta la categoría' })
    // Exacto: la misma clave de comercio que usa la app (sin números ni formas jurídicas); contiene: el texto normalizado
    const bruto = partes[0].replace(/^~\s*/, '')
    const clave = modo === 'contiene' ? normalizarConcepto(bruto) : claveComercio(bruto) || normalizarConcepto(bruto)
    const destino = partes[partes.length - 1]
    const tipoTexto = /^tipo\s*:/i.test(destino) ? sinAcentos(destino.replace(/^tipo\s*:\s*/i, '')) : null
    const tipo = tipoTexto ? (TIPOS_POR_NOMBRE.get(tipoTexto) ?? null) : null
    const ruta = destino.replace(/[,:]\s*/g, ' > ').replace(/\s*>\s*/g, ' > ')
    const categoria_id = tipoTexto ? null : (porRuta.get(sinAcentos(ruta)) ?? null)
    let error: string | null = null
    if (!clave || clave.length < 3) error = 'Falta el comercio o la palabra'
    else if (contieneIdentificativo(clave)) error = 'Contiene un dato identificativo'
    else if (tipoTexto && !tipo) error = `No existe el tipo «${destino}»`
    else if (!tipoTexto && !categoria_id) error = `No existe la categoría «${destino}»`
    res.push({ linea: i + 1, clave, modo, categoria_id, tipo, error })
  })
  return res
}

/** Crea o actualiza reglas manuales por comercio exacto. Lo ya categorizado no cambia */
export function importarReglas(db: BaseDatos, lineas: LineaRegla[]): { db: BaseDatos; nuevas: number; actualizadas: number } {
  const validas = lineas.filter((l) => !l.error && (l.categoria_id || l.tipo))
  if (!validas.length) throw new ErrorDatos('No hay ninguna regla válida')
  let reglas = db.reglas
  let nuevas = 0
  let actualizadas = 0
  const creada = new Date().toISOString()
  for (const l of validas) {
    exigirSinIdentificativos('Regla', l.clave)
    const existente = reglas.find(
      (r) => r.origen === 'manual' && r.tipo_patron === l.modo && r.importe_min === null && r.importe_max === null && normalizarConcepto(r.patron) === l.clave,
    )
    if (existente) {
      if (existente.categoria_id !== l.categoria_id || existente.tipo_movimiento !== l.tipo || !existente.activa) {
        reglas = reglas.map((r) => (r.id === existente.id ? { ...r, categoria_id: l.categoria_id, tipo_movimiento: l.tipo, activa: true } : r))
        actualizadas++
      }
      continue
    }
    const nueva: Regla = {
      id: nuevoId(),
      nombre: 'Importada',
      patron: l.clave,
      tipo_patron: l.modo,
      cuenta_id: null,
      importe_min: null,
      importe_max: null,
      categoria_id: l.categoria_id,
      tipo_movimiento: l.tipo,
      es_sugerencia: false,
      // El comercio exacto manda sobre una palabra clave
      prioridad: l.modo === 'exacto' ? 50 : 60,
      origen: 'manual',
      activa: true,
      confirmaciones: 0,
      descartes: 0,
      mes_siguiente: false,
      created_at: creada,
    }
    reglas = [...reglas, nueva]
    nuevas++
  }
  return { db: { ...db, reglas }, nuevas, actualizadas }
}
