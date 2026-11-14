import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { useInterfaz } from '../componentes/Interfaz'
import { actualizarLogica } from '../importacion/pendientes'
import { copiaDiaria, hacerCopia } from '../lib/copias'
import { plural } from '../lib/formato'
import { APP_VERSION } from '../lib/version'
import { registrar } from '../lib/registro'
import type { BaseDatos } from '../lib/tipos'
import { cambiar, iniciarAlmacen, obtenerDatos, suscribirDatos } from './almacen'
import { ErrorDatos } from './operaciones'

/** Carga los datos del dispositivo antes de mostrar la app y hace la copia diaria */
export function ProveedorDatos({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'error'>('cargando')
  const [error, setError] = useState<string | null>(null)
  const { avisar } = useInterfaz()

  useEffect(() => {
    iniciarAlmacen().then(
      async () => {
        setEstado('listo')
        await copiaDiaria()
        const aviso = await aplicarVersion()
        if (aviso) avisar(aviso)
      },
      (e) => {
        registrar('error', `No se pudieron cargar los datos: ${(e as Error)?.message ?? e}`)
        setError((e as Error)?.message ?? String(e))
        setEstado('error')
      },
    )
  }, [avisar])

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

/**
 * Una vez por versión: pone al día las reglas de la app y aplica las mejoras a lo pendiente de
 * categorizar. Lo ya categorizado no se toca. Antes, copia de seguridad si hay movimientos.
 */
async function aplicarVersion(): Promise<string | null> {
  const db = obtenerDatos()
  if (db.ajustes.version_logica === APP_VERSION) return null
  try {
    if (db.movimientos.length) await hacerCopia('antes de actualizar')
    // Sobre los datos del momento de guardar: si algo cambió durante la copia, no se pierde
    let r!: ReturnType<typeof actualizarLogica>
    await cambiar((actual) => {
      r = actualizarLogica(actual, APP_VERSION)
      return r.db
    })
    registrar('info', `Lógica de la v${APP_VERSION} aplicada a lo pendiente`, {
      reglasNuevas: r.reglasNuevas,
      reglasActualizadas: r.reglasActualizadas,
      categorizados: r.categorizados,
      traspasos: r.traspasos,
    })
    const n = r.categorizados + r.traspasos
    return n ? `Versión ${APP_VERSION}: ${plural(n, 'movimiento pendiente categorizado', 'movimientos pendientes categorizados')} con las reglas nuevas. Lo que ya tenías no se ha tocado.` : null
  } catch (e) {
    registrar('error', `No se pudo aplicar la lógica de la v${APP_VERSION}: ${(e as Error)?.message ?? e}`)
    return null
  }
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
