/** Ayudas de presentación compartidas por las pantallas */
import type { BaseDatos, Movimiento, TipoMovimiento } from './tipos'

export const COLOR_TIPO: Record<TipoMovimiento, string> = {
  normal: '#8E8E93',
  gasto_empleado: '#5856D6',
  reembolso_empresa: '#34C759',
  traspaso_interno: '#8E8E93',
  pago_deuda: '#FF9500',
}

export function nombreCategoria(db: BaseDatos, id: string | null): string {
  if (!id) return 'Sin categoría'
  const c = db.categorias.find((x) => x.id === id)
  if (!c) return '?'
  const p = c.padre_id ? db.categorias.find((x) => x.id === c.padre_id) : undefined
  return p ? `${p.nombre}, ${c.nombre}` : c.nombre
}

/** Agrupa movimientos por día, del más reciente al más antiguo */
export function porDia(movs: Movimiento[]): [string, Movimiento[]][] {
  const grupos = new Map<string, Movimiento[]>()
  for (const m of [...movs].sort((a, b) => b.fecha_operacion.localeCompare(a.fecha_operacion) || a.importe - b.importe)) {
    const g = grupos.get(m.fecha_operacion) ?? []
    g.push(m)
    grupos.set(m.fecha_operacion, g)
  }
  return [...grupos]
}
