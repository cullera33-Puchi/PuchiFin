import { Briefcase, Tag } from 'lucide-react'
import { useState } from 'react'
import { alternarEmpleado } from '../datos/movimientos'
import { intentar } from '../datos/ProveedorDatos'
import type { Movimiento } from '../lib/tipos'
import { FilaDeslizable } from './gestos'
import { useInterfaz } from './Interfaz'
import { ContenidoMovimiento, HojaCorreccion, SelectorCategoria } from './movimientos'

/**
 * Fila de movimiento con los gestos de la especificación:
 * deslizar a la izquierda marca o desmarca gasto de empleado; a la derecha, cambia la categoría.
 */
export function FilaMovimientoDeslizable({ m, onPulsar, conFecha }: { m: Movimiento; onPulsar: () => void; conFecha?: boolean }) {
  const { avisar } = useInterfaz()
  const [selector, setSelector] = useState(false)
  const [correccion, setCorreccion] = useState<string | null | undefined>(undefined)
  const esEmpleado = m.tipo === 'gasto_empleado'

  const empleado = async () => {
    const e = await intentar((d) => alternarEmpleado(d, m.id), esEmpleado ? 'Gasto de empleado desmarcado' : 'Gasto de empleado marcado')
    if (e) avisar(e)
    else
      avisar(esEmpleado ? 'Vuelve a contar en el extracto' : 'Marcado como gasto de empleado', {
        texto: 'Deshacer',
        fn: () => intentar((d) => alternarEmpleado(d, m.id)),
      })
  }

  return (
    <>
      <FilaDeslizable
        etiqueta={`${m.concepto_limpio}, ${m.importe}`}
        onPulsar={onPulsar}
        derecha={[
          {
            texto: esEmpleado ? 'Personal' : 'Empleado',
            color: esEmpleado ? '#8E8E93' : '#5856D6',
            icono: <Briefcase className="size-5" strokeWidth={2} />,
            fn: empleado,
          },
        ]}
        izquierda={[{ texto: 'Categoría', color: '#007AFF', icono: <Tag className="size-5" strokeWidth={2} />, fn: () => setSelector(true) }]}
      >
        <ContenidoMovimiento m={m} conFecha={conFecha} />
      </FilaDeslizable>
      <SelectorCategoria
        abierta={selector}
        actual={m.categoria_id}
        onElegir={(c) => {
          setSelector(false)
          if (c !== m.categoria_id) setCorreccion(c)
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
