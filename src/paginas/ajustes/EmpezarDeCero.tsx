import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useHacer } from '../../componentes/acciones'
import { FilaInterruptor, Hoja, useInterfaz } from '../../componentes/Interfaz'
import { empezarDeCero } from '../../datos/operaciones'
import { useDatos } from '../../datos/ProveedorDatos'
import { hacerCopia } from '../../lib/copias'
import { plural } from '../../lib/formato'
import { registrar } from '../../lib/registro'

/** Borrar lo cargado para una carga limpia, con copia previa y Deshacer */
export function SeccionEmpezarDeCero() {
  const db = useDatos()
  const hacer = useHacer()
  const { confirmar } = useInterfaz()
  const [abierta, setAbierta] = useState(false)
  const [conservarReglas, setConservarReglas] = useState(true)
  const [inicial, setInicial] = useState(false)
  const misReglas = db.reglas.filter((r) => r.origen !== 'sistema').length
  const n = db.movimientos.length

  const borrar = async () => {
    const ok = await confirmar({
      titulo: 'Empezar de cero',
      texto: `Se borran ${plural(n, 'movimiento', 'movimientos')} y ${plural(db.importaciones.length, 'importación', 'importaciones')}${
        inicial ? ', y la configuración vuelve a la inicial' : !conservarReglas && misReglas ? `, y ${plural(misReglas, 'regla tuya', 'reglas tuyas')}` : ''
      }. Antes se guarda una copia que puedes restaurar en Copias de seguridad.`,
      aceptar: 'Borrar',
      peligro: true,
    })
    if (!ok) return
    await hacerCopia('antes de borrar')
    const hecho = await hacer((d) => empezarDeCero(d, { conservarReglas, configuracionInicial: inicial }), 'Datos borrados. Listo para una carga limpia')
    if (hecho) {
      registrar('info', 'Empezar de cero', { movimientos: n, conservarReglas, inicial })
      setAbierta(false)
    }
  }

  return (
    <section className="tarjeta space-y-3">
      <div>
        <h2 className="text-sm font-semibold">Empezar de cero</h2>
        <p className="mt-0.5 text-xs text-zinc-500">Borra lo cargado para hacer una carga limpia. Antes se guarda una copia de seguridad.</p>
      </div>
      <button className="boton-secundario text-red-600 dark:text-red-500" disabled={!n && !db.importaciones.length} onClick={() => setAbierta(true)}>
        <Trash2 className="size-4" strokeWidth={2} /> Borrar los movimientos…
      </button>
      <Hoja abierta={abierta} titulo="Empezar de cero" listo="Cancelar" onCerrar={() => setAbierta(false)}>
        <div className="space-y-4">
          <p className="text-[15px] text-zinc-600 dark:text-zinc-400">
            Se borran {plural(n, 'movimiento', 'movimientos')}, sus importaciones y las conciliaciones de reembolsos. Se conservan las cuentas, las categorías y los ajustes, como el
            nombre de tu empresa.
          </p>
          <div className="lista divide-y divide-zinc-200/70 bg-zinc-100/70 dark:divide-zinc-800 dark:bg-zinc-800/50">
            <div className="px-4 py-2.5">
              <FilaInterruptor
                texto={`Conservar mis reglas${misReglas ? ` (${misReglas})` : ''}`}
                nota="Las que creaste al categorizar o importaste. Las de la app se conservan siempre"
                activo={conservarReglas && !inicial}
                onCambio={setConservarReglas}
              />
            </div>
            <div className="px-4 py-2.5">
              <FilaInterruptor texto="Volver a la configuración inicial" nota="También cuentas, categorías, reglas y ajustes, como el primer día" activo={inicial} onCambio={setInicial} />
            </div>
          </div>
          <button className="boton w-full bg-red-600 py-3 text-[17px] text-white hover:bg-red-500" onClick={borrar}>
            Borrar {plural(n, 'movimiento', 'movimientos')}
          </button>
        </div>
      </Hoja>
    </section>
  )
}
