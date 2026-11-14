import { mesLargo } from '../lib/fechas'
import { formatearRedondo } from '../lib/formato'
import type { PuntoCapital } from '../lib/plan'

const corto = (mes: string) => mesLargo(`${mes}-01`).replace(/ de /, ' ').toLowerCase()

/**
 * Capital previsto a final de cada mes (ya descontados los pagos de la deuda), con la simulación al lado
 * si la hay. Línea de 2 px, leyenda y cifras a 12 y 24 meses en texto.
 */
export function GraficoCapital({ base, simulado }: { base: PuntoCapital[]; simulado: PuntoCapital[] | null }) {
  if (base.length < 2) return null
  const ancho = 300
  const alto = 90
  const valores = [...base, ...(simulado ?? [])].map((p) => p.capital)
  const min = Math.min(...valores, 0)
  const max = Math.max(...valores)
  const rango = max - min || 1
  const x = (i: number) => 4 + (i * (ancho - 8)) / (base.length - 1)
  const y = (v: number) => 6 + (alto - 12) * (1 - (v - min) / rango)
  const linea = (serie: PuntoCapital[]) => serie.map((p, i) => `${x(i).toFixed(1)},${y(p.capital).toFixed(1)}`).join(' ')
  const en = (serie: PuntoCapital[] | null, i: number) => serie?.[i]?.capital
  const hitos = [12, 24].filter((i) => base[i])
  return (
    <figure>
      <svg
        viewBox={`0 0 ${ancho} ${alto}`}
        className="h-24 w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Capital previsto de ${corto(base[0].mes)} a ${corto(base[base.length - 1].mes)}: de ${formatearRedondo(base[0].capital)} a ${formatearRedondo(base[base.length - 1].capital)}${simulado ? `; con la simulación, ${formatearRedondo(simulado[simulado.length - 1].capital)}` : ''}`}
      >
        {min < 0 && <line x1={0} x2={ancho} y1={y(0)} y2={y(0)} stroke="currentColor" className="text-zinc-300 dark:text-zinc-700" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
        <polyline points={linea(base)} fill="none" stroke="currentColor" className="text-marca-600 dark:text-marca-500" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {simulado && (
          <polyline points={linea(simulado)} fill="none" stroke="#34C759" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" strokeDasharray="5 3" vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      <figcaption className="mt-1 flex justify-between text-[11px] text-zinc-500">
        <span>{corto(base[0].mes)}</span>
        <span>{corto(base[base.length - 1].mes)}</span>
      </figcaption>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-zinc-500">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded bg-marca-600 dark:bg-marca-500" /> Previsto
        </span>
        {simulado && (
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded border-t-2 border-dashed border-[#34C759]" /> Con la simulación
          </span>
        )}
      </div>
      <ul className="mt-2 space-y-0.5 text-[13px] tabular-nums">
        {hitos.map((i) => (
          <li key={i} className="flex gap-2">
            <span className="flex-1 text-zinc-500">En {corto(base[i].mes)}</span>
            <span>{formatearRedondo(base[i].capital)}</span>
            {simulado && en(simulado, i) !== undefined && <span className="text-[#248A3D] dark:text-[#30D158]">{formatearRedondo(en(simulado, i)!)}</span>}
          </li>
        ))}
      </ul>
    </figure>
  )
}
