import { Eye, EyeOff, Tag } from 'lucide-react'
import { useState } from 'react'
import { alternarFuera, estaFuera } from '../datos/movimientos'
import { intentar } from '../datos/ProveedorDatos'
import type { Movimiento } from '../lib/tipos'
import { FilaDeslizable, type AccionFila } from './gestos'
import { useInterfaz } from './Interfaz'
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
        izquierda={izquierda}
        derecha={[{ texto: 'Categoría', color: '#007AFF', icono: <Tag className="size-5" strokeWidth={2} />, fn: () => setSelector(true) }]}
      >
        <ContenidoMovimiento m={m} conFecha={conFecha} />
      </FilaDeslizable>
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
