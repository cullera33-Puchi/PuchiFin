/**
 * Almacén de datos en el dispositivo.
 *
 * La base de datos completa vive en memoria y se guarda en IndexedDB (base "puchifin", un único
 * registro). Cada cambio pasa por cambiar(), que aplica una operación pura, avisa a la interfaz y
 * guarda enseguida. Nada sale del dispositivo: para llevar los datos a otro, se exporta un archivo.
 */
import { registrar, sanearDescripcion } from '../lib/registro'
import { VERSION_ESQUEMA, type BaseDatos } from '../lib/tipos'
import { migrar } from './archivo'
import { ErrorDatos, comprobarBaseDatos, datosIniciales } from './operaciones'

const BASE = 'puchifin'
const ALMACEN = 'estado'
const CLAVE = 'datos'

let actual: BaseDatos | null = null
const oyentes = new Set<() => void>()
let cola: Promise<void> = Promise.resolve()

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolver, rechazar) => {
    const r = indexedDB.open(BASE, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(ALMACEN)
    r.onsuccess = () => resolver(r.result)
    r.onerror = () => rechazar(r.error)
  })
}

async function leerDisco(): Promise<unknown> {
  const db = await abrir()
  return new Promise((resolver, rechazar) => {
    const r = db.transaction(ALMACEN, 'readonly').objectStore(ALMACEN).get(CLAVE)
    r.onsuccess = () => {
      db.close()
      resolver(r.result)
    }
    r.onerror = () => {
      db.close()
      rechazar(r.error)
    }
  })
}

async function escribirDisco(datos: BaseDatos): Promise<void> {
  const db = await abrir()
  return new Promise((resolver, rechazar) => {
    const tx = db.transaction(ALMACEN, 'readwrite')
    tx.objectStore(ALMACEN).put(datos, CLAVE)
    tx.oncomplete = () => {
      db.close()
      resolver()
    }
    tx.onerror = () => {
      db.close()
      rechazar(tx.error)
    }
    // Un aborto sin error (por ejemplo, sin espacio al confirmar) también termina la espera
    tx.onabort = () => {
      db.close()
      rechazar(tx.error ?? new Error('Transacción abortada'))
    }
  })
}

/**
 * Guarda en orden: cada escritura espera a la anterior. Un fallo no bloquea las siguientes (v0.34.0: antes,
 * la cola quedaba rechazada para siempre y nada más se guardaba hasta cerrar la app)
 */
function guardar(datos: BaseDatos): Promise<void> {
  const esta = cola
    .catch(() => {})
    .then(() => escribirDisco(datos))
  cola = esta.catch((e) => {
    registrar('error', `No se pudieron guardar los datos: ${(e as Error)?.message ?? e}`)
  })
  return esta
}

/**
 * Carga los datos del dispositivo. En el primer arranque crea los datos iniciales.
 * Pide al navegador que no borre el almacenamiento (en el iPhone, instalada en la pantalla de inicio).
 */
export async function iniciarAlmacen(): Promise<BaseDatos> {
  const guardado = await leerDisco()
  if (guardado) {
    actual = migrar(guardado as Partial<BaseDatos>)
    // Si el esquema era anterior, se guarda ya adaptado
    if (((guardado as Partial<BaseDatos>).esquema ?? 1) < VERSION_ESQUEMA) {
      await guardar(actual)
      registrar('info', `Datos adaptados al esquema ${VERSION_ESQUEMA}`)
    }
    registrar('info', 'Datos cargados del dispositivo', { movimientos: actual.movimientos.length, cuentas: actual.cuentas.length })
    // Lo guardado ya pasó las comprobaciones al escribirse; si algo no cuadra, se avisa sin bloquear la app
    const problemas = comprobarBaseDatos(actual)
    if (problemas.length) registrar('aviso', `Comprobación de los datos: ${problemas.length} problemas`, problemas.slice(0, 5))
  } else {
    actual = datosIniciales()
    await guardar(actual)
    registrar('info', 'Primer arranque: catálogo, cuentas y ajustes creados en el dispositivo')
  }
  try {
    const persistente = await navigator.storage?.persist?.()
    registrar('info', `Almacenamiento persistente: ${persistente ? 'sí' : 'no'}`)
  } catch {
    // no disponible
  }
  oyentes.forEach((f) => f())
  return actual
}

export function obtenerDatos(): BaseDatos {
  if (!actual) throw new Error('Almacén sin iniciar')
  return actual
}

export function suscribirDatos(f: () => void): () => void {
  oyentes.add(f)
  return () => oyentes.delete(f)
}

/**
 * Aplica una operación (función pura) y la guarda. Si la operación lanza ErrorDatos, no cambia nada
 * y el error llega a quien llama, para mostrarlo.
 */
export async function cambiar(operacion: (db: BaseDatos) => BaseDatos, descripcion?: string): Promise<void> {
  const nuevo = operacion(obtenerDatos())
  actual = nuevo
  oyentes.forEach((f) => f())
  await guardar(nuevo)
  if (descripcion) registrar('info', sanearDescripcion(descripcion))
}

/** Sustituye todos los datos (importar un archivo o restaurar una copia) */
export async function reemplazarDatos(datos: BaseDatos): Promise<void> {
  if (!datos) throw new ErrorDatos('Sin datos')
  actual = datos
  oyentes.forEach((f) => f())
  await guardar(datos)
}

/** Espera a que terminen las escrituras pendientes */
export function esperarGuardado(): Promise<void> {
  return cola.catch(() => undefined)
}

/** Solo para pruebas: vuelve al estado sin iniciar */
export function reiniciarParaPruebas(): void {
  actual = null
  oyentes.clear()
}
