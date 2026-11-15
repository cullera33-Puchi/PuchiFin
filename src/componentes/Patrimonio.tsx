import { ChevronRight, HandCoins, Landmark, Scale } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useDatos } from '../datos/ProveedorDatos'
import { hoyIso, MESES } from '../lib/fechas'
import { formatearRedondo } from '../lib/formato'
import { calcularPatrimonio, hayPatrimonio } from '../lib/patrimonio'
import { calcularPlan } from '../lib/plan'
import { calcularPosicion } from '../lib/posicion'
import { Baldosa } from './Icono'
import { leerOculta } from './Posicion'

const VERDE = 'text-[#248A3D] dark:text-[#30D158]'
const ROJO = 'text-[#D70015] dark:text-[#FF6961]'

/**
 * Arriba del Extracto, en dos filas (v0.31.0): el capital con su variación del mes y la deuda con el
 * pago previsto. El detalle de cuentas y el plan, a un toque. Respeta el ojo que oculta las cifras.
 */
export function FilasPatrimonio() {
  const db = useDatos()
  const posicion = useMemo(() => calcularPosicion(db), [db])
  const plan = useMemo(() => calcularPlan(db, hoyIso()), [db])
  // Con bienes o la hipoteca dada de alta, una fila más con el patrimonio neto (v0.41.0)
  const patrimonio = useMemo(() => (hayPatrimonio(db) ? calcularPatrimonio(db, hoyIso()) : null), [db])
  const oculta = leerOculta()
  const cifra = (n: number) => (oculta ? '•••• €' : formatearRedondo(n))
  const deuda = plan.plan
  const proximo = deuda?.pagos[0]
  if (!posicion && !deuda && plan.falta !== 'sin_deuda' && !patrimonio) return null
  return (
    <ul className="lista mb-3 divide-y divide-zinc-200/70 dark:divide-zinc-800">
      {posicion && (
        <li>
          <Link to="/extracto/posicion" className="fila min-h-14 active:bg-zinc-100 dark:active:bg-zinc-800">
            <Baldosa glifo={Landmark} color="#007AFF" tamano="sm" />
            <span className="min-w-0 flex-1">
              <span className="block text-[15px]">Capital</span>
              {posicion.variacionMes !== null && !oculta && (
                <span className={`block text-[12px] tabular-nums ${posicion.variacionMes >= 0 ? VERDE : ROJO}`}>
                  {posicion.variacionMes >= 0 ? '+' : ''}
                  {formatearRedondo(posicion.variacionMes)} este mes
                </span>
              )}
            </span>
            <span className="text-[17px] font-semibold tabular-nums">{cifra(posicion.capital)}</span>
            <ChevronRight className="size-4 shrink-0 text-zinc-400" />
          </Link>
        </li>
      )}
      {patrimonio && (
        <li>
          <Link to="/extracto/patrimonio" className="fila min-h-14 active:bg-zinc-100 dark:active:bg-zinc-800">
            <Baldosa glifo={Scale} color="#34C759" tamano="sm" />
            <span className="min-w-0 flex-1">
              <span className="block text-[15px]">Patrimonio neto</span>
              <span className="block truncate text-[12px] text-zinc-500">Bienes menos deudas</span>
            </span>
            <span className="text-[17px] font-semibold tabular-nums">{cifra(patrimonio.neto)}</span>
            <ChevronRight className="size-4 shrink-0 text-zinc-400" />
          </Link>
        </li>
      )}
      {(deuda || plan.falta === 'sin_deuda') && (
        <li>
          <Link to="/extracto/plan" className="fila min-h-14 active:bg-zinc-100 dark:active:bg-zinc-800">
            <Baldosa glifo={HandCoins} color="#AF52DE" tamano="sm" />
            <span className="min-w-0 flex-1">
              <span className="block text-[15px]">{deuda ? 'Deuda' : 'Plan de pagos de la deuda'}</span>
              <span className="block truncate text-[12px] text-zinc-500 tabular-nums">
                {!deuda
                  ? 'Sin configurar'
                  : proximo
                    ? `Pago en ${MESES[Number(proximo.mes.slice(5, 7)) - 1]} de ${proximo.anio}: ${oculta ? '••••' : formatearRedondo(proximo.pago)}${deuda.saldadaEn ? `. Saldada en ${deuda.saldadaEn}` : ''}`
                    : 'Saldada'}
              </span>
            </span>
            {deuda && <span className="text-[17px] font-semibold tabular-nums">{cifra(deuda.deudaPendiente)}</span>}
            <ChevronRight className="size-4 shrink-0 text-zinc-400" />
          </Link>
        </li>
      )}
    </ul>
  )
}
