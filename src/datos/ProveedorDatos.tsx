import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { copiaDiaria } from '../lib/copias'
import { registrar } from '../lib/registro'
import type { BaseDatos } from '../lib/tipos'
import { cambiar, iniciarAlmacen, obtenerDatos, suscribirDatos } from './almacen'
import { ErrorDatos } from './operaciones'

/** Carga los datos del dispositivo antes de mostrar la app y hace la copia diaria */
export function ProveedorDatos({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'error'>('cargando')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    iniciarAlmacen().then(
      () => {
        setEstado('listo')
        copiaDiaria()
      },
      (e) => {
        registrar('error', `No se pudieron cargar los datos: ${(e as Error)?.message ?? e}`)
        setError((e as Error)?.message ?? String(e))
        setEstado('error')
      },
    )
  }, [])

  if (estado === 'cargando') return <div className="grid min-h-dvh place-items-center text-sm text-zinc-500">Cargando…</div>
  if (estado === 'error') {
    return (
      <div className="mx-auto grid min-h-dvh max-w-md place-items-center p-6">
        <div className="tarjeta space-y-2 text-sm">
          <p className="font-semibold">No se han podido abrir los datos del iPhone</p>
          <p className="text-zinc-600 dark:text-zinc-400">{error}</p>
          <p className="text-zinc-600 dark:text-zinc-400">Cierra la app y vuelve a abrirla. Si sigue igual, el registro de errores tiene el detalle.</p>
        </div>
      </div>
    )
  }
  return <>{children}</>
}

/** Datos actuales; la pantalla se actualiza con cada cambio */
// oxlint-disable-next-line react/only-export-components
export function useDatos(): BaseDatos {
  return useSyncExternalStore(suscribirDatos, obtenerDatos)
}

/** Aplica una operación y devuelve el mensaje de error, o null si ha ido bien */
// oxlint-disable-next-line react/only-export-components
export async function intentar(operacion: (db: BaseDatos) => BaseDatos, descripcion?: string): Promise<string | null> {
  try {
    await cambiar(operacion, descripcion)
    return null
  } catch (e) {
    if (e instanceof ErrorDatos) return e.message
    registrar('error', `Operación fallida: ${(e as Error)?.message ?? e}`)
    return 'No se ha podido guardar. Mira el registro en Ajustes, Herramientas.'
  }
}

/**
 * Como intentar, y además devuelve cómo deshacerlo: vuelve al estado anterior si no ha habido otros
 * cambios entre medias (si los hay, no toca nada y lo anota en el registro).
 */
// oxlint-disable-next-line react/only-export-components
export async function intentarDeshacible(
  operacion: (db: BaseDatos) => BaseDatos,
  descripcion?: string,
): Promise<{ error: string | null; deshacer: () => Promise<boolean> }> {
  const antes = obtenerDatos()
  const error = await intentar(operacion, descripcion)
  const despues = obtenerDatos()
  return {
    error,
    deshacer: async () => {
      if (error || obtenerDatos() !== despues) {
        registrar('aviso', 'Deshacer omitido: hubo cambios posteriores')
        return false
      }
      await cambiar(() => antes, `Deshecho: ${descripcion ?? 'cambio'}`)
      return true
    },
  }
}
