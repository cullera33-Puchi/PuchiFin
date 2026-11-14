/**
 * Gastos (o ingresos) previstos: lo que se sabe que llega en una fecha (IBI, seguros anuales,
 * vacaciones, pagas extra). Se dan por cobrados cuando aparece un movimiento parecido cerca de su fecha;
 * los pendientes entran en la previsión de cierre del mes y en el plan de pagos.
 */
import { fechaDeLosDatos } from './extracto'
import type { Recurrente } from './recurrentes'
import type { BaseDatos, EventoPrevisto } from './tipos'

const dias = (a: string, b: string) => Math.abs(Math.round((Date.parse(b) - Date.parse(a)) / 86400000))

export type EstadoEvento = 'pendiente' | 'cobrado' | 'no_visto'

export interface EventoConEstado {
  evento: EventoPrevisto
  estado: EstadoEvento
  /** Movimiento que lo cumple, si se ha cobrado */
  movimiento_id: string | null
}

/**
 * Cobrado: hay un movimiento Normal del mismo signo a 20 días o menos, con un importe parecido (±30 %) y,
 * si el previsto tiene categoría, de esa categoría o de sus subcategorías. Pendiente: aún no ha llegado
 * su fecha en los datos importados. No visto: ya pasó su fecha y no aparece.
 */
export function estadoEventos(db: BaseDatos, hoy: string): EventoConEstado[] {
  const hasta = fechaDeLosDatos(db, hoy)
  const familia = (id: string) => new Set([id, ...db.categorias.filter((c) => c.padre_id === id).map((c) => c.id)])
  const usados = new Set<string>()
  return [...db.eventos_previstos]
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .map((evento) => {
      const cats = evento.categoria_id ? familia(evento.categoria_id) : null
      const m = db.movimientos.find(
        (x) =>
          !usados.has(x.id) &&
          x.tipo === 'normal' &&
          Math.sign(x.importe) === Math.sign(evento.importe) &&
          dias(x.fecha_operacion, evento.fecha) <= 20 &&
          Math.abs(Math.abs(x.importe) - Math.abs(evento.importe)) <= Math.abs(evento.importe) * 0.3 &&
          (!cats || (x.categoria_id !== null && cats.has(x.categoria_id))),
      )
      if (m) {
        usados.add(m.id)
        return { evento, estado: 'cobrado' as const, movimiento_id: m.id }
      }
      return { evento, estado: evento.fecha > hasta ? ('pendiente' as const) : ('no_visto' as const), movimiento_id: null }
    })
}

/**
 * Previstos pendientes entre dos fechas (sin incluir «desde»), sin los que ya cubre un recibo recurrente
 * (el IBI anual detectado y dado de alta a la vez no se cuenta dos veces).
 */
export function previstosPendientes(db: BaseDatos, desde: string, hasta: string, hoy: string, recurrentes: Recurrente[] = []): EventoPrevisto[] {
  return estadoEventos(db, hoy)
    .filter((e) => e.estado === 'pendiente' && e.evento.fecha > desde && e.evento.fecha <= hasta)
    .map((e) => e.evento)
    .filter((ev) => !recurrentes.some((r) => r.activo && ev.categoria_id && r.categoria_id === ev.categoria_id && dias(r.proxima, ev.fecha) <= 20))
}
