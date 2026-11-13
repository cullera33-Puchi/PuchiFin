import { intentarDeshacible } from '../datos/ProveedorDatos'
import type { BaseDatos } from '../lib/tipos'
import { useInterfaz } from './Interfaz'

/**
 * Aplica un cambio de datos y muestra el aviso con «Deshacer» (4 segundos), como pide la guía:
 * todo lo que se hace se puede deshacer. Devuelve true si se ha aplicado.
 */
export function useHacer() {
  const { avisar } = useInterfaz()
  return async (operacion: (db: BaseDatos) => BaseDatos, texto: string, registro?: string): Promise<boolean> => {
    const r = await intentarDeshacible(operacion, registro ?? texto)
    if (r.error) {
      avisar(r.error)
      return false
    }
    avisar(texto, {
      texto: 'Deshacer',
      fn: () => {
        void r.deshacer().then((ok) => avisar(ok ? 'Deshecho' : 'No se puede deshacer: hay cambios posteriores'))
      },
    })
    return true
  }
}
