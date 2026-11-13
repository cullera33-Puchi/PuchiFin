import { CreditCard, FlaskConical, Landmark } from 'lucide-react'
import { BarraNavegacion } from '../componentes/Encabezado'
import { Baldosa } from '../componentes/Icono'
import { useInterfaz } from '../componentes/Interfaz'
import { intentar, useDatos } from '../datos/ProveedorDatos'
import { deshacerImportacion } from '../importacion/importar'
import { formatearFecha } from '../lib/formato'
import type { OrigenImportacion } from '../lib/tipos'

const ORIGEN: Record<OrigenImportacion, { nombre: string; glifo: typeof Landmark; color: string }> = {
  bbva_cuenta: { nombre: 'BBVA cuenta', glifo: Landmark, color: '#007AFF' },
  bbva_tarjeta: { nombre: 'BBVA tarjeta', glifo: CreditCard, color: '#FF9500' },
  fintonic: { nombre: 'Fintonic', glifo: Landmark, color: '#8E8E93' },
  datos_prueba: { nombre: 'Datos de prueba', glifo: FlaskConical, color: '#FF9500' },
}

/** Registro de importaciones con la opción de deshacer cada una completa */
export function Importaciones() {
  const db = useDatos()
  const { avisar, confirmar } = useInterfaz()
  const lista = [...db.importaciones].sort((a, b) => b.created_at.localeCompare(a.created_at))

  return (
    <>
      <BarraNavegacion titulo="Importaciones" atras="Movimientos" destino="/movimientos" />
      {lista.length === 0 ? (
        <p className="tarjeta text-sm text-zinc-500">Todavía no hay importaciones.</p>
      ) : (
        <ul className="lista divide-y divide-zinc-200/70 dark:divide-zinc-800">
          {lista.map((i) => {
            const o = ORIGEN[i.origen]
            const cuenta = db.cuentas.find((c) => c.id === i.cuenta_id)
            const deshecha = i.estado === 'deshecha'
            return (
              <li key={i.id} className={`flex items-center gap-3 px-4 py-3 ${deshecha ? 'opacity-50' : ''}`}>
                <Baldosa glifo={o.glifo} color={o.color} />
                <div className="min-w-0 flex-1">
                  <p className="text-[15px]">
                    {o.nombre}, {cuenta?.alias ?? '?'}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {formatearFecha(i.created_at)}. {i.movimientos_nuevos} nuevos
                    {i.movimientos_duplicados ? `, ${i.movimientos_duplicados} ya importados` : ''}
                    {i.fecha_desde ? `. Del ${formatearFecha(i.fecha_desde)} al ${formatearFecha(i.fecha_hasta ?? i.fecha_desde)}` : ''}
                    {deshecha ? '. Deshecha' : ''}
                  </p>
                </div>
                {!deshecha && i.origen !== 'datos_prueba' && (
                  <button
                    className="boton-texto text-red-600 dark:text-red-500"
                    onClick={async () => {
                      const ok = await confirmar({
                        titulo: 'Deshacer la importación',
                        texto: `Se quitan sus ${i.movimientos_nuevos} movimientos, sus conciliaciones y los traspasos que emparejó vuelven a su tipo anterior. Se podrá volver a importar el fichero.`,
                        aceptar: 'Deshacer',
                        peligro: true,
                      })
                      if (!ok) return
                      const e = await intentar((d) => deshacerImportacion(d, i.id), 'Importación deshecha')
                      avisar(e ?? 'Importación deshecha')
                    }}
                  >
                    Deshacer
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
      <p className="mt-3 px-4 text-xs text-zinc-500">Los datos de prueba se eliminan desde Ajustes, Herramientas.</p>
    </>
  )
}
