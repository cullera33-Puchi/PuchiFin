/**
 * Copias de seguridad.
 *
 * - Copia diaria automática en el dispositivo (IndexedDB), al abrir la app: se guardan las 7 últimas.
 * - Copia manual y copia previa a cada restauración, que no se borran solas.
 * - Exportar a archivo JSON (hoja de compartir o descarga) e importar desde archivo.
 * - Restaurar sustituye todos los datos en Supabase en una sola transacción (restaurar_copia).
 *
 * Las copias contienen lo mismo que Supabase: datos ya anonimizados, sin números de cuenta.
 */
import { compartirArchivo, type ResultadoCompartir } from './compartir'
import { contieneIdentificativo } from './identificativos'
import { hoyIso } from './fechas'
import { registrar } from './registro'
import { mensajeError, supabase } from './supabase'
import { APP_VERSION } from './version'

export type TipoCopia = 'diaria' | 'manual' | 'antes de restaurar' | 'antes de importar'

export interface Copia {
  app: 'puchifin'
  esquema: number
  exportado: string
  version_app?: string
  datos: Record<string, Record<string, unknown>[]>
}

export interface MetaCopia {
  clave: string
  usuario: string
  tipo: TipoCopia
  creada: string
  dia: string
  version: string
  movimientos: number
  cuentas: number
  categorias: number
}

export const MAX_DIARIAS = 7
export const MAX_OTRAS = 10
const BASE = 'puchifin-copias'

// Avisa a la pantalla de Herramientas cuando cambian las copias (por ejemplo, al terminar la diaria)
const oyentes = new Set<() => void>()
export function suscribirCopias(f: () => void): () => void {
  oyentes.add(f)
  return () => oyentes.delete(f)
}
const avisarCambio = () => oyentes.forEach((f) => f())

/** Comprueba que un JSON es una copia de PuchiFin. Devuelve el motivo si no lo es */
export function validarCopia(json: unknown): string | null {
  if (!json || typeof json !== 'object') return 'El archivo no es una copia de PuchiFin'
  const c = json as Partial<Copia>
  if (c.app !== 'puchifin' || !c.datos || typeof c.datos !== 'object') return 'El archivo no es una copia de PuchiFin'
  for (const [tabla, filas] of Object.entries(c.datos)) {
    if (!Array.isArray(filas)) return `Copia dañada: ${tabla} no es una lista`
  }
  // Última comprobación antes de enviar nada a Supabase (regla 3)
  if (contieneIdentificativo(JSON.stringify(c.datos))) return 'La copia contiene un número de cuenta, tarjeta, IBAN o DNI. No se restaura'
  return null
}

export function metaDe(copia: Copia, usuario: string, tipo: TipoCopia, creada = new Date().toISOString()): MetaCopia {
  const n = (t: string) => copia.datos[t]?.length ?? 0
  return {
    clave: tipo === 'diaria' ? `${creada.slice(0, 10)}#diaria` : `${creada}#${tipo}`,
    usuario,
    tipo,
    creada,
    dia: creada.slice(0, 10),
    version: copia.version_app ?? '?',
    movimientos: n('movimientos'),
    cuentas: n('cuentas'),
    categorias: n('categorias'),
  }
}

/** Qué copias sobran: más de 7 diarias o más de 10 del resto, de las más antiguas */
export function copiasSobrantes(lista: MetaCopia[]): string[] {
  const orden = [...lista].sort((a, b) => b.creada.localeCompare(a.creada))
  const diarias = orden.filter((m) => m.tipo === 'diaria').slice(MAX_DIARIAS)
  const otras = orden.filter((m) => m.tipo !== 'diaria').slice(MAX_OTRAS)
  return [...diarias, ...otras].map((m) => m.clave)
}

// ---------------------------------------------------------------------------
// IndexedDB: 'copias' guarda la copia completa y 'meta' un resumen para listarlas sin leerlas
// ---------------------------------------------------------------------------

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolver, rechazar) => {
    const r = indexedDB.open(BASE, 1)
    r.onupgradeneeded = () => {
      r.result.createObjectStore('copias', { keyPath: 'clave' })
      r.result.createObjectStore('meta', { keyPath: 'clave' })
    }
    r.onsuccess = () => resolver(r.result)
    r.onerror = () => rechazar(r.error)
  })
}

async function transaccion<T>(modo: IDBTransactionMode, fn: (copias: IDBObjectStore, meta: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await abrir()
  return new Promise((resolver, rechazar) => {
    const tx = db.transaction(['copias', 'meta'], modo)
    const peticion = fn(tx.objectStore('copias'), tx.objectStore('meta'))
    tx.oncomplete = () => {
      db.close()
      resolver(peticion ? peticion.result : undefined)
    }
    tx.onerror = () => {
      db.close()
      rechazar(tx.error)
    }
  })
}

export async function listarCopias(usuario: string): Promise<MetaCopia[]> {
  const todas = ((await transaccion('readonly', (_c, meta) => meta.getAll())) ?? []) as MetaCopia[]
  return todas.filter((m) => m.usuario === usuario).sort((a, b) => b.creada.localeCompare(a.creada))
}

export async function leerCopia(clave: string): Promise<Copia | undefined> {
  const r = (await transaccion('readonly', (copias) => copias.get(clave))) as { clave: string; copia: Copia } | undefined
  return r?.copia
}

export async function borrarCopia(clave: string): Promise<void> {
  await transaccion('readwrite', (copias, meta) => {
    copias.delete(clave)
    meta.delete(clave)
  })
  registrar('info', 'Copia local borrada', clave)
  avisarCambio()
}

export async function borrarTodasLasCopias(usuario: string): Promise<number> {
  const lista = await listarCopias(usuario)
  await transaccion('readwrite', (copias, meta) => {
    for (const m of lista) {
      copias.delete(m.clave)
      meta.delete(m.clave)
    }
  })
  registrar('info', 'Copias locales borradas', { n: lista.length })
  avisarCambio()
  return lista.length
}

async function guardarEnDispositivo(copia: Copia, usuario: string, tipo: TipoCopia): Promise<MetaCopia> {
  const m = metaDe(copia, usuario, tipo)
  await transaccion('readwrite', (copias, meta) => {
    copias.put({ clave: m.clave, copia })
    meta.put(m)
  })
  const sobran = copiasSobrantes(await listarCopias(usuario))
  if (sobran.length) {
    await transaccion('readwrite', (copias, meta) => {
      for (const c of sobran) {
        copias.delete(c)
        meta.delete(c)
      }
    })
  }
  avisarCambio()
  return m
}

// ---------------------------------------------------------------------------
// Supabase
// ---------------------------------------------------------------------------

export async function exportarCopia(): Promise<Copia> {
  const { data, error } = await supabase.rpc('exportar_copia')
  if (error) throw new Error(mensajeError(error))
  return { ...(data as Copia), version_app: APP_VERSION }
}

export async function hacerCopia(usuario: string, tipo: TipoCopia): Promise<MetaCopia> {
  const copia = await exportarCopia()
  const m = await guardarEnDispositivo(copia, usuario, tipo)
  registrar('info', `Copia ${tipo} guardada en el dispositivo`, { movimientos: m.movimientos, categorias: m.categorias })
  return m
}

const CLAVE_SALTAR = 'puchifin-copia-saltar'

/** Copia diaria: una al día, al abrir la app. Si se borró a mano la de hoy, no se repite hasta mañana */
export async function copiaDiaria(usuario: string): Promise<MetaCopia | null> {
  try {
    const hoy = hoyIso()
    if (localStorage.getItem(CLAVE_SALTAR) === hoy) return null
    const lista = await listarCopias(usuario)
    if (lista.some((m) => m.tipo === 'diaria' && m.dia === new Date().toISOString().slice(0, 10))) return null
    return await hacerCopia(usuario, 'diaria')
  } catch (e) {
    registrar('error', `Copia diaria fallida: ${(e as Error).message ?? e}`)
    return null
  }
}

export function saltarCopiaDeHoy(): void {
  try {
    localStorage.setItem(CLAVE_SALTAR, hoyIso())
  } catch {
    // sin almacenamiento
  }
}

/** Restaura una copia: antes guarda una copia del estado actual en el dispositivo */
export async function restaurarCopia(copia: Copia, usuario: string): Promise<Record<string, number>> {
  const motivo = validarCopia(copia)
  if (motivo) throw new Error(motivo)
  await hacerCopia(usuario, 'antes de restaurar')
  const { data, error } = await supabase.rpc('restaurar_copia', { copia })
  if (error) {
    registrar('error', `Restaurar copia falló: ${mensajeError(error)}`)
    throw new Error(mensajeError(error))
  }
  registrar('info', 'Copia restaurada', data)
  return data as Record<string, number>
}

export async function exportarArchivo(copia?: Copia): Promise<ResultadoCompartir> {
  const c = copia ?? (await exportarCopia())
  const blob = new Blob([JSON.stringify(c, null, 2)], { type: 'application/json' })
  return compartirArchivo(blob, `puchifin-copia-${hoyIso()}.json`, 'Copia de PuchiFin')
}

export async function leerArchivo(archivo: File): Promise<Copia> {
  const texto = await archivo.text()
  let json: unknown
  try {
    json = JSON.parse(texto)
  } catch {
    throw new Error('El archivo no es un JSON válido')
  }
  const motivo = validarCopia(json)
  if (motivo) throw new Error(motivo)
  return json as Copia
}
