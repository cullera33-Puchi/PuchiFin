import { ChevronRight, TriangleAlert } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useDatos } from '../datos/ProveedorDatos'
import { gastosAtipicos, UMBRAL_GRANDE, type GastoAtipico } from '../lib/atipicos'
import { mesLargo } from '../lib/fechas'
import { formatearImporte, formatearRedondo, plural } from '../lib/formato'
import { registrar } from '../lib/registro'
import { FilaMovimientoDeslizable } from './FilaMovimientoDeslizable'
import { Baldosa } from './Icono'
import { Hoja } from './Interfaz'
import { DetalleMovimiento } from './movimientos'

/** Por qué es un gasto fuera de lo normal */
const motivo = (a: GastoAtipico) =>
  a.motivo === 'comercio'
    ? `Lo habitual aquí: ${formatearImporte(a.habitual!)} (${plural(a.veces, 'cargo', 'cargos')} en el último año)`
    : `Primer gasto aquí en un año y de ${formatearRedondo(UMBRAL_GRANDE)} o más`

/** Lista de gastos fuera de lo normal, con su motivo; cada fila abre su detalle y admite los gestos */
function ListaAtipicos({ lista }: { lista: GastoAtipico[] }) {
  const [detalle, setDetalle] = useState<string | null>(null)
  return (
    <>
      <ul className="lista divide-y divide-zinc-200/70 dark:divide-zinc-800">
        {lista.map((a) => (
          <li key={a.movimiento.id}>
            <FilaMovimientoDeslizable m={a.movimiento} conFecha onPulsar={() => setDetalle(a.movimiento.id)} />
            <p className="-mt-1 px-4 pb-2 pl-[4.25rem] text-[12px] text-[#C93400] dark:text-[#FF9F0A]">{motivo(a)}</p>
          </li>
        ))}
      </ul>
      <DetalleMovimiento id={detalle} onCerrar={() => setDetalle(null)} />
    </>
  )
}

/** Fila del Extracto (R2, v0.34.0): «N gastos fuera de lo normal», que abre la lista */
export function FilaAtipicos({ mes }: { mes: string }) {
  const db = useDatos()
  const lista = useMemo(() => gastosAtipicos(db, mes), [db, mes])
  const [abierta, setAbierta] = useState(false)
  useEffect(() => {
    if (abierta) registrar('info', 'Gastos fuera de lo normal: abiertos', { gastos: lista.length })
  }, [abierta]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!lista.length) return null
  const total = lista.reduce((s, a) => s - a.movimiento.importe, 0)
  return (
    <>
      <button className="lista fila min-h-12 w-full active:bg-zinc-100 dark:active:bg-zinc-800" onClick={() => setAbierta(true)}>
        <Baldosa glifo={TriangleAlert} color="#FF9500" tamano="sm" />
        <span className="min-w-0 flex-1 text-left">
          <span className="block text-[15px]">{plural(lista.length, 'gasto fuera de lo normal', 'gastos fuera de lo normal')}</span>
          <span className="block truncate text-[12px] text-zinc-500">
            {formatearRedondo(total)} en total. {lista[0].movimiento.concepto_limpio}
          </span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-zinc-400" />
      </button>
      <Hoja abierta={abierta} titulo="Fuera de lo normal" listo="Listo" onCerrar={() => setAbierta(false)}>
        <p className="mb-3 px-1 text-[13px] text-zinc-500">
          {conMayuscula(mesLargo(`${mes}-01`).toLowerCase())}: cargos muy por encima de lo habitual en un comercio y gastos grandes en sitios nuevos. Si alguno es de
          trabajo, desliza a la derecha para que no cuente.
        </p>
        <ListaAtipicos lista={lista} />
      </Hoja>
    </>
  )
}

/** Sección de Informes, vista Comercios, para un mes */
export function SeccionAtipicos({ mes }: { mes: string }) {
  const db = useDatos()
  const lista = useMemo(() => gastosAtipicos(db, mes), [db, mes])
  if (!lista.length) return null
  return (
    <section>
      <h3 className="cabecera-grupo">Fuera de lo normal</h3>
      <ListaAtipicos lista={lista} />
    </section>
  )
}

const conMayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)
