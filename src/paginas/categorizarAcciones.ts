import { useHacer } from '../componentes/acciones'
import { cambiarCategoria } from '../datos/movimientos'
import { plural } from '../lib/formato'
import type { BaseDatos } from '../lib/tipos'
import { nombreCategoria } from '../lib/vista'
import { obtenerDatos } from '../datos/almacen'

/** Aplicar categorías desde la pantalla Categorizar, siempre con «Deshacer» */
export function useAcciones(crearRegla: boolean) {
  const hacer = useHacer()
  const aplicarGrupo = (ids: string[], categoria: string) =>
    hacer(
      (d) => cambiarCategoria(d, ids, categoria, { crearRegla }),
      `${plural(ids.length, 'movimiento', 'movimientos')}: ${nombreCategoria(obtenerDatos(), categoria)}`,
    )
  /** Varios grupos en un solo cambio y un solo aviso */
  const aplicarVarios = (lotes: { ids: string[]; categoria: string }[], total: number) =>
    hacer(
      (d) => lotes.reduce((acc: BaseDatos, l) => cambiarCategoria(acc, l.ids, l.categoria, { crearRegla }), d),
      `${plural(total, 'movimiento categorizado', 'movimientos categorizados')}`,
    )
  return { aplicarGrupo, aplicarVarios }
}
