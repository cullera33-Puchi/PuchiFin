import { useMemo, useState } from 'react'
import { useDatos } from '../datos/ProveedorDatos'
import { ahorroYFijoPorMes } from '../lib/extracto'
import { hoyIso, MESES, mesLargo } from '../lib/fechas'
import { formatearRedondo } from '../lib/formato'
import { detectarRecurrentes } from '../lib/recurrentes'
import { porcentaje } from '../lib/resumen'

/**
 * Tasa de ahorro y gasto fijo frente a variable, mes a mes (R3, v0.34.0). Barras apiladas: abajo lo fijo
 * (recibos y suscripciones), arriba lo variable; debajo, la tasa de ahorro. Tocar un mes enseña sus cifras.
 */
export function AhorroYFijo({ hasta }: { hasta: string }) {
  const db = useDatos()
  const datos = useMemo(() => ahorroYFijoPorMes(db, hasta, hoyIso(), detectarRecurrentes(db)), [db, hasta])
  const [elegido, setElegido] = useState<string | null>(null)
  if (datos.length < 2) return null
  const max = Math.max(...datos.map((d) => d.fijo + d.variable), 1)
  const sel = datos.find((d) => d.mes === elegido) ?? datos[datos.length - 1]
  const completos = datos.filter((d) => !d.incompleto)
  const fijoMedio = completos.length ? completos.reduce((s, d) => s + d.fijo / Math.max(1, d.fijo + d.variable), 0) / completos.length : null
  return (
    <section className="tarjeta">
      <h3 className="text-[13px] font-medium text-zinc-500 uppercase">Ahorro y gasto fijo, mes a mes</h3>
      {fijoMedio !== null && <p className="mt-1 text-[13px] text-zinc-500">De media, el {porcentaje(fijoMedio)} de lo que gastas son recibos y suscripciones.</p>}
      <div className="mt-3 flex h-36 items-end gap-1.5" role="group" aria-label="Gasto fijo y variable por mes">
        {datos.map((d) => {
          const total = d.fijo + d.variable
          const activo = d.mes === sel.mes
          return (
            <button
              key={d.mes}
              className={`flex h-full min-w-0 flex-1 flex-col items-stretch justify-end ${d.incompleto ? 'opacity-50' : ''}`}
              aria-label={`${mesLargo(`${d.mes}-01`)}: fijo ${formatearRedondo(d.fijo)}, variable ${formatearRedondo(d.variable)}, ahorro ${d.tasa === null ? 'sin ingresos' : porcentaje(d.tasa)}`}
              aria-pressed={activo}
              onClick={() => setElegido(d.mes)}
            >
              <span className={`block rounded-t-[4px] ${activo ? 'bg-marca-400' : 'bg-marca-300/70 dark:bg-marca-700/70'}`} style={{ height: `${(d.variable / max) * 100}%` }} />
              <span className={`mt-[2px] block ${activo ? 'bg-marca-700 dark:bg-marca-500' : 'bg-marca-600/80 dark:bg-marca-500/80'} ${d.variable ? '' : 'rounded-t-[4px]'}`} style={{ height: `${(d.fijo / max) * 100}%` }} />
              {!total && <span className="block h-px bg-zinc-300" />}
            </button>
          )
        })}
      </div>
      <div className="mt-1 flex gap-1.5">
        {datos.map((d) => (
          <div key={d.mes} className="min-w-0 flex-1 text-center">
            <span className="block truncate text-[10px] text-zinc-500">{MESES[Number(d.mes.slice(5, 7)) - 1].slice(0, 3)}</span>
            <span className={`block truncate text-[10px] tabular-nums ${d.tasa !== null && d.tasa < 0 ? 'text-[#D70015] dark:text-[#FF6961]' : 'text-zinc-500'}`}>
              {d.tasa === null ? '—' : Math.round(d.tasa * 100)}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 text-[12px] text-zinc-500">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-marca-600 dark:bg-marca-500" /> Fijo
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-marca-300 dark:bg-marca-700" /> Variable
        </span>
        <span>Debajo, la tasa de ahorro en %</span>
      </div>
      <p className="mt-2 rounded-xl bg-zinc-100 px-3 py-2 text-[13px] tabular-nums dark:bg-zinc-800">
        <span className="font-medium">{mesLargo(`${sel.mes}-01`)}</span>
        {sel.incompleto ? ' (incompleto)' : ''}: fijo {formatearRedondo(sel.fijo)}, variable {formatearRedondo(sel.variable)}, ahorro {sel.tasa === null ? 'sin ingresos' : porcentaje(sel.tasa)}
      </p>
    </section>
  )
}
