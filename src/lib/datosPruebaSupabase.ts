/** Alta y borrado de los datos de prueba en Supabase (la generación está en datosPrueba.ts) */
import { generarDatosPrueba } from './datosPrueba'
import { hoyIso } from './fechas'
import { registrar } from './registro'
import { mensajeError, supabase } from './supabase'
import type { Categoria, Cuenta } from './tipos'

const TROZO = 400

async function insertarPorTrozos(tabla: string, filas: object[]) {
  for (let i = 0; i < filas.length; i += TROZO) {
    const { error } = await supabase.from(tabla).insert(filas.slice(i, i + TROZO))
    if (error) throw new Error(mensajeError(error))
  }
}

export async function contarDatosPrueba(): Promise<number> {
  const { data, error } = await supabase.from('importaciones').select('movimientos_nuevos').eq('origen', 'datos_prueba')
  if (error) throw new Error(mensajeError(error))
  return (data ?? []).reduce((s, i) => s + (i.movimientos_nuevos as number), 0)
}

export async function crearDatosPrueba(): Promise<number> {
  if ((await contarDatosPrueba()) > 0) throw new Error('Ya hay datos de prueba. Elimínalos antes de generar otros')
  const [cuentas, categorias, ajustes] = await Promise.all([
    supabase.from('cuentas').select('*'),
    supabase.from('categorias').select('*'),
    supabase.from('ajustes').select('fecha_inicio').single(),
  ])
  const error = cuentas.error ?? categorias.error ?? ajustes.error
  if (error) throw new Error(mensajeError(error))

  const datos = generarDatosPrueba({
    cuentas: cuentas.data as Cuenta[],
    categorias: categorias.data as Categoria[],
    desde: (ajustes.data?.fecha_inicio as string | undefined) ?? '2026-10-01',
    hasta: hoyIso(),
    nuevoId: () => crypto.randomUUID(),
  })
  try {
    await insertarPorTrozos('importaciones', datos.importaciones)
    await insertarPorTrozos('movimientos', datos.movimientos)
    await insertarPorTrozos('conciliaciones', datos.conciliaciones)
  } catch (e) {
    // Si algo falla a medias, se deshace lo creado
    await supabase.from('importaciones').delete().eq('origen', 'datos_prueba')
    registrar('error', `Datos de prueba: alta fallida y deshecha: ${(e as Error).message}`)
    throw e
  }
  registrar('info', 'Datos de prueba generados', {
    movimientos: datos.movimientos.length,
    conciliaciones: datos.conciliaciones.length,
    cuentas: datos.importaciones.length,
  })
  return datos.movimientos.length
}

export async function borrarDatosPrueba(): Promise<number> {
  const n = await contarDatosPrueba()
  const { error } = await supabase.from('importaciones').delete().eq('origen', 'datos_prueba')
  if (error) throw new Error(mensajeError(error))
  registrar('info', 'Datos de prueba eliminados', { movimientos: n })
  return n
}
