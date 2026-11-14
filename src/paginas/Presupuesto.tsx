import { ChevronRight, Plus, Target, Wand2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useHacer } from '../componentes/acciones'
import { BarraPresupuesto, textoEstado, TONO_ESTADO } from '../componentes/BarraPresupuesto'
import { BarraNavegacion } from '../componentes/Encabezado'
import { BotonClaude, HojaClaude } from '../componentes/HojaClaude'
import { Baldosa } from '../componentes/Icono'
import { Hoja, Segmentado } from '../componentes/Interfaz'
import { guardarExcepcionPresupuesto, guardarPresupuesto } from '../datos/operaciones'
import { useDatos } from '../datos/ProveedorDatos'
import { textoPresupuesto } from '../lib/analizar'
import { movimientosDelPeriodo } from '../lib/csvClaude'
import { fechaDeLosDatos } from '../lib/extracto'
import { hoyIso, mesLargo, sumarMeses } from '../lib/fechas'
import { formatearRedondo, leerImporteUsuario, plural } from '../lib/formato'
import { consumoPresupuestos, margen, presupuestoAnual, sugerirPresupuestos, totalPresupuesto, type EstadoPresupuesto } from '../lib/presupuesto'
import { detectarRecurrentes } from '../lib/recurrentes'
import type { BaseDatos, Categoria } from '../lib/tipos'

const comoTexto = (n: number | undefined) => (n ? String(n).replace('.', ',') : '')

/**
 * Presupuesto (rediseño de la v0.36.0): primero se ve cómo va el mes (el total y cada categoría con su
 * barra y cómo cerrará) y, al tocar una categoría, se cambia su importe o sus meses especiales. Las
 * categorías sin presupuesto quedan detrás de «Añadir». El año, en su propia vista.
 */
export function Presupuesto() {
  const db = useDatos()
  const hacer = useHacer()
  const hoy = hoyIso()
  const mes = hoy.slice(0, 7)
  const recurrentes = useMemo(() => detectarRecurrentes(db), [db])
  const lineas = useMemo(() => consumoPresupuestos(db, mes, hoy, recurrentes), [db, mes, hoy, recurrentes])
  const total = totalPresupuesto(lineas)
  const sugeridos = useMemo(() => sugerirPresupuestos(db, mes), [db, mes])
  const anual = useMemo(() => presupuestoAnual(db, mes.slice(0, 4), hoy), [db, mes, hoy])
  const [vista, setVista] = useState<'mes' | 'anio'>('mes')
  const [editando, setEditando] = useState<string | null>(null)
  const [anadiendo, setAnadiendo] = useState(false)
  const [claude, setClaude] = useState(false)

  const raices = db.categorias.filter((c) => !c.padre_id && c.activa && c.naturaleza === 'gasto').sort((a, b) => a.orden - b.orden)
  const conPresupuesto = new Set(db.presupuestos.map((p) => p.categoria_id))
  const sin = raices.filter((c) => !conPresupuesto.has(c.id))
  // Con presupuesto solo en meses especiales: este mes no cuentan, pero se pueden editar
  const enLista = new Set(lineas.map((l) => l.categoria.id))
  const soloEspeciales = db.presupuestos.map((p) => db.categorias.find((c) => c.id === p.categoria_id && c.activa)).filter((c): c is Categoria => !!c && !enLista.has(c.id))
  const faltan = sin.filter((c) => sugeridos.has(c.id))
  const usarMedias = () =>
    hacer((d: BaseDatos) => faltan.reduce((acc, c) => guardarPresupuesto(acc, c.id, sugeridos.get(c.id)!), d), `${plural(faltan.length, 'presupuesto', 'presupuestos')} con tu media`)

  const dia = Number(fechaDeLosDatos(db, hoy).slice(8, 10))
  const estadoTotal: EstadoPresupuesto = total.gastado - total.presupuesto >= 0.5 ? 'superado' : total.cierre !== null && total.cierre > total.presupuesto + margen(total.presupuesto) ? 'riesgo' : 'dentro'
  const avisos = [total.superadas ? plural(total.superadas, 'superada', 'superadas') : '', total.enRiesgo ? `${total.enRiesgo} camino de pasarse` : ''].filter(Boolean)

  return (
    <>
      <BarraNavegacion
        titulo="Presupuesto"
        atras="Extracto"
        accion={
          sin.length > 0 ? (
            <button className="boton-icono" aria-label="Añadir un presupuesto" onClick={() => setAnadiendo(true)}>
              <Plus className="size-6" strokeWidth={1.75} />
            </button>
          ) : undefined
        }
      />

      {!db.presupuestos.length ? (
        <div className="tarjeta space-y-3 py-8 text-center">
          <Target className="mx-auto size-12 text-zinc-400" strokeWidth={1.5} />
          <p className="text-[17px] font-semibold">Aún no hay presupuesto</p>
          <p className="text-[15px] text-zinc-600 dark:text-zinc-400">
            Un importe al mes por categoría. Verás cuánto llevas, cuánto te queda y cómo cerrará el mes. Los gastos de empleado y los traspasos no cuentan.
          </p>
          {faltan.length > 0 && (
            <button className="boton-primario w-full" onClick={usarMedias}>
              <Wand2 className="size-4" strokeWidth={2} /> Empezar con mis medias ({plural(faltan.length, 'categoría', 'categorías')})
            </button>
          )}
          <button className={faltan.length ? 'boton-secundario w-full' : 'boton-primario w-full'} onClick={() => setAnadiendo(true)}>
            Elegir categorías
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <Segmentado
            etiqueta="Periodo del presupuesto"
            opciones={[
              ['mes', mesLargo(`${mes}-01`).replace(/ de \d+$/, '')],
              ['anio', `Año ${mes.slice(0, 4)}`],
            ]}
            valor={vista}
            onCambio={setVista}
          />

          {vista === 'mes' ? (
            <>
              {lineas.length > 0 && (
                <section className="tarjeta" aria-label="Presupuesto del mes">
                  <h2 className="text-[13px] font-medium text-zinc-500 uppercase">Hasta el día {dia}</h2>
                  <div className="flex items-baseline gap-2">
                    <p className="text-[30px] leading-tight font-bold tracking-tight tabular-nums">{formatearRedondo(total.gastado)}</p>
                    <p className="text-[15px] text-zinc-500 tabular-nums">de {formatearRedondo(total.presupuesto)}</p>
                  </div>
                  <div className="mt-3 flex">
                    <BarraPresupuesto presupuesto={total.presupuesto} gastado={total.gastado} cierre={total.cierre} estado={estadoTotal} etiqueta="Presupuesto del mes" alta />
                  </div>
                  <div className="mt-1.5 flex justify-between gap-2 text-[13px] tabular-nums">
                    <span className={TONO_ESTADO[estadoTotal]}>
                      {estadoTotal === 'superado'
                        ? `Superado en ${formatearRedondo(total.gastado - total.presupuesto)}`
                        : total.cierre !== null
                          ? `Cerrarás en unos ${formatearRedondo(total.cierre)}`
                          : `Quedan ${formatearRedondo(total.presupuesto - total.gastado)}`}
                    </span>
                    <span className={avisos.length ? TONO_ESTADO[total.superadas ? 'superado' : 'riesgo'] : 'text-zinc-500'}>{avisos.length ? avisos.join(', ') : 'Todas van bien'}</span>
                  </div>
                </section>
              )}

              <ul className="lista divide-y divide-zinc-200/70 dark:divide-zinc-800">
                {lineas.map((l) => (
                  <li key={l.categoria.id}>
                    <button className="fila w-full text-left active:bg-zinc-100 dark:active:bg-zinc-800" aria-label={`Presupuesto de ${l.categoria.nombre}`} onClick={() => setEditando(l.categoria.id)}>
                      <Baldosa icono={l.categoria.icono ?? raizDe(db, l.categoria)?.icono} color={l.categoria.color ?? '#8E8E93'} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          <span className="flex-1 truncate text-[15px]">{l.categoria.nombre}</span>
                          <span className="text-[15px] tabular-nums">
                            {formatearRedondo(l.gastado)} <span className="text-[13px] text-zinc-500">de {formatearRedondo(l.presupuesto)}</span>
                          </span>
                        </span>
                        <span className="mt-1.5 flex">
                          <BarraPresupuesto presupuesto={l.presupuesto} gastado={l.gastado} cierre={l.cierre} estado={l.estado} etiqueta={l.categoria.nombre} />
                        </span>
                        <span className={`mt-1 block text-[12px] ${TONO_ESTADO[l.estado]}`}>{textoEstado(l, true)}</span>
                      </span>
                      <ChevronRight className="size-4 shrink-0 text-zinc-400" />
                    </button>
                  </li>
                ))}
                {soloEspeciales.map((c) => (
                  <li key={c.id}>
                    <button className="fila min-h-14 w-full text-left active:bg-zinc-100 dark:active:bg-zinc-800" onClick={() => setEditando(c.id)}>
                      <Baldosa icono={c.icono ?? raizDe(db, c)?.icono} color={c.color ?? '#8E8E93'} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px]">{c.nombre}</span>
                        <span className="block text-[12px] text-zinc-500">Solo en sus meses especiales; este mes no tiene</span>
                      </span>
                      <ChevronRight className="size-4 shrink-0 text-zinc-400" />
                    </button>
                  </li>
                ))}
              </ul>
              <p className="px-4 text-[12px] text-zinc-500">
                La parte clara de cada barra es cómo cerrará el mes: lo gastado, los recibos que faltan y lo que sueles gastar en los días que quedan. Toca una categoría para cambiar
                su importe.
              </p>
            </>
          ) : (
            <VistaAnual anual={anual} anio={mes.slice(0, 4)} />
          )}

          {total.presupuesto > 0 && <BotonClaude onPulsar={() => setClaude(true)} />}
        </div>
      )}

      <HojaPresupuesto categoria={editando} media={editando ? sugeridos.get(editando) : undefined} onCerrar={() => setEditando(null)} />
      <Hoja abierta={anadiendo} titulo="Añadir presupuesto" onCerrar={() => setAnadiendo(false)}>
        <div className="space-y-4">
          {faltan.length > 1 && (
            <button
              className="boton-secundario w-full"
              onClick={async () => {
                if (await usarMedias()) setAnadiendo(false)
              }}
            >
              <Wand2 className="size-4" strokeWidth={2} /> Usar mi media en las {faltan.length} con gasto
            </button>
          )}
          <ul className="lista divide-y divide-zinc-200/70 bg-zinc-100/70 dark:divide-zinc-800 dark:bg-zinc-800/50">
            {sin.map((c) => (
              <li key={c.id}>
                <button
                  className="fila min-h-12 w-full text-left active:bg-zinc-200/60 dark:active:bg-zinc-700/60"
                  onClick={() => {
                    setAnadiendo(false)
                    setEditando(c.id)
                  }}
                >
                  <Baldosa icono={c.icono} color={c.color ?? '#8E8E93'} tamano="sm" />
                  <span className="min-w-0 flex-1 truncate text-[15px]">{c.nombre}</span>
                  <span className="shrink-0 text-[13px] text-zinc-500 tabular-nums">{sugeridos.has(c.id) ? `Media ${formatearRedondo(sugeridos.get(c.id)!)}` : 'Sin gasto reciente'}</span>
                  <ChevronRight className="size-4 shrink-0 text-zinc-400" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </Hoja>
      <HojaClaude
        abierta={claude}
        titulo="Analizar con Claude"
        explicacion="Claude revisa si tu presupuesto es realista frente a lo que gastas y cómo repartirlo para ahorrar más."
        texto={claude ? textoPresupuesto(db, mes, hoy) : ''}
        archivo="puchifin-presupuesto.txt"
        registro="Analizar presupuesto"
        detalle={claude ? { movimientos: movimientosDelPeriodo(db, mes), archivo: `puchifin-movimientos-${mes}.csv` } : undefined}
        onCerrar={() => setClaude(false)}
      />
    </>
  )
}

const raizDe = (db: BaseDatos, c: Categoria) => (c.padre_id ? db.categorias.find((x) => x.id === c.padre_id) : c)

/** Presupuesto acumulado del año frente a lo gastado */
function VistaAnual({ anual, anio }: { anual: ReturnType<typeof presupuestoAnual>; anio: string }) {
  if (!anual.lineas.length) return <p className="tarjeta text-center text-[15px] text-zinc-500">Sin datos de {anio} todavía.</p>
  const presupuesto = anual.lineas.reduce((s, l) => s + l.presupuesto, 0)
  const gastado = anual.lineas.reduce((s, l) => s + l.gastado, 0)
  const estado: EstadoPresupuesto = gastado - presupuesto >= 0.5 ? 'superado' : 'dentro'
  return (
    <>
      <section className="tarjeta" aria-label={`Presupuesto de ${anio}`}>
        <h2 className="text-[13px] font-medium text-zinc-500 uppercase">
          {anio}, {plural(anual.meses, 'mes', 'meses')} con datos
        </h2>
        <div className="flex items-baseline gap-2">
          <p className="text-[30px] leading-tight font-bold tracking-tight tabular-nums">{formatearRedondo(gastado)}</p>
          <p className="text-[15px] text-zinc-500 tabular-nums">de {formatearRedondo(presupuesto)}</p>
        </div>
        <div className="mt-3 flex">
          <BarraPresupuesto presupuesto={presupuesto} gastado={gastado} cierre={null} estado={estado} etiqueta={`Presupuesto de ${anio}`} alta />
        </div>
        <p className={`mt-1.5 text-[13px] tabular-nums ${TONO_ESTADO[estado]}`}>
          {gastado > presupuesto ? `${formatearRedondo(gastado - presupuesto)} por encima en lo que va de año` : `${formatearRedondo(presupuesto - gastado)} por debajo en lo que va de año`}
        </p>
      </section>
      <ul className="lista divide-y divide-zinc-200/70 dark:divide-zinc-800">
        {anual.lineas.map((l) => (
          <li key={l.categoria.id} className="px-4 py-2.5">
            <div className="flex items-baseline gap-2">
              <span className="min-w-0 flex-1 truncate text-[15px]">{l.categoria.nombre}</span>
              <span className="text-[15px] tabular-nums">
                {formatearRedondo(l.gastado)} <span className="text-[13px] text-zinc-500">de {formatearRedondo(l.presupuesto)}</span>
              </span>
            </div>
            <div className="mt-1.5 flex">
              <BarraPresupuesto presupuesto={l.presupuesto} gastado={l.gastado} cierre={null} estado={l.estado} etiqueta={l.categoria.nombre} />
            </div>
            <p className={`mt-1 text-[12px] ${TONO_ESTADO[l.estado]}`}>
              {l.gastado > l.presupuesto ? `${formatearRedondo(l.gastado - l.presupuesto)} por encima` : `${formatearRedondo(l.presupuesto - l.gastado)} por debajo`}
            </p>
          </li>
        ))}
      </ul>
      <p className="px-4 text-[12px] text-zinc-500">El presupuesto de cada mes, con sus meses especiales, frente a lo gastado. El mes en curso cuenta hasta el último dato importado.</p>
    </>
  )
}

/** Importe mensual y meses especiales de una categoría */
function HojaPresupuesto({ categoria, media, onCerrar }: { categoria: string | null; media: number | undefined; onCerrar: () => void }) {
  const db = useDatos()
  const hacer = useHacer()
  const c = categoria ? db.categorias.find((x) => x.id === categoria) : undefined
  const actual = categoria ? db.presupuestos.find((p) => p.categoria_id === categoria) : undefined
  // El borrador se reinicia al abrir otra categoría (ajuste durante el render, sin efecto)
  const [abiertaCon, setAbiertaCon] = useState<string | null>(null)
  const [importe, setImporte] = useState('')
  const [error, setError] = useState<string | null>(null)
  if (categoria && categoria !== abiertaCon) {
    setAbiertaCon(categoria)
    // Una categoría nueva empieza con tu media, lista para guardar
    setImporte(comoTexto(actual?.importe_mensual || media))
    setError(null)
  }
  const cerrar = () => {
    setAbiertaCon(null)
    onCerrar()
  }
  const guardar = async () => {
    if (!c) return
    const valor = leerImporteUsuario(importe)
    if (importe.trim() && valor === null) return setError('Escribe un importe, por ejemplo 250 o 250,50')
    setError(null)
    if ((valor ?? 0) === (actual?.importe_mensual ?? 0)) return cerrar()
    if (await hacer((d) => guardarPresupuesto(d, c.id, valor), valor ? `${c.nombre}: ${formatearRedondo(valor)} al mes` : `${c.nombre}: sin presupuesto mensual`)) cerrar()
  }
  const quitar = async () => {
    if (!c) return
    // Con null se quita el importe mensual; los meses especiales se quitan uno a uno
    if (await hacer((d) => Object.keys(actual?.excepciones ?? {}).reduce((acc, m) => guardarExcepcionPresupuesto(acc, c.id, m, null), guardarPresupuesto(d, c.id, null)), `${c.nombre}: presupuesto quitado`)) cerrar()
  }
  return (
    <Hoja abierta={!!categoria} titulo={c?.nombre ?? ''} onCerrar={cerrar}>
      {c && (
        <div className="space-y-4">
          <div className="lista bg-zinc-100/70 dark:bg-zinc-800/50">
            <label className="fila min-h-12">
              <span className="flex-1 text-[15px]">Al mes</span>
              <input
                className="w-32 bg-transparent text-right text-[17px] tabular-nums outline-none"
                aria-label={`Importe mensual de ${c.nombre}`}
                inputMode="decimal"
                enterKeyHint="done"
                placeholder={media ? String(media) : '0'}
                value={importe}
                onChange={(e) => setImporte(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              />
              <span className="text-[15px] text-zinc-500">€</span>
            </label>
          </div>
          <p className="px-1 text-[13px] text-zinc-500">
            {media ? (
              <>
                Tu media de los últimos meses: {formatearRedondo(media)}.{' '}
                {comoTexto(media) !== importe.trim() && (
                  <button type="button" className="text-marca-700 dark:text-marca-500" onClick={() => setImporte(comoTexto(media))}>
                    Usar la media
                  </button>
                )}
              </>
            ) : (
              'Sin gasto en los últimos meses para proponer un importe.'
            )}
          </p>
          <section>
            <h3 className="mb-1.5 px-1 text-[13px] font-medium text-zinc-500 uppercase">Meses especiales</h3>
            <MesesEspeciales categoria={c.id} />
          </section>
          {error && <p className="px-1 text-[13px] text-[#D70015] dark:text-[#FF6961]">{error}</p>}
          <button className="boton-primario w-full" onClick={guardar}>
            Guardar
          </button>
          {actual && (
            <button className="boton-texto w-full text-red-600 dark:text-red-500" onClick={quitar}>
              Quitar el presupuesto
            </button>
          )}
        </div>
      )}
    </Hoja>
  )
}

/** Meses con un presupuesto distinto para una categoría: los que hay y alta de uno nuevo */
function MesesEspeciales({ categoria }: { categoria: string }) {
  const db = useDatos()
  const hacer = useHacer()
  const p = db.presupuestos.find((x) => x.categoria_id === categoria)
  const lista = Object.entries(p?.excepciones ?? {}).sort(([a], [b]) => a.localeCompare(b))
  const actual = hoyIso().slice(0, 7)
  const proximos = Array.from({ length: 12 }, (_, i) => sumarMeses(`${actual}-01`, i).slice(0, 7))
  const [mes, setMes] = useState(proximos[0])
  const [importe, setImporte] = useState('')
  const [error, setError] = useState<string | null>(null)
  const anadir = async () => {
    const valor = leerImporteUsuario(importe)
    if (valor === null) return setError('Escribe un importe')
    setError(null)
    if (await hacer((d) => guardarExcepcionPresupuesto(d, categoria, mes, valor), `Presupuesto de ${mesLargo(`${mes}-01`).toLowerCase()}`)) setImporte('')
  }
  return (
    <div className="space-y-2 rounded-xl bg-zinc-100/70 px-4 py-3 dark:bg-zinc-800/50">
      {lista.length > 0 && (
        <ul className="space-y-1">
          {lista.map(([m, v]) => (
            <li key={m} className="flex items-center gap-2 text-[15px]">
              <span className="flex-1">{mesLargo(`${m}-01`)}</span>
              <span className="tabular-nums">{formatearRedondo(v)}</span>
              <button
                type="button"
                className="boton-texto px-1 text-red-600 dark:text-red-500"
                onClick={() => hacer((d) => guardarExcepcionPresupuesto(d, categoria, m, null), `Vuelve al importe de siempre en ${mesLargo(`${m}-01`).toLowerCase()}`)}
              >
                Quitar
              </button>
            </li>
          ))}
        </ul>
      )}
      <select className="campo py-1.5" value={mes} onChange={(e) => setMes(e.target.value)} aria-label="Mes">
        {proximos.map((m) => (
          <option key={m} value={m}>
            {mesLargo(`${m}-01`)}
          </option>
        ))}
      </select>
      <div className="flex items-center gap-2">
        <input className="campo min-w-0 flex-1 py-1.5 text-right tabular-nums" inputMode="decimal" placeholder="Importe de ese mes" value={importe} onChange={(e) => setImporte(e.target.value)} aria-label="Importe de ese mes" />
        <button type="button" className="boton-secundario px-3 py-1.5" onClick={anadir}>
          Añadir
        </button>
      </div>
      {error && <p className="text-[13px] text-red-600">{error}</p>}
      <p className="text-[12px] text-zinc-500">Por ejemplo, Viajes en agosto o Hijos en septiembre. Ese mes cuenta este importe en lugar del de siempre.</p>
    </div>
  )
}
