/**
 * Categorizar rápido lo pendiente (pensado para la primera carga, con cientos de movimientos sin
 * categoría): los pendientes se agrupan por comercio y cada grupo trae una categoría sugerida por
 * parecido con lo ya categorizado. Nada se aplica sin que el usuario lo confirme.
 */
import { esPendiente } from '../importacion/pendientes'
import { categoriasAprendidas, clasificar } from '../importacion/reglas'
import { claveComercio, claveConImporte, esPasarela, nombrePasarela, normalizarConcepto, primeraPalabra } from '../lib/conceptos'
import { formatearImporte } from '../lib/formato'
import type { BaseDatos, Movimiento } from '../lib/tipos'

/** Palabras que no distinguen un comercio de otro */
const VACIAS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'en', 'con', 'por', 'para', 'sl', 'sa', 'slu', 'cb', 'pago', 'compra', 'recibo', 'transferencia', 'bizum', 'enviado', 'recibido', 'adeudo', 'cargo', 'tarjeta', 'cuenta'])

const palabras = (clave: string) => new Set(clave.split(' ').filter((p) => p.length >= 3 && !VACIAS.has(p)))
const claveBase = (m: Movimiento) => claveComercio(m.concepto_limpio) || m.concepto_normalizado
/** Clave del comercio; en PayPal, con el importe (cada importe es un grupo) */
const claveDe = (m: Movimiento) => claveConImporte(claveBase(m), m.importe)
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
  const pasarela = esPasarela(clave)
  for (const r of referencia) {
    // En PayPal solo vale el mismo importe ya categorizado
    if (pasarela && r.clave !== clave) continue
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
      const base = claveBase(ordenados[0])
      return {
        clave,
        signo,
        nombre: esPasarela(base) ? `${nombrePasarela(base)} de ${formatearImporte(Math.abs(ordenados[0].importe))}` : ordenados[0].concepto_limpio,
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
  const primeras = new Set(elegidos.filter((m) => !esPasarela(claveDe(m))).map((m) => primeraPalabra(claveDe(m))).filter((p): p is string => !!p))
  const signos = new Set(elegidos.map(signoDe))
  const res: Similares = { mismoComercio: [], parecidos: [], yaCategorizados: [] }
  for (const m of db.movimientos) {
    if (set.has(m.id) || !signos.has(signoDe(m))) continue
    const k = claveDe(m)
    if (claves.has(k)) {
      if (esPendiente(m)) res.mismoComercio.push(m)
      else if (m.tipo === 'normal' && m.categoria_id !== categoria) res.yaCategorizados.push(m)
    } else if (esPendiente(m) && !esPasarela(k)) {
      const p = primeraPalabra(k)
      if (p && primeras.has(p)) res.parecidos.push(m)
    }
  }
  return res
}

export interface PropuestaCambio {
  clave: string
  nombre: string
  desde: string
  hacia: string
  movimientos: Movimiento[]
}

/**
 * Mejoras para lo ya categorizado por la app: movimientos que categorizó una regla y que las reglas
 * de ahora (o lo que el usuario ha corregido después en el mismo comercio) llevarían a otra categoría.
 * Lo categorizado a mano nunca se propone. Se agrupan por comercio y cambio.
 */
export function propuestasRecategorizacion(db: BaseDatos): PropuestaCambio[] {
  const aprendidas = categoriasAprendidas(db)
  const grupos = new Map<string, PropuestaCambio>()
  for (const m of db.movimientos) {
    if (m.tipo !== 'normal' || !m.categoria_id || m.origen_categoria !== 'regla') continue
    const c = clasificar({ texto: normalizarConcepto(m.concepto_original), clave: claveDe(m), cuenta_id: m.cuenta_id, importe: m.importe }, db.reglas, aprendidas)
    if (c.tipo !== 'normal' || !c.categoria_id || c.categoria_id === m.categoria_id) continue
    const k = `${claveDe(m)}|${m.categoria_id}|${c.categoria_id}`
    const g = grupos.get(k) ?? { clave: claveDe(m), nombre: m.concepto_limpio, desde: m.categoria_id, hacia: c.categoria_id, movimientos: [] }
    g.movimientos.push(m)
    grupos.set(k, g)
  }
  return [...grupos.values()].sort((a, b) => b.movimientos.length - a.movimientos.length)
}

// ---------------------------------------------------------------------------
// PayPal: cargos de cosas muy distintas, repartidos por importe
// ---------------------------------------------------------------------------

/** Cargo de PayPal por revisar: sin categoría o con la que puso una regla (no una decisión tuya) */
export const pasarelaPorRevisar = (m: Movimiento) => m.tipo === 'normal' && (!m.categoria_id || m.origen_categoria === 'regla')

export interface GrupoPasarela {
  clave: string
  nombre: string
  signo: 'gasto' | 'ingreso'
  /** Importe de cada cargo, en positivo */
  importe: number
  /** Del más reciente al más antiguo */
  movimientos: Movimiento[]
  porRevisar: Movimiento[]
  /** Categoría que ya elegiste para este importe (la más reciente), para proponerla */
  sugerencia: string | null
}

/** Cargos de PayPal (y otras pasarelas) agrupados por importe: primero lo que hay que revisar */
export function gruposPasarela(db: BaseDatos): GrupoPasarela[] {
  const grupos = new Map<string, Movimiento[]>()
  for (const m of db.movimientos) {
    if (m.tipo !== 'normal' || !esPasarela(claveBase(m))) continue
    const k = `${signoDe(m)}|${claveDe(m)}`
    grupos.set(k, [...(grupos.get(k) ?? []), m])
  }
  const aprendidas = categoriasAprendidas(db)
  return [...grupos]
    .map(([k, movs]) => {
      const ordenados = [...movs].sort((a, b) => b.fecha_operacion.localeCompare(a.fecha_operacion))
      const base = claveBase(ordenados[0])
      const clave = k.slice(k.indexOf('|') + 1)
      return {
        clave,
        nombre: nombrePasarela(base),
        signo: signoDe(ordenados[0]),
        importe: Math.abs(ordenados[0].importe),
        movimientos: ordenados,
        porRevisar: ordenados.filter(pasarelaPorRevisar),
        sugerencia: aprendidas.porClave.get(clave) ?? null,
      }
    })
    .sort((a, b) => Number(!b.porRevisar.length) - Number(!a.porRevisar.length) || b.movimientos.length - a.movimientos.length || b.importe - a.importe)
}

/** Categorías típicas de un pago con PayPal, para los chips cuando aún no hay historial */
const TIPICAS_PASARELA = ['Ocio > Juegos', 'Suscripciones > Otras plataformas', 'Compras > Tecnología', 'Compras > Hogar', 'Compras > Ropa', 'Compras > Regalos']

/** Chips de PayPal: las últimas elegidas, las que ya usaste en PayPal y las típicas */
export function categoriasPasarela(db: BaseDatos, recientes: string[] = [], max = 6): string[] {
  const usos = new Map<string, number>()
  for (const m of db.movimientos) {
    if (!m.categoria_id || m.origen_categoria === 'regla' || !esPasarela(claveBase(m))) continue
    usos.set(m.categoria_id, (usos.get(m.categoria_id) ?? 0) + 1)
  }
  const ruta = (r: string) => {
    const [p, h] = r.split(' > ')
    const padre = db.categorias.find((c) => !c.padre_id && c.nombre === p)
    return db.categorias.find((c) => c.padre_id === padre?.id && c.nombre === h)?.id
  }
  const tipicas = TIPICAS_PASARELA.map(ruta).filter((x): x is string => !!x)
  const activa = (id: string) => db.categorias.some((c) => c.id === id && c.activa && c.naturaleza === 'gasto')
  return [...new Set([...recientes, ...[...usos].sort((a, b) => b[1] - a[1]).map(([id]) => id), ...tipicas])].filter(activa).slice(0, max)
}
