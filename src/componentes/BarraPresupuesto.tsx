import { formatearRedondo } from '../lib/formato'
import type { EstadoPresupuesto, LineaPresupuesto } from '../lib/presupuesto'

/** Verde si va bien, naranja si va camino de pasarse y rojo si ya se ha pasado */
// oxlint-disable-next-line react/only-export-components
export const COLOR_ESTADO: Record<EstadoPresupuesto, string> = { dentro: 'var(--serie-3)', riesgo: '#FF9500', superado: '#FF3B30' }

// oxlint-disable-next-line react/only-export-components
export const TONO_ESTADO: Record<EstadoPresupuesto, string> = {
  dentro: 'text-zinc-500',
  riesgo: 'text-[#C93400] dark:text-[#FF9F0A]',
  superado: 'text-[#D70015] dark:text-[#FF6961]',
}

/**
 * Barra de un presupuesto (v0.36.0): lo gastado sobre el presupuesto y, más clara, hasta dónde llegará al
 * cerrar el mes. Si se pasa (ya o al cierre), la escala crece y una marca señala el presupuesto.
 */
export function BarraPresupuesto({
  presupuesto,
  gastado,
  cierre,
  estado,
  etiqueta,
  alta = false,
}: {
  presupuesto: number
  gastado: number
  cierre: number | null
  estado: EstadoPresupuesto
  etiqueta: string
  alta?: boolean
}) {
  const escala = Math.max(presupuesto, gastado, cierre ?? 0) || 1
  const pct = (n: number) => `${Math.min(100, Math.max(0, (n / escala) * 100))}%`
  const color = COLOR_ESTADO[estado]
  return (
    <span
      className={`relative block flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800 ${alta ? 'h-2.5' : 'h-1.5'}`}
      role="progressbar"
      aria-valuenow={Math.round((gastado / presupuesto) * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={etiqueta}
    >
      {cierre !== null && cierre > gastado && <span className="absolute inset-y-0 left-0 rounded-full opacity-30" style={{ width: pct(cierre), background: color }} />}
      <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: gastado > 0 ? `max(3px, ${pct(gastado)})` : 0, background: color }} />
      {escala > presupuesto * 1.001 && <span className="absolute inset-y-0 w-0.5 bg-zinc-900/60 dark:bg-white/70" style={{ left: `calc(${pct(presupuesto)} - 1px)` }} />}
    </span>
  )
}

/**
 * Cómo va un presupuesto, en pocas palabras. «Quedan» descuenta los recibos y gastos previstos que faltan:
 * es lo que se puede gastar todavía. Con «largo», la frase completa de la pantalla de Presupuesto.
 */
// oxlint-disable-next-line react/only-export-components
export function textoEstado(l: Pick<LineaPresupuesto, 'presupuesto' | 'gastado' | 'comprometido' | 'cierre' | 'estado'>, largo = false): string {
  if (l.estado === 'superado') return `Superado en ${formatearRedondo(l.gastado - l.presupuesto)}`
  if (l.estado === 'riesgo') {
    const cierre = formatearRedondo(l.cierre!)
    return largo ? `Cerrarás en unos ${cierre}, ${formatearRedondo(l.cierre! - l.presupuesto)} por encima` : `Cerrarás en ${cierre}`
  }
  const libre = l.presupuesto - l.gastado - l.comprometido
  if (l.cierre === null) return libre < 0.5 ? 'Justo' : `Sobraron ${formatearRedondo(libre)}`
  if (libre < 0.5) return largo && l.comprometido > 0 ? 'Justo, con los recibos que faltan' : 'Justo'
  return largo && l.comprometido > 0 ? `Quedan ${formatearRedondo(libre)}, descontados los recibos que faltan (${formatearRedondo(l.comprometido)})` : `Quedan ${formatearRedondo(libre)}`
}
