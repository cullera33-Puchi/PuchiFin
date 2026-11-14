import { Eye, EyeOff, NotebookPen, Search, Tag } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { claveComercio } from '../lib/conceptos'
import { formatearFecha, formatearImporte } from '../lib/formato'
import { useState } from 'react'
import { alternarFuera, estaFuera } from '../datos/movimientos'
import { intentar } from '../datos/ProveedorDatos'
import type { Movimiento } from '../lib/tipos'
import { FilaDeslizable, type AccionFila } from './gestos'
import { Hoja, useInterfaz } from './Interfaz'
import { ContenidoMovimiento, HojaCorreccion, SelectorCategoria, useElegirCategoria } from './movimientos'

/**
 * Fila de movimiento con los gestos de la app:
 * deslizar hacia la derecha (desde la izquierda) lo saca del extracto o lo devuelve: un gasto queda
 * como gasto de empleado y un ingreso como reembolso; hacia la izquierda, cambia la categoría.
 */
export function FilaMovimientoDeslizable({ m, onPulsar, conFecha }: { m: Movimiento; onPulsar: () => void; conFecha?: boolean }) {
  const { avisar } = useInterfaz()
  const [selector, setSelector] = useState(false)
  const [correccion, setCorreccion] = useState<string | null | undefined>(undefined)
  const [menu, setMenu] = useState(false)
  const navegar = useNavigate()
  const fuera = estaFuera(m)
  const elegir = useElegirCategoria([m.id], setCorreccion)

  const alternar = async () => {
    const e = await intentar((d) => alternarFuera(d, m.id), fuera ? 'Vuelve a contar' : 'Fuera del extracto')
    if (e) avisar(e)
    else
      avisar(fuera ? 'Vuelve a contar en el extracto' : m.importe < 0 ? 'Gasto de empleado: no cuenta' : 'Reembolso: no cuenta', {
        texto: 'Deshacer',
        fn: () => intentar((d) => alternarFuera(d, m.id)),
      })
  }

  // Los traspasos y pagos de deuda se cambian en el detalle
  const izquierda: AccionFila[] =
    m.tipo === 'normal' || fuera
      ? [
          {
            texto: fuera ? 'Cuenta' : 'No cuenta',
            color: fuera ? '#8E8E93' : '#5856D6',
            icono: fuera ? <Eye className="size-5" strokeWidth={2} /> : <EyeOff className="size-5" strokeWidth={2} />,
            fn: alternar,
          },
        ]
      : []

  return (
    <>
      <FilaDeslizable
        etiqueta={`${m.concepto_limpio}, ${m.importe}`}
        onPulsar={onPulsar}
        onPulsacionLarga={() => setMenu(true)}
        izquierda={izquierda}
        derecha={[{ texto: 'Categoría', color: '#007AFF', icono: <Tag className="size-5" strokeWidth={2} />, fn: () => setSelector(true) }]}
      >
        <ContenidoMovimiento m={m} conFecha={conFecha} />
      </FilaDeslizable>
      <Hoja abierta={menu} titulo={m.concepto_limpio} onCerrar={() => setMenu(false)}>
        <p className="-mt-2 mb-3 text-center text-[13px] text-zinc-500 tabular-nums">
          {formatearFecha(m.fecha_operacion)}, {formatearImporte(m.importe)}
        </p>
        <ul className="lista divide-y divide-zinc-200/70 bg-zinc-100/70 dark:divide-zinc-800 dark:bg-zinc-800/50">
          {[
            { texto: 'Cambiar la categoría', icono: Tag, fn: () => setSelector(true) },
            ...(izquierda.length ? [{ texto: fuera ? 'Que vuelva a contar' : 'Que no cuente', icono: fuera ? Eye : EyeOff, fn: alternar }] : []),
            { texto: 'Nota y detalle', icono: NotebookPen, fn: onPulsar },
            { texto: 'Ver los del mismo comercio', icono: Search, fn: () => navegar(`/movimientos?q=${encodeURIComponent(claveComercio(m.concepto_limpio) || m.concepto_normalizado)}`) },
          ].map((o) => (
            <li key={o.texto}>
              <button
                className="fila min-h-12 w-full text-[17px] active:bg-zinc-200/60 dark:active:bg-zinc-700/60"
                onClick={() => {
                  setMenu(false)
                  o.fn()
                }}
              >
                <o.icono className="size-5 text-marca-700 dark:text-marca-500" strokeWidth={1.75} />
                <span className="flex-1 text-left">{o.texto}</span>
              </button>
            </li>
          ))}
        </ul>
      </Hoja>
      <SelectorCategoria
        abierta={selector}
        actual={m.categoria_id}
        onElegir={(c) => {
          setSelector(false)
          if (c !== m.categoria_id) void elegir(c)
        }}
        onCerrar={() => setSelector(false)}
      />
      <HojaCorreccion
        ids={correccion !== undefined ? [m.id] : null}
        categoria={correccion ?? null}
        onCerrar={() => setCorreccion(undefined)}
        onHecho={() => {
          setCorreccion(undefined)
        }}
      />
    </>
  )
}
