import { Check, ChevronRight, CircleCheck } from 'lucide-react'
import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { BarraNavegacion } from '../componentes/Encabezado'
import { useDatos } from '../datos/ProveedorDatos'
import { pasosCierre } from '../lib/cierre'
import { ultimaExportacion } from '../lib/copias'
import { hoyIso, mesLargo, sumarMeses } from '../lib/fechas'

/** Cierre de mes guiado: los pasos para dar el mes por bueno, con su estado y dónde se resuelven */
export function Cierre() {
  const db = useDatos()
  const [params] = useSearchParams()
  const mes = params.get('mes') ?? sumarMeses(`${hoyIso().slice(0, 7)}-01`, -1).slice(0, 7)
  const pasos = useMemo(() => pasosCierre(db, mes, ultimaExportacion()), [db, mes])
  const hechos = pasos.filter((p) => p.hecho).length
  const nombre = mesLargo(`${mes}-01`).split(' de ')[0].toLowerCase()
  const listo = hechos === pasos.length

  return (
    <>
      <BarraNavegacion titulo={`Cierre de ${nombre}`} atras="Extracto" subtitulo={`${hechos} de ${pasos.length} pasos hechos`} />
      {listo ? (
        <div className="tarjeta mb-4 space-y-2 py-6 text-center">
          <CircleCheck className="mx-auto size-12 text-[#34C759]" strokeWidth={1.5} />
          <p className="text-[17px] font-semibold">{mesLargo(`${mes}-01`)}, cerrado</p>
          <p className="text-[13px] text-zinc-500">Datos completos, cuadrados con el banco, todo categorizado y con copia.</p>
        </div>
      ) : (
        <p className="mb-3 px-1 text-[13px] text-zinc-500">Sigue los pasos en orden. Cada uno se marca solo cuando está hecho.</p>
      )}
      <ol className="lista divide-y divide-zinc-200/70 dark:divide-zinc-800">
        {pasos.map((p, i) => {
          const contenido = (
            <>
              <span
                className={`grid size-7 shrink-0 place-items-center rounded-full text-[13px] font-semibold ${p.hecho ? 'bg-[#34C759] text-white' : 'border-2 border-zinc-300 text-zinc-500 dark:border-zinc-600'}`}
                aria-hidden
              >
                {p.hecho ? <Check className="size-4" strokeWidth={3} /> : i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block text-[15px] ${p.hecho ? 'text-zinc-500' : ''}`}>{p.titulo}</span>
                <span className="block text-[12px] text-zinc-500">{p.detalle}</span>
              </span>
              {p.enlace && <ChevronRight className="size-4 shrink-0 text-zinc-400" />}
            </>
          )
          return (
            <li key={p.clave}>
              {p.enlace ? (
                <Link to={p.enlace} className="fila min-h-14 active:bg-zinc-100 dark:active:bg-zinc-800" aria-label={`${p.titulo}: ${p.detalle}`}>
                  {contenido}
                </Link>
              ) : (
                <div className="fila min-h-14" aria-label={`${p.titulo}: hecho`}>
                  {contenido}
                </div>
              )}
            </li>
          )
        })}
      </ol>
    </>
  )
}
