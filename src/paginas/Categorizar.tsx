import { Check, CircleCheck, Sparkles, Tag } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useAcciones } from './categorizarAcciones'
import { BarraNavegacion } from '../componentes/Encabezado'
import { Baldosa } from '../componentes/Icono'
import { FilaInterruptor, useInterfaz } from '../componentes/Interfaz'
import { SelectorCategoria } from '../componentes/movimientos'
import { categoriasRapidas, gruposPendientes, UMBRAL_SEGURA, type GrupoPendiente } from '../datos/categorizar'
import { useDatos } from '../datos/ProveedorDatos'
import { formatearFecha, formatearImporte, plural } from '../lib/formato'
import type { BaseDatos } from '../lib/tipos'

const PAGINA = 30
const claveGrupo = (g: GrupoPendiente) => `${g.signo}|${g.clave}`

function categoriaDe(db: BaseDatos, id: string) {
  const c = db.categorias.find((x) => x.id === id)
  const padre = c?.padre_id ? db.categorias.find((x) => x.id === c.padre_id) : undefined
  return { nombre: padre ? `${padre.nombre}, ${c!.nombre}` : (c?.nombre ?? ''), icono: padre?.icono ?? c?.icono ?? null, color: c?.color ?? '#8E8E93' }
}

/**
 * Categorizar lo pendiente por comercio: cada grupo se resuelve con un toque (aceptar la sugerencia,
 * elegir otra o saltar), con regla para las próximas importaciones y «Deshacer». Pensado para la
 * primera carga, con cientos de movimientos sin categoría.
 */
export function Categorizar() {
  const db = useDatos()
  const { confirmar } = useInterfaz()
  const grupos = useMemo(() => gruposPendientes(db), [db])
  const [regla, setRegla] = useState(true)
  const [saltados, setSaltados] = useState<Set<string>>(new Set())
  const [excluidos, setExcluidos] = useState<Map<string, Set<string>>>(new Map())
  const [abierto, setAbierto] = useState<string | null>(null)
  const [eligiendo, setEligiendo] = useState<GrupoPendiente | null>(null)
  const [limite, setLimite] = useState(PAGINA)
  const acciones = useAcciones(regla)
  // Últimas categorías elegidas en esta sesión: salen primero en los chips de un toque
  const [recientes, setRecientes] = useState<string[]>([])
  const aplicarGrupo = (ids: string[], categoria: string) => {
    setRecientes((r) => [categoria, ...r.filter((x) => x !== categoria)].slice(0, 6))
    return acciones.aplicarGrupo(ids, categoria)
  }
  const aplicarVarios = acciones.aplicarVarios
  const rapidas = useMemo(() => ({ gasto: categoriasRapidas(db, 'gasto', recientes, 5), ingreso: categoriasRapidas(db, 'ingreso', recientes, 5) }), [db, recientes])

  const pendientes = grupos.reduce((s, g) => s + g.movimientos.length, 0)
  const visibles = grupos.filter((g) => !saltados.has(claveGrupo(g)))
  const ocultos = grupos.length - visibles.length
  const idsDe = (g: GrupoPendiente) => {
    const fuera = excluidos.get(claveGrupo(g))
    return g.movimientos.filter((m) => !fuera?.has(m.id)).map((m) => m.id)
  }
  const seguras = visibles.filter((g) => g.sugerencia && g.sugerencia.confianza >= UMBRAL_SEGURA)
  const movSeguras = seguras.reduce((s, g) => s + idsDe(g).length, 0)

  const aceptarSeguras = async () => {
    const ok = await confirmar({
      titulo: 'Aceptar las sugerencias claras',
      texto: `Se categorizan ${plural(movSeguras, 'movimiento', 'movimientos')} de ${plural(seguras.length, 'comercio', 'comercios')} con la categoría que ya usaste en el mismo comercio o en uno que empieza igual${regla ? ', y se crean sus reglas' : ''}. Podrás deshacerlo durante unos segundos.`,
      aceptar: 'Aceptar',
    })
    if (ok) await aplicarVarios(seguras.map((g) => ({ ids: idsDe(g), categoria: g.sugerencia!.categoria_id })), movSeguras)
  }

  return (
    <>
      <BarraNavegacion
        titulo="Categorizar"
        atras="Movimientos"
        subtitulo={pendientes ? `${plural(pendientes, 'movimiento pendiente', 'movimientos pendientes')} en ${plural(grupos.length, 'comercio', 'comercios')}` : undefined}
      />

      {!grupos.length ? (
        <div className="tarjeta space-y-2 py-8 text-center">
          <CircleCheck className="mx-auto size-12 text-[#34C759]" strokeWidth={1.5} />
          <p className="text-[17px] font-semibold">Nada pendiente de categorizar</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="lista">
            <FilaInterruptor texto="Crear reglas" nota="Lo que categorices aquí se aplicará solo en las próximas importaciones" activo={regla} onCambio={setRegla} />
          </div>
          <p className="px-4 text-xs text-zinc-500">
            Agrupados por comercio, de los que más se repiten a los que menos. Nada se categoriza sin que lo confirmes, y lo ya categorizado no se toca.
          </p>

          {seguras.length > 0 && (
            <button className="boton-primario w-full py-3 text-[15px]" onClick={aceptarSeguras}>
              <Sparkles className="size-4" strokeWidth={2} /> Aceptar {plural(seguras.length, 'sugerencia clara', 'sugerencias claras')} ({plural(movSeguras, 'movimiento', 'movimientos')})
            </button>
          )}

          {visibles.slice(0, limite).map((g) => {
            const k = claveGrupo(g)
            const ids = idsDe(g)
            const sug = g.sugerencia ? categoriaDe(db, g.sugerencia.categoria_id) : null
            const fuera = excluidos.get(k) ?? new Set<string>()
            return (
              <section key={k} className="lista">
                <div className="flex items-center gap-3 px-4 pt-3">
                  {sug ? <Baldosa icono={sug.icono} color={sug.color} /> : <Baldosa glifo={Tag} color="#C7C7CC" />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[17px]">{g.nombre}</span>
                    <span className="block text-[13px] text-zinc-500 tabular-nums">
                      {plural(g.movimientos.length, 'movimiento', 'movimientos')}, {formatearImporte(g.total)}
                    </span>
                  </span>
                </div>
                {sug && (
                  <p className="px-4 pt-2 text-[15px]">
                    ¿<span className="font-semibold">{sug.nombre}</span>?
                    <span className="block text-[13px] text-zinc-500">Como «{g.sugerencia!.parecido}»</span>
                  </p>
                )}
                {ids.length > 0 && (
                  <div className="-mb-1 flex gap-2 overflow-x-auto px-4 pt-3 [scrollbar-width:none]">
                    {rapidas[g.signo]
                      .filter((id) => id !== g.sugerencia?.categoria_id)
                      .slice(0, 4)
                      .map((id) => {
                        const c = categoriaDe(db, id)
                        return (
                          <button
                            key={id}
                            className="flex min-h-9 shrink-0 items-center gap-1.5 rounded-full bg-zinc-100 py-1 pr-3 pl-1 text-[13px] active:bg-zinc-200 dark:bg-zinc-800 dark:active:bg-zinc-700"
                            onClick={() => aplicarGrupo(ids, id)}
                          >
                            <Baldosa icono={c.icono} color={c.color} tamano="sm" />
                            {c.nombre.split(', ').pop()}
                          </button>
                        )
                      })}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2 px-4 pt-3 pb-3">
                  {sug && (
                    <button className="boton-primario" disabled={!ids.length} onClick={() => aplicarGrupo(ids, g.sugerencia!.categoria_id)}>
                      <Check className="size-4" strokeWidth={2.5} /> Sí
                    </button>
                  )}
                  <button className={sug ? 'boton-secundario' : 'boton-primario'} disabled={!ids.length} onClick={() => setEligiendo(g)}>
                    {sug ? 'Otra' : 'Elegir categoría'}
                  </button>
                  <button className="boton-texto px-2" onClick={() => setSaltados((s) => new Set(s).add(k))}>
                    Saltar
                  </button>
                  {g.movimientos.length > 1 && (
                    <button className="boton-texto ml-auto px-1" onClick={() => setAbierto((a) => (a === k ? null : k))}>
                      {abierto === k ? 'Ocultar' : `Ver ${g.movimientos.length}`}
                    </button>
                  )}
                </div>
                {(abierto === k || g.movimientos.length === 1) && (
                  <ul className="divide-y divide-zinc-200/70 border-t border-zinc-200/70 dark:divide-zinc-800 dark:border-zinc-800">
                    {g.movimientos.map((m) => {
                      const dentro = !fuera.has(m.id)
                      return (
                        <li key={m.id}>
                          <button
                            className="flex min-h-11 w-full items-center gap-3 px-4 py-1.5 text-left"
                            disabled={g.movimientos.length === 1}
                            onClick={() =>
                              setExcluidos((x) => {
                                const s = new Set(x.get(k) ?? [])
                                if (s.has(m.id)) s.delete(m.id)
                                else s.add(m.id)
                                return new Map(x).set(k, s)
                              })
                            }
                          >
                            {g.movimientos.length > 1 && (
                              <span className={`grid size-[22px] shrink-0 place-items-center rounded-full border-2 ${dentro ? 'border-marca-600 bg-marca-600 text-white' : 'border-zinc-300 dark:border-zinc-600'}`}>
                                {dentro && <Check className="size-3.5" strokeWidth={3} />}
                              </span>
                            )}
                            <span className="min-w-0 flex-1 truncate text-[15px]">{m.concepto_limpio}</span>
                            <span className="text-[13px] text-zinc-500">{formatearFecha(m.fecha_operacion).slice(0, 5)}</span>
                            <span className="w-20 text-right text-[15px] tabular-nums">{formatearImporte(m.importe)}</span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>
            )
          })}

          {visibles.length > limite && (
            <button className="boton-secundario w-full" onClick={() => setLimite((l) => l + PAGINA)}>
              Mostrar más ({visibles.length - limite})
            </button>
          )}
          {ocultos > 0 && (
            <p className="px-4 text-center text-[13px] text-zinc-500">
              {plural(ocultos, 'comercio saltado', 'comercios saltados')}.{' '}
              <button className="font-medium text-marca-700 dark:text-marca-500" onClick={() => setSaltados(new Set())}>
                Volver a mostrar
              </button>
            </p>
          )}
        </div>
      )}

      <SelectorCategoria
        abierta={!!eligiendo}
        permitirNinguna={false}
        onElegir={(c) => {
          const g = eligiendo
          setEligiendo(null)
          if (g && c) void aplicarGrupo(idsDe(g), c)
        }}
        onCerrar={() => setEligiendo(null)}
      />
    </>
  )
}
