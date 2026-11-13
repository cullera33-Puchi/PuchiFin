/**
 * Categorizar rápido lo pendiente (pensado para la primera carga, con cientos de movimientos sin
 * categoría): los pendientes se agrupan por comercio y cada grupo trae una categoría sugerida por
 * parecido con lo ya categorizado. Nada se aplica sin que el usuario lo confirme.
 */
import { esPendiente } from '../importacion/pendientes'
import { categoriasAprendidas, clasificar } from '../importacion/reglas'
import { claveComercio, normalizarConcepto, primeraPalabra } from '../lib/conceptos'
import type { BaseDatos, Movimiento } from '../lib/tipos'

/** Palabras que no distinguen un comercio de otro */
const VACIAS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'en', 'con', 'por', 'para', 'sl', 'sa', 'slu', 'cb', 'pago', 'compra', 'recibo', 'transferencia', 'bizum', 'enviado', 'recibido', 'adeudo', 'cargo', 'tarjeta', 'cuenta'])

const palabras = (clave: string) => new Set(clave.split(' ').filter((p) => p.length >= 3 && !VACIAS.has(p)))
const claveDe = (m: Movimiento) => claveComercio(m.concepto_limpio) || m.concepto_normalizado
const signoDe = (m: Movimiento): 'gasto' | 'ingreso' => (m.importe < 0 ? 'gasto' : 'ingreso')

export interface SugerenciaCategoria {
  categoria_id: string
  /** De 0 a 1 */
  confianza: number
  /** Comercio ya categorizado en el que se basa */
  parecido: string
}

export interface GrupoPendiente {
  clave: string
  signo: 'gasto' | 'ingreso'
  /** Nombre para mostrar: el concepto limpio más reciente */
  nombre: string
  movimientos: Movimiento[]
  total: number
  sugerencia: SugerenciaCategoria | null
}

/** Referencia de lo ya categorizado: por comercio, la categoría más usada */
function categorizados(db: BaseDatos): { clave: string; signo: 'gasto' | 'ingreso'; categoria_id: string; nombre: string; palabras: Set<string> }[] {
  const cuenta = new Map<string, { n: Map<string, number>; nombre: string; signo: 'gasto' | 'ingreso' }>()
  for (const m of db.movimientos) {
    if (!m.categoria_id || m.tipo !== 'normal') continue
    const k = `${signoDe(m)}|${claveDe(m)}`
    const e = cuenta.get(k) ?? { n: new Map(), nombre: m.concepto_limpio, signo: signoDe(m) }
    e.n.set(m.categoria_id, (e.n.get(m.categoria_id) ?? 0) + (m.origen_categoria === 'manual' ? 3 : 1))
    cuenta.set(k, e)
  }
  return [...cuenta].map(([k, e]) => {
    const clave = k.slice(k.indexOf('|') + 1)
    const categoria_id = [...e.n].sort((a, b) => b[1] - a[1])[0][0]
    return { clave, signo: e.signo, categoria_id, nombre: e.nombre, palabras: palabras(clave) }
  })
}

/** Categoría sugerida para un comercio por parecido con lo ya categorizado */
export function sugerirPorParecido(db: BaseDatos, clave: string, signo: 'gasto' | 'ingreso', referencia = categorizados(db)): SugerenciaCategoria | null {
  const naturaleza = new Map(db.categorias.map((c) => [c.id, c.naturaleza]))
  const propias = palabras(clave)
  const primera = primeraPalabra(clave)
  let mejor: SugerenciaCategoria | null = null
  for (const r of referencia) {
    if (r.signo !== signo && naturaleza.get(r.categoria_id) !== (signo === 'gasto' ? 'gasto' : 'ingreso')) continue
    let confianza = 0
    if (r.clave === clave) confianza = 1
    else {
      const comunes = [...propias].filter((p) => r.palabras.has(p)).length
      const union = new Set([...propias, ...r.palabras]).size
      confianza = union ? comunes / union : 0
      // Mismo comercio en otra población o con otra coletilla: «mercadona valencia» y «mercadona»
      if (primera && primera === primeraPalabra(r.clave)) confianza = Math.max(confianza, 0.8)
    }
    if (confianza >= 0.5 && (!mejor || confianza > mejor.confianza)) mejor = { categoria_id: r.categoria_id, confianza, parecido: r.nombre }
  }
  return mejor
}

/** Pendientes agrupados por comercio y signo, de los grupos con más movimientos a los de menos */
export function gruposPendientes(db: BaseDatos): GrupoPendiente[] {
  const grupos = new Map<string, Movimiento[]>()
  for (const m of db.movimientos) {
    if (!esPendiente(m)) continue
    const k = `${signoDe(m)}|${claveDe(m)}`
    grupos.set(k, [...(grupos.get(k) ?? []), m])
  }
  const referencia = categorizados(db)
  const aprendidas = categoriasAprendidas(db)
  // Sin parecido con lo categorizado, lo que digan las reglas (por si se añadieron después de importar)
  const porReglas = (m: Movimiento): SugerenciaCategoria | null => {
    const c = clasificar({ texto: normalizarConcepto(m.concepto_original), clave: claveDe(m), cuenta_id: m.cuenta_id, importe: m.importe }, db.reglas, aprendidas)
    return c.tipo === 'normal' && c.categoria_id ? { categoria_id: c.categoria_id, confianza: 0.85, parecido: 'regla de la app' } : null
  }
  return [...grupos]
    .map(([k, movs]) => {
      const signo = k.startsWith('gasto') ? ('gasto' as const) : ('ingreso' as const)
      const clave = k.slice(k.indexOf('|') + 1)
      const ordenados = [...movs].sort((a, b) => b.fecha_operacion.localeCompare(a.fecha_operacion))
      return {
        clave,
        signo,
        nombre: ordenados[0].concepto_limpio,
        movimientos: ordenados,
        total: Math.round(movs.reduce((s, m) => s + m.importe, 0) * 100) / 100,
        sugerencia: sugerirPorParecido(db, clave, signo, referencia) ?? porReglas(ordenados[0]),
      }
    })
    .sort((a, b) => b.movimientos.length - a.movimientos.length || Math.abs(b.total) - Math.abs(a.total))
}

/** Categorías para elegir con un toque: las últimas usadas y las más usadas, de la naturaleza del grupo */
export function categoriasRapidas(db: BaseDatos, signo: 'gasto' | 'ingreso', recientes: string[] = [], max = 4): string[] {
  const naturaleza = new Map(db.categorias.map((c) => [c.id, c.naturaleza]))
  const valida = (id: string) => naturaleza.get(id) === signo && db.categorias.some((c) => c.id === id && c.activa)
  const usos = new Map<string, number>()
  for (const m of db.movimientos) if (m.categoria_id && m.tipo === 'normal') usos.set(m.categoria_id, (usos.get(m.categoria_id) ?? 0) + 1)
  const masUsadas = [...usos].sort((a, b) => b[1] - a[1]).map(([id]) => id)
  return [...new Set([...recientes, ...masUsadas])].filter(valida).slice(0, max)
}

/** Grupos con una sugerencia muy clara (mismo comercio o la misma primera palabra) */
export const UMBRAL_SEGURA = 0.8

export interface Similares {
  /** Pendientes del mismo comercio */
  mismoComercio: Movimiento[]
  /** Pendientes de comercios que empiezan igual («mercadona valencia» y «mercadona castellon») */
  parecidos: Movimiento[]
  /** Del mismo comercio pero ya categorizados de otra forma: solo si el usuario lo pide */
  yaCategorizados: Movimiento[]
}

/** Movimientos que conviene categorizar a la vez que los elegidos */
export function similares(db: BaseDatos, ids: string[], categoria: string | null): Similares {
  const set = new Set(ids)
  const elegidos = db.movimientos.filter((m) => set.has(m.id))
  const claves = new Set(elegidos.map(claveDe).filter(Boolean))
  const primeras = new Set(elegidos.map((m) => primeraPalabra(claveDe(m))).filter((p): p is string => !!p))
  const signos = new Set(elegidos.map(signoDe))
  const res: Similares = { mismoComercio: [], parecidos: [], yaCategorizados: [] }
  for (const m of db.movimientos) {
    if (set.has(m.id) || !signos.has(signoDe(m))) continue
    const k = claveDe(m)
    if (claves.has(k)) {
      if (esPendiente(m)) res.mismoComercio.push(m)
      else if (m.tipo === 'normal' && m.categoria_id !== categoria) res.yaCategorizados.push(m)
    } else if (esPendiente(m)) {
      const p = primeraPalabra(k)
      if (p && primeras.has(p)) res.parecidos.push(m)
    }
  }
  return res
}
