/**
 * Copias de seguridad y paso de datos entre dispositivos.
 *
 * - Copia diaria automática en el dispositivo (IndexedDB "puchifin-copias"), al abrir la app: 7 últimas.
 * - Copia manual y copias automáticas antes de restaurar o importar, que no se borran solas (10 últimas).
 * - Exportar: archivo JSON con todos los datos, para guardarlo en Archivos o iCloud Drive y cargarlo
 *   en otro dispositivo. Importar sustituye todo por el contenido del archivo, exactamente igual.
 */
import { esperarGuardado, obtenerDatos, reemplazarDatos } from '../datos/almacen'
import { crearArchivo, leerArchivo, resumenArchivo, serializar, validarArchivo, type ArchivoPuchiFin } from '../datos/archivo'
import { compartirArchivo, type ResultadoCompartir } from './compartir'
import { hoyIso } from './fechas'
import { registrar } from './registro'

export type TipoCopia = 'diaria' | 'manual' | 'antes de restaurar' | 'antes de importar'

export interface MetaCopia {
  clave: string
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
const CLAVE_ULTIMA_EXPORTACION = 'puchifin-ultima-exportacion'
const CLAVE_SALTAR = 'puchifin-copia-saltar'

const oyentes = new Set<() => void>()
export function suscribirCopias(f: () => void): () => void {
  oyentes.add(f)
  return () => oyentes.delete(f)
}
const avisarCambio = () => oyentes.forEach((f) => f())

export function metaDe(archivo: ArchivoPuchiFin, tipo: TipoCopia, creada = new Date().toISOString()): MetaCopia {
  return {
    clave: tipo === 'diaria' ? `${creada.slice(0, 10)}#diaria` : `${creada}#${tipo}`,
    tipo,
    creada,
    dia: creada.slice(0, 10),
    version: archivo.version_app,
    ...resumenArchivo(archivo),
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
// IndexedDB: 'copias' guarda el archivo completo y 'meta' un resumen para listarlas sin leerlas
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

export async function listarCopias(): Promise<MetaCopia[]> {
  const todas = ((await transaccion('readonly', (_c, meta) => meta.getAll())) ?? []) as MetaCopia[]
  return todas.sort((a, b) => b.creada.localeCompare(a.creada))
}

export async function leerCopia(clave: string): Promise<ArchivoPuchiFin | undefined> {
  const r = (await transaccion('readonly', (copias) => copias.get(clave))) as { clave: string; archivo: ArchivoPuchiFin } | undefined
  return r?.archivo
}

export async function borrarCopia(clave: string): Promise<void> {
  await transaccion('readwrite', (copias, meta) => {
    copias.delete(clave)
    meta.delete(clave)
  })
  registrar('info', 'Copia local borrada', clave)
  avisarCambio()
}

export async function borrarTodasLasCopias(): Promise<number> {
  const lista = await listarCopias()
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

/** Guarda una copia de los datos actuales en el dispositivo */
export async function hacerCopia(tipo: TipoCopia): Promise<MetaCopia> {
  await esperarGuardado()
  const archivo = crearArchivo(structuredClone(obtenerDatos()))
  const m = metaDe(archivo, tipo)
  await transaccion('readwrite', (copias, meta) => {
    copias.put({ clave: m.clave, archivo })
    meta.put(m)
  })
  const sobran = copiasSobrantes(await listarCopias())
  if (sobran.length) {
    await transaccion('readwrite', (copias, meta) => {
      for (const c of sobran) {
        copias.delete(c)
        meta.delete(c)
      }
    })
  }
  registrar('info', `Copia ${tipo} guardada en el dispositivo`, { movimientos: m.movimientos, categorias: m.categorias })
  avisarCambio()
  return m
}

/** Copia diaria: una al día, al abrir la app. Si se borró a mano la de hoy, no se repite hasta mañana */
export async function copiaDiaria(): Promise<MetaCopia | null> {
  try {
    if (localStorage.getItem(CLAVE_SALTAR) === hoyIso()) return null
    const hoy = new Date().toISOString().slice(0, 10)
    if ((await listarCopias()).some((m) => m.tipo === 'diaria' && m.dia === hoy)) return null
    return await hacerCopia('diaria')
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

/** Sustituye todos los datos por los del archivo. Antes guarda una copia del estado actual */
export async function restaurar(archivo: ArchivoPuchiFin, tipo: 'antes de restaurar' | 'antes de importar'): Promise<void> {
  const valido = validarArchivo(archivo)
  await hacerCopia(tipo)
  await reemplazarDatos(valido.datos)
  registrar('info', tipo === 'antes de importar' ? 'Archivo importado' : 'Copia restaurada', resumenArchivo(valido))
}

// ---------------------------------------------------------------------------
// Exportar e importar archivo
// ---------------------------------------------------------------------------

export function nombreArchivoExportacion(fecha = hoyIso()): string {
  return `PuchiFin ${fecha}.json`
}

export async function exportarArchivo(archivo?: ArchivoPuchiFin): Promise<ResultadoCompartir> {
  await esperarGuardado()
  const texto = archivo ? JSON.stringify(archivo, null, 1) : serializar(obtenerDatos())
  const r = await compartirArchivo(new Blob([texto], { type: 'application/json' }), nombreArchivoExportacion(), 'Datos de PuchiFin')
  if (r !== 'cancelado' && !archivo) {
    try {
      localStorage.setItem(CLAVE_ULTIMA_EXPORTACION, new Date().toISOString())
    } catch {
      // sin almacenamiento
    }
    avisarCambio()
  }
  registrar('info', `Exportación: ${r}`, archivo ? resumenArchivo(archivo) : { movimientos: obtenerDatos().movimientos.length })
  return r
}

export function ultimaExportacion(): string | null {
  try {
    return localStorage.getItem(CLAVE_ULTIMA_EXPORTACION)
  } catch {
    return null
  }
}

export async function leerArchivoDeUsuario(archivo: File): Promise<ArchivoPuchiFin> {
  return leerArchivo(await archivo.text())
}
