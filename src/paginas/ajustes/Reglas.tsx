import { Trash2 } from 'lucide-react'
import { BarraNavegacion } from '../../componentes/Encabezado'
import { useHacer } from '../../componentes/acciones'
import { Interruptor, useInterfaz } from '../../componentes/Interfaz'
import { activarRegla, borrarRegla } from '../../datos/reglas'
import { intentar, useDatos } from '../../datos/ProveedorDatos'
import { NOMBRE_TIPO_MOVIMIENTO, type Regla } from '../../lib/tipos'
import { nombreCategoria } from '../../lib/vista'

/** Reglas de categorización: las creadas al corregir, las sugerencias y las de la app */
export function Reglas() {
  const db = useDatos()
  const { avisar } = useInterfaz()
  const hacer = useHacer()
  const grupos: [string, string, Regla[]][] = [
    ['Tus reglas', 'Se crean al corregir una categoría con «Crear una regla». Se aplican antes que las de la app.', db.reglas.filter((r) => r.origen !== 'sistema')],
    ['Sugerencias', 'Proponen gastos de empleado, reembolsos y pagos de deuda en la revisión de cada importación. Con 3 descartes sin ninguna confirmación se desactivan solas.', db.reglas.filter((r) => r.origen === 'sistema' && r.es_sugerencia)],
    ['Reglas de la app', 'Comercios y recibos habituales. Se pueden desactivar.', db.reglas.filter((r) => r.origen === 'sistema' && !r.es_sugerencia)],
  ]

  const fila = (r: Regla) => {
    const asigna = [r.categoria_id ? nombreCategoria(db, r.categoria_id) : null, r.tipo_movimiento ? NOMBRE_TIPO_MOVIMIENTO[r.tipo_movimiento] : null].filter(Boolean).join(', ')
    return (
      <li key={r.id} className={`flex items-center gap-3 px-4 py-2.5 ${r.activa ? '' : 'opacity-50'}`}>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px]">{r.nombre ?? `«${r.patron}»`}</p>
          <p className="truncate text-xs text-zinc-500">
            {asigna}
            {r.es_sugerencia ? `. ${r.confirmaciones} confirmadas, ${r.descartes} descartadas` : ''}
          </p>
        </div>
        {r.origen !== 'sistema' && (
          <button
            className="boton-icono text-red-600 dark:text-red-500"
            aria-label="Borrar regla"
            onClick={() => hacer((d) => borrarRegla(d, r.id), 'Regla borrada')}
          >
            <Trash2 className="size-5" strokeWidth={1.75} />
          </button>
        )}
        <Interruptor etiqueta={`Activa: ${r.nombre ?? r.patron}`} activo={r.activa} onCambio={async (v) => {
          const e = await intentar((d) => activarRegla(d, r.id, v), v ? 'Regla activada' : 'Regla desactivada')
          if (e) avisar(e)
        }} />
      </li>
    )
  }

  return (
    <>
      <BarraNavegacion titulo="Reglas" atras="Ajustes" destino="/ajustes/general" />
      <div className="space-y-5">
        {grupos.map(([titulo, nota, reglas]) => (
          <section key={titulo}>
            <h3 className="mb-1 px-4 text-[13px] font-medium text-zinc-500 uppercase">{titulo}</h3>
            <p className="mb-1.5 px-4 text-xs text-zinc-500">{nota}</p>
            {reglas.length ? <ul className="lista divide-y divide-zinc-200/70 dark:divide-zinc-800">{reglas.map(fila)}</ul> : <p className="tarjeta text-sm text-zinc-500">Ninguna todavía.</p>}
          </section>
        ))}
      </div>
    </>
  )
}
