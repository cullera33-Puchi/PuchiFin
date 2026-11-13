import { Check, CircleCheck, Tag } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useHacer } from '../componentes/acciones'
import { BarraNavegacion } from '../componentes/Encabezado'
import { FilaMovimientoDeslizable } from '../componentes/FilaMovimientoDeslizable'
import { Baldosa } from '../componentes/Icono'
import { Segmentado } from '../componentes/Interfaz'
import { DetalleMovimiento, SelectorCategoria } from '../componentes/movimientos'
import { categoriasPasarela, gruposPasarela, type GrupoPasarela } from '../datos/categorizar'
import { cambiarCategoria } from '../datos/movimientos'
import { useDatos } from '../datos/ProveedorDatos'
import { formatearFecha, formatearImporte, plural } from '../lib/formato'
import type { BaseDatos } from '../lib/tipos'
import { nombreCategoria } from '../lib/vista'

type Modo = 'revisar' | 'todos'

function categoriaDe(db: BaseDatos, id: string) {
  const c = db.categorias.find((x) => x.id === id)
  const padre = c?.padre_id ? db.categorias.find((x) => x.id === c.padre_id) : undefined
  return { corto: c?.nombre ?? '', icono: padre?.icono ?? c?.icono ?? null, color: c?.color ?? '#8E8E93' }
}

/**
 * Repartir los cargos de PayPal: BBVA no dice el comercio, así que se agrupan por importe. Un toque en
 * una categoría la aplica a los cargos de ese importe y la app la recuerda para los próximos.
 */
export function PayPal() {
  const db = useDatos()
  const hacer = useHacer()
  const grupos = useMemo(() => gruposPasarela(db), [db])
  const porRevisar = grupos.reduce((s, g) => s + g.porRevisar.length, 0)
  const [modo, setModo] = useState<Modo>(porRevisar ? 'revisar' : 'todos')
  const [recientes, setRecientes] = useState<string[]>([])
  const [eligiendo, setEligiendo] = useState<GrupoPasarela | null>(null)
  const [abierto, setAbierto] = useState<string | null>(null)
  const [detalle, setDetalle] = useState<string | null>(null)
  const rapidas = useMemo(() => categoriasPasarela(db, recientes, 7), [db, recientes])
  const visibles = modo === 'revisar' ? grupos.filter((g) => g.porRevisar.length) : grupos

  const aplicar = (g: GrupoPasarela, categoria: string) => {
    setRecientes((r) => [categoria, ...r.filter((x) => x !== categoria)].slice(0, 6))
    const ids = (modo === 'revisar' ? g.porRevisar : g.movimientos).filter((m) => m.categoria_id !== categoria || m.origen_categoria !== 'manual').map((m) => m.id)
    if (!ids.length) return
    return hacer(
      (d) => cambiarCategoria(d, ids, categoria, { crearRegla: g.movimientos.length > 1 }),
      `${plural(ids.length, 'cargo', 'cargos')} de ${formatearImporte(g.importe)}: ${nombreCategoria(db, categoria)}`,
    )
  }

  return (
    <>
      <BarraNavegacion titulo="PayPal" atras="Movimientos" subtitulo={porRevisar ? plural(porRevisar, 'cargo por revisar', 'cargos por revisar') : undefined} />
      <p className="mb-3 px-1 text-[13px] text-zinc-500">
        BBVA no dice en qué pagaste con PayPal. Los cargos van agrupados por importe: uno que se repite suele ser una suscripción. Elige la categoría y la app la recordará para
        ese importe.
      </p>
      <div className="mb-4">
        <Segmentado
          etiqueta="Qué cargos ver"
          opciones={[
            ['revisar', `Por revisar (${porRevisar})`],
            ['todos', `Todos (${grupos.reduce((s, g) => s + g.movimientos.length, 0)})`],
          ]}
          valor={modo}
          onCambio={setModo}
        />
      </div>

      {!visibles.length ? (
        <div className="tarjeta space-y-2 py-8 text-center">
          <CircleCheck className="mx-auto size-12 text-[#34C759]" strokeWidth={1.5} />
          <p className="text-[17px] font-semibold">{grupos.length ? 'Todos los cargos de PayPal tienen categoría' : 'No hay cargos de PayPal'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visibles.map((g) => {
            const k = `${g.signo}|${g.clave}`
            const lista = modo === 'revisar' ? g.porRevisar : g.movimientos
            const actuales = [...new Set(lista.map((m) => m.categoria_id))]
            const actual = actuales.length === 1 && actuales[0] ? categoriaDe(db, actuales[0]) : null
            const sug = g.sugerencia && !(actuales.length === 1 && actuales[0] === g.sugerencia) ? g.sugerencia : null
            const desde = lista[lista.length - 1].fecha_operacion
            const hasta = lista[0].fecha_operacion
            return (
              <section key={k} className="lista">
                <div className="flex items-center gap-3 px-4 pt-3">
                  {actual ? <Baldosa icono={actual.icono} color={actual.color} /> : <Baldosa glifo={Tag} color="#C7C7CC" />}
                  <span className="min-w-0 flex-1">
                    <span className="block text-[17px] font-semibold tabular-nums">
                      {g.signo === 'ingreso' ? '+' : ''}
                      {formatearImporte(g.importe)}
                    </span>
                    <span className="block truncate text-[13px] text-zinc-500 tabular-nums">
                      {lista.length === 1 ? formatearFecha(hasta) : `${plural(lista.length, 'cargo', 'cargos')}, del ${formatearFecha(desde).slice(0, 5)} al ${formatearFecha(hasta).slice(0, 5)}`}
                    </span>
                    <span className={`block truncate text-[13px] ${actual || actuales.length > 1 ? 'text-zinc-500' : 'text-[#FF9500]'}`}>
                      {actual ? `Ahora en ${actual.corto}` : actuales.length > 1 ? 'Con categorías distintas' : 'Sin categoría'}
                    </span>
                  </span>
                  {lista.length > 1 && (
                    <button className="boton-texto shrink-0 px-1" onClick={() => setAbierto((a) => (a === k ? null : k))}>
                      {abierto === k ? 'Ocultar' : 'Ver'}
                    </button>
                  )}
                </div>
                <div className="flex gap-2 overflow-x-auto px-4 pt-3 pb-3 [scrollbar-width:none]">
                  {sug && (
                    <button
                      className="flex min-h-9 shrink-0 items-center gap-1.5 rounded-full bg-marca-700 py-1 pr-3 pl-2 text-[13px] font-medium text-white active:opacity-80"
                      onClick={() => aplicar(g, sug)}
                    >
                      <Check className="size-4" strokeWidth={2.5} /> {categoriaDe(db, sug).corto}
                    </button>
                  )}
                  {rapidas
                    .filter((id) => id !== sug)
                    .slice(0, 6)
                    .map((id) => {
                      const c = categoriaDe(db, id)
                      return (
                        <button
                          key={id}
                          className="flex min-h-9 shrink-0 items-center gap-1.5 rounded-full bg-zinc-100 py-1 pr-3 pl-1 text-[13px] active:bg-zinc-200 dark:bg-zinc-800 dark:active:bg-zinc-700"
                          onClick={() => aplicar(g, id)}
                        >
                          <Baldosa icono={c.icono} color={c.color} tamano="sm" />
                          {c.corto}
                        </button>
                      )
                    })}
                  <button
                    className="flex min-h-9 shrink-0 items-center rounded-full bg-zinc-100 px-3 py-1 text-[13px] font-medium text-marca-700 active:bg-zinc-200 dark:bg-zinc-800 dark:text-marca-500 dark:active:bg-zinc-700"
                    onClick={() => setEligiendo(g)}
                  >
                    Otra…
                  </button>
                </div>
                {abierto === k && (
                  <ul className="divide-y divide-zinc-200/70 border-t border-zinc-200/70 dark:divide-zinc-800 dark:border-zinc-800">
                    {lista.map((m) => (
                      <li key={m.id}>
                        <FilaMovimientoDeslizable m={m} conFecha onPulsar={() => setDetalle(m.id)} />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )
          })}
          <p className="px-4 text-center text-[13px] text-zinc-500">
            Para un cargo suelto de un importe repetido, pulsa «Ver» y elige su categoría en el propio cargo.
          </p>
        </div>
      )}

      <SelectorCategoria
        abierta={!!eligiendo}
        actual={null}
        onElegir={(c) => {
          const g = eligiendo
          setEligiendo(null)
          if (g && c) void aplicar(g, c)
        }}
        onCerrar={() => setEligiendo(null)}
      />
      <DetalleMovimiento id={detalle} onCerrar={() => setDetalle(null)} />
    </>
  )
}
