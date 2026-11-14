import { ChevronRight, HandCoins } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useDatos } from '../datos/ProveedorDatos'
import { hoyIso, MESES } from '../lib/fechas'
import { formatearRedondo } from '../lib/formato'
import { calcularPlan, efectoMesCerrado } from '../lib/plan'
import { Baldosa } from './Icono'

const VERDE = 'text-[#248A3D] dark:text-[#30D158]'
const ROJO = 'text-[#D70015] dark:text-[#FF6961]'

/**
 * Acceso al plan de pagos (Extracto e Informes): deuda pendiente, pago previsto del próximo verano, año
 * en que queda saldada y lo que el último mes cerrado suma o resta al pago. Sin configurar, invita a hacerlo.
 */
export function TarjetaDeuda({ className = 'mb-3' }: { className?: string }) {
  const db = useDatos()
  const datos = useMemo(() => {
    const r = calcularPlan(db, hoyIso())
    return { r, efecto: r.plan ? efectoMesCerrado(db, hoyIso()) : null }
  }, [db])
  const { r, efecto } = datos
  if (!r.plan && r.falta !== 'sin_deuda') return null
  const plan = r.plan
  const proximo = plan?.pagos[0]
  return (
    <Link to="/extracto/plan" className={`tarjeta flex items-center gap-3 active:opacity-70 ${className}`}>
      <Baldosa glifo={HandCoins} color="#AF52DE" />
      <span className="min-w-0 flex-1">
        {!plan ? (
          <>
            <span className="block text-[15px] font-semibold">Plan de pagos de la deuda</span>
            <span className="block text-[12px] text-zinc-500">Introduce la deuda y el colchón para ver el pago de cada verano</span>
          </>
        ) : (
          <>
            <span className="block text-[15px] font-semibold tabular-nums">{plan.deudaPendiente > 0 ? `Deuda: ${formatearRedondo(plan.deudaPendiente)}` : 'Deuda saldada'}</span>
            {proximo && (
              <span className="block text-[12px] text-zinc-500 tabular-nums">
                Pago previsto en {MESES[Number(proximo.mes.slice(5, 7)) - 1]} de {proximo.anio}: {formatearRedondo(proximo.pago)}
                {plan.saldadaEn ? `. Saldada en ${plan.saldadaEn}` : ''}
              </span>
            )}
            {efecto && efecto.diferencia !== 0 && (
              <span className={`block text-[12px] tabular-nums ${efecto.diferencia > 0 ? VERDE : ROJO}`}>
                {MESES[Number(efecto.mes.slice(5, 7)) - 1].replace(/^./, (x) => x.toUpperCase())} {efecto.diferencia > 0 ? 'suma' : 'resta'}{' '}
                {formatearRedondo(Math.abs(efecto.diferencia))} al pago
              </span>
            )}
          </>
        )}
      </span>
      <ChevronRight className="size-4 shrink-0 text-zinc-400" />
    </Link>
  )
}
