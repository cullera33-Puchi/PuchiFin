import { CreditCard, Eye, EyeOff, Landmark } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useDatos } from '../datos/ProveedorDatos'
import { formatearFecha, formatearImporte } from '../lib/formato'
import { mesLargo, sumarDias } from '../lib/fechas'
import { calcularPosicion, type Posicion } from '../lib/posicion'
import { Baldosa } from './Icono'

const CLAVE_OCULTA = 'puchifin-posicion-oculta'

function leerOculta(): boolean {
  try {
    return localStorage.getItem(CLAVE_OCULTA) === '1'
  } catch {
    return false
  }
}

/** Línea del saldo de las cuentas a final de cada mes, con el punto de hoy */
function Evolucion({ datos }: { datos: Posicion['evolucion'] }) {
  if (datos.length < 2) return null
  const ancho = 300
  const alto = 44
  const valores = datos.map((d) => d.saldo)
  const min = Math.min(...valores)
  const max = Math.max(...valores)
  const rango = max - min || 1
  const x = (i: number) => 4 + (i * (ancho - 8)) / (datos.length - 1)
  const y = (v: number) => 4 + (alto - 8) * (1 - (v - min) / rango)
  const puntos = datos.map((d, i) => `${x(i).toFixed(1)},${y(d.saldo).toFixed(1)}`).join(' ')
  const ultimo = datos[datos.length - 1]
  const corto = (mes: string) => mesLargo(`${mes}-01`).replace(/ de /, ' ').toLowerCase()
  return (
    <figure className="mt-3">
      <svg
        viewBox={`0 0 ${ancho} ${alto}`}
        className="h-11 w-full text-marca-600 dark:text-marca-500"
        role="img"
        aria-label={`Saldo de las cuentas a final de mes, de ${corto(datos[0].mes)} a hoy: de ${formatearImporte(datos[0].saldo)} a ${formatearImporte(ultimo.saldo)}`}
        preserveAspectRatio="none"
      >
        <polyline points={puntos} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <circle cx={x(datos.length - 1)} cy={y(ultimo.saldo)} r={3.5} fill="currentColor" stroke="var(--graf-superficie, #fff)" strokeWidth={1.5} />
      </svg>
      <figcaption className="mt-0.5 flex justify-between text-[11px] text-zinc-500">
        <span>{corto(datos[0].mes)}</span>
        <span>hoy</span>
      </figcaption>
    </figure>
  )
}

/**
 * Tu posición: capital (saldo de las cuentas según el banco menos lo pendiente de cargar de la
 * tarjeta), cada cuenta, la variación del mes y la evolución. Las cifras se pueden ocultar.
 */
export function TarjetaPosicion() {
  const db = useDatos()
  const p = useMemo(() => calcularPosicion(db), [db])
  const [oculta, setOculta] = useState(leerOculta)
  if (!p) return null
  const cifra = (n: number) => (oculta ? '•••• €' : formatearImporte(n))
  const alternar = () => {
    setOculta((o) => {
      try {
        localStorage.setItem(CLAVE_OCULTA, o ? '0' : '1')
      } catch {
        // sin almacenamiento: solo en esta sesión
      }
      return !o
    })
  }
  const finMesAnterior = sumarDias(`${p.fecha.slice(0, 7)}-01`, -1)
  const tono = p.variacionMes === null ? '' : p.variacionMes >= 0 ? 'text-[#248A3D] dark:text-[#30D158]' : 'text-[#D70015] dark:text-[#FF6961]'
  return (
    <section className="tarjeta mb-3" aria-label="Tu posición">
      <div className="flex items-center gap-2">
        <h2 className="text-[13px] font-medium text-zinc-500 uppercase">Tu posición</h2>
        <span className="ml-auto text-[12px] text-zinc-500">al {formatearFecha(p.fecha)}</span>
        <button className="boton-icono -my-2 -mr-2" aria-label={oculta ? 'Mostrar las cifras' : 'Ocultar las cifras'} onClick={alternar}>
          {oculta ? <EyeOff className="size-5" strokeWidth={1.75} /> : <Eye className="size-5" strokeWidth={1.75} />}
        </button>
      </div>
      <p className="text-[30px] leading-tight font-bold tracking-tight tabular-nums">{cifra(p.capital)}</p>
      {p.variacionMes !== null && !oculta && (
        <p className={`text-[13px] tabular-nums ${tono}`}>
          {p.variacionMes >= 0 ? '+' : ''}
          {formatearImporte(p.variacionMes)} en las cuentas desde el {formatearFecha(finMesAnterior).slice(0, 5)}
        </p>
      )}
      {!oculta && <Evolucion datos={p.evolucion} />}
      <ul className="mt-3 divide-y divide-zinc-200/70 border-t border-zinc-200/70 dark:divide-zinc-800 dark:border-zinc-800">
        {p.cuentas.map((c) => (
          <li key={c.cuenta.id} className="flex min-h-11 items-center gap-3 py-1.5">
            <Baldosa glifo={Landmark} color="#007AFF" tamano="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px]">{c.cuenta.alias}</span>
              {c.fecha !== p.fecha && <span className="block text-[11px] text-zinc-500">Saldo al {formatearFecha(c.fecha)}</span>}
            </span>
            <span className="text-[15px] tabular-nums">{cifra(c.saldo)}</span>
          </li>
        ))}
        {p.tarjetas.map((t) => (
          <li key={t.cuenta.id} className="flex min-h-11 items-center gap-3 py-1.5">
            <Baldosa glifo={CreditCard} color="#FF9500" tamano="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px]">{t.cuenta.alias}</span>
              <span className="block text-[11px] text-zinc-500">
                Pendiente de cargar{t.pendiente.desde ? `, desde el ${formatearFecha(t.pendiente.desde).slice(0, 5)}` : ''}
                {t.pendiente.aproximado ? ' (aproximado)' : ''}
              </span>
            </span>
            <span className="text-[15px] tabular-nums">{cifra(t.pendiente.importe)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-zinc-500">Saldo del banco de cada cuenta (último movimiento importado) menos lo gastado con la tarjeta que aún no se ha cargado.</p>
    </section>
  )
}
