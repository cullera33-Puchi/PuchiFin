import { Briefcase, User } from 'lucide-react'
import { useMemo } from 'react'
import { BarraNavegacion } from '../componentes/Encabezado'
import { FilaDeslizable } from '../componentes/gestos'
import { useInterfaz } from '../componentes/Interfaz'
import { ContenidoMovimiento } from '../componentes/movimientos'
import { cambiarTipo, marcarPersonal } from '../datos/movimientos'
import { intentar, useDatos } from '../datos/ProveedorDatos'
import { candidatosEmpleado } from '../importacion/empleado'

/**
 * Revisión rápida de posibles gastos de empleado: deslizar a la izquierda los marca como de empleado
 * (no cuentan en el extracto y quedan pendientes de reembolso); a la derecha, como personales.
 * Cada decisión enseña a la app sobre ese comercio.
 */
export function RevisarEmpleado() {
  const db = useDatos()
  const { avisar, confirmar } = useInterfaz()
  const candidatos = useMemo(() => candidatosEmpleado(db), [db])
  const muyProbables = candidatos.filter((c) => c.puntuacion >= 0.75)

  const decidir = async (ids: string[], empleado: boolean) => {
    const e = await intentar((d) => (empleado ? cambiarTipo(d, ids, 'gasto_empleado') : marcarPersonal(d, ids)), empleado ? 'Gastos de empleado marcados' : 'Revisados como personales')
    if (e) return avisar(e)
    avisar(ids.length === 1 ? (empleado ? 'Gasto de empleado' : 'Personal') : `${ids.length} marcados como gasto de empleado`, {
      texto: 'Deshacer',
      fn: () =>
        intentar((d) => {
          const r = cambiarTipo(d, ids, 'normal')
          return { ...r, movimientos: r.movimientos.map((m) => (ids.includes(m.id) ? { ...m, revisado_empleado: false } : m)) }
        }),
    })
  }

  return (
    <>
      <BarraNavegacion
        titulo="Posibles gastos de empleado"
        atras="Empleado"
        subtitulo={candidatos.length ? `${candidatos.length} por revisar, de más a menos probable` : undefined}
        accion={
          muyProbables.length > 1 ? (
            <button
              className="boton-texto"
              onClick={async () => {
                const ok = await confirmar({
                  titulo: 'Marcar los muy probables',
                  texto: `Se marcan como gasto de empleado ${muyProbables.length} movimientos con probabilidad alta. Se puede deshacer.`,
                  aceptar: 'Marcar',
                })
                if (ok) decidir(muyProbables.map((c) => c.m.id), true)
              }}
            >
              Marcar {muyProbables.length} muy probables
            </button>
          ) : undefined
        }
      />
      {candidatos.length === 0 ? (
        <p className="tarjeta text-sm text-zinc-500">Nada por revisar. Cuando importes, la app buscará cafeterías, taxis y restaurantes que parezcan de trabajo.</p>
      ) : (
        <>
          <p className="mb-3 px-4 text-xs text-zinc-500">Desliza a la izquierda si es de empleado y a la derecha si es personal. La app aprende de cada comercio.</p>
          <ul className="lista divide-y divide-zinc-200/70 dark:divide-zinc-800">
            {candidatos.map(({ m, puntuacion, motivos }) => (
              <li key={m.id}>
                <FilaDeslizable
                  etiqueta={m.concepto_limpio}
                  derecha={[{ texto: 'Empleado', color: '#5856D6', icono: <Briefcase className="size-5" strokeWidth={2} />, fn: () => decidir([m.id], true) }]}
                  izquierda={[{ texto: 'Personal', color: '#8E8E93', icono: <User className="size-5" strokeWidth={2} />, fn: () => decidir([m.id], false) }]}
                >
                  <ContenidoMovimiento m={m} conFecha />
                  <p className="-mt-1.5 flex items-center gap-2 pr-4 pb-2 pl-[60px] text-[11px] text-zinc-500">
                    <span className={`shrink-0 rounded-full px-1.5 py-px font-medium ${puntuacion >= 0.75 ? 'bg-[#5856D6] text-white' : 'bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200'}`}>
                      {puntuacion >= 0.75 ? 'Muy probable' : 'Probable'}
                    </span>
                    <span className="truncate">{motivos.join(', ')}</span>
                  </p>
                </FilaDeslizable>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}
