import { useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { BarraNavegacion } from '../componentes/Encabezado'
import { FilaMovimientoDeslizable } from '../componentes/FilaMovimientoDeslizable'
import { DetalleMovimiento } from '../componentes/movimientos'
import { useDatos } from '../datos/ProveedorDatos'
import { movimientosDeCategoria } from '../lib/extracto'
import { diaLargo, hoyIso, mesLargo } from '../lib/fechas'
import { formatearImporte } from '../lib/formato'
import { porDia } from '../lib/vista'

/** Movimientos del mes de una categoría (al tocarla en el Extracto) */
export function CategoriaMes() {
  const db = useDatos()
  const { id } = useParams()
  const [params] = useSearchParams()
  const mes = params.get('mes') ?? hoyIso().slice(0, 7)
  const categoriaId = id === 'sin' ? null : id ?? null
  const categoria = db.categorias.find((c) => c.id === categoriaId)
  const movs = movimientosDeCategoria(db, mes, categoriaId)
  const total = -movs.reduce((s, m) => s + m.importe, 0)
  const [detalle, setDetalle] = useState<string | null>(null)

  return (
    <>
      <BarraNavegacion titulo={categoria?.nombre ?? 'Sin categoría'} atras="Extracto" subtitulo={`${mesLargo(`${mes}-01`)}. ${formatearImporte(Math.round(total * 100) / 100)} en ${movs.length} movimientos`} />
      {movs.length === 0 ? (
        <p className="tarjeta text-sm text-zinc-500">Sin movimientos de esta categoría en el mes.</p>
      ) : (
        <div className="space-y-4">
          {porDia(movs).map(([dia, lista]) => (
            <section key={dia}>
              <h3 className="cabecera-grupo">{diaLargo(dia)}</h3>
              <ul className="lista divide-y divide-zinc-200/70 dark:divide-zinc-800">
                {lista.map((m) => (
                  <li key={m.id}>
                    <FilaMovimientoDeslizable m={m} onPulsar={() => setDetalle(m.id)} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      <DetalleMovimiento id={detalle} onCerrar={() => setDetalle(null)} />
    </>
  )
}
