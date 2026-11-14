import { Wand2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useHacer } from '../componentes/acciones'
import { BarraNavegacion } from '../componentes/Encabezado'
import { BotonClaude, HojaClaude } from '../componentes/HojaClaude'
import { textoPresupuesto } from '../lib/analizar'
import { Baldosa } from '../componentes/Icono'
import { guardarExcepcionPresupuesto, guardarPresupuesto } from '../datos/operaciones'
import { intentar, useDatos } from '../datos/ProveedorDatos'
import { hoyIso, mesLargo, sumarMeses } from '../lib/fechas'
import { formatearImporte, formatearRedondo, leerImporteUsuario, plural } from '../lib/formato'
import { presupuestoAnual, sugerirPresupuestos } from '../lib/presupuesto'
import type { BaseDatos } from '../lib/tipos'

const texto = (n: number | undefined) => (n ? String(n).replace('.', ',') : '')

/**
 * Presupuesto mensual por categoría: un importe por categoría de gasto, con la media de los últimos
 * meses como referencia y «Usar las medias» para empezar. Se guarda al salir de cada campo.
 */
export function Presupuesto() {
  const db = useDatos()
  const hacer = useHacer()
  const mes = hoyIso().slice(0, 7)
  const sugeridos = useMemo(() => sugerirPresupuestos(db, mes), [db, mes])
  const [claude, setClaude] = useState(false)
  const raices = db.categorias.filter((c) => !c.padre_id && c.activa && c.naturaleza === 'gasto').sort((a, b) => a.orden - b.orden)
  const actual = new Map(db.presupuestos.map((p) => [p.categoria_id, p.importe_mensual]))
  const [borrador, setBorrador] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [abierta, setAbierta] = useState<string | null>(null)
  const excepciones = (id: string) => Object.keys(db.presupuestos.find((p) => p.categoria_id === id)?.excepciones ?? {})
  const anual = useMemo(() => presupuestoAnual(db, mes.slice(0, 4), hoyIso()), [db, mes])
  const total = [...actual.values()].reduce((s, x) => s + x, 0)
  const faltan = [...sugeridos.keys()].filter((id) => !actual.has(id))

  // Quita el borrador de un campo una vez guardado
  const limpiar = (id: string) =>
    setBorrador((b) => {
      const n = { ...b }
      delete n[id]
      return n
    })

  const guardar = async (id: string) => {
    const t = borrador[id]
    if (t === undefined) return
    const valor = leerImporteUsuario(t)
    if (t.trim() && valor === null) return setError('Escribe un importe, por ejemplo 250 o 250,50')
    setError(null)
    if ((valor ?? 0) === (actual.get(id) ?? 0)) return limpiar(id)
    const e = await intentar((d) => guardarPresupuesto(d, id, valor), valor ? 'Presupuesto guardado' : 'Presupuesto quitado')
    if (e) setError(e)
    else limpiar(id)
  }

  const usarMedias = () =>
    hacer(
      (d: BaseDatos) => faltan.reduce((acc, id) => guardarPresupuesto(acc, id, sugeridos.get(id)!), d),
      `${plural(faltan.length, 'presupuesto', 'presupuestos')} con la media`,
    )

  return (
    <>
      <BarraNavegacion titulo="Presupuesto" atras="Extracto" subtitulo={total ? `${formatearImporte(total)} al mes en ${plural(actual.size, 'categoría', 'categorías')}` : undefined} />
      <p className="mb-3 px-1 text-[13px] text-zinc-500">
        Un importe al mes por categoría. El Extracto muestra cuánto llevas y cómo cerrará el mes. Los gastos de empleado y los traspasos no cuentan. Deja el campo vacío para
        quitarlo.
      </p>
      {faltan.length > 0 && (
        <button className="boton-primario mb-4 w-full" onClick={usarMedias}>
          <Wand2 className="size-4" strokeWidth={2} /> Usar las medias en {plural(faltan.length, 'categoría', 'categorías')} sin presupuesto
        </button>
      )}
      {error && <p className="mb-3 px-1 text-[13px] text-red-600">{error}</p>}
      <ul className="lista divide-y divide-zinc-200/70 dark:divide-zinc-800">
        {raices.map((c) => {
          const media = sugeridos.get(c.id)
          return (
            <li key={c.id}>
             <div className="fila min-h-14">
              <Baldosa icono={c.icono} color={c.color ?? '#8E8E93'} tamano="sm" />
              <span className="min-w-0 flex-1">
                <label htmlFor={`p-${c.id}`} className="block truncate text-[15px]">
                  {c.nombre}
                </label>
                <span className="block text-[12px] text-zinc-500">
                  {media ? `Media: ${formatearImporte(media)}` : 'Sin gasto reciente'}
                  {'. '}
                  <button type="button" className="text-marca-700 dark:text-marca-500" onClick={() => setAbierta((a) => (a === c.id ? null : c.id))}>
                    {excepciones(c.id).length ? plural(excepciones(c.id).length, 'mes especial', 'meses especiales') : 'Meses especiales'}
                  </button>
                </span>
              </span>
              <span className="flex items-center gap-1">
                <input
                  id={`p-${c.id}`}
                  className="campo w-24 py-1.5 text-right tabular-nums"
                  inputMode="decimal"
                  enterKeyHint="done"
                  placeholder={media ? String(media) : '0'}
                  value={borrador[c.id] ?? texto(actual.get(c.id))}
                  onChange={(e) => setBorrador((b) => ({ ...b, [c.id]: e.target.value }))}
                  onBlur={() => guardar(c.id)}
                  onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                />
                <span className="text-[15px] text-zinc-500">€</span>
              </span>
             </div>
              {abierta === c.id && <MesesEspeciales categoria={c.id} />}
            </li>
          )
        })}
      </ul>

      {anual.lineas.length > 0 && (
        <section className="mt-6">
          <h3 className="cabecera-grupo">
            En {mes.slice(0, 4)}, {plural(anual.meses, 'mes', 'meses')} con datos
          </h3>
          <ul className="lista divide-y divide-zinc-200/70 dark:divide-zinc-800">
            {anual.lineas.map((l) => {
              const pct = l.gastado / l.presupuesto
              return (
                <li key={l.categoria.id} className="px-4 py-2.5">
                  <div className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1 truncate text-[15px]">{l.categoria.nombre}</span>
                    <span className="text-[15px] tabular-nums">
                      {formatearRedondo(l.gastado)} <span className="text-zinc-500">de {formatearRedondo(l.presupuesto)}</span>
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct * 100)}%`, background: COLOR_ESTADO[l.estado] }} />
                  </div>
                  <p className={`mt-1 text-[12px] ${l.estado === 'superado' ? 'text-[#D70015] dark:text-[#FF6961]' : 'text-zinc-500'}`}>
                    {l.estado === 'superado' ? `${formatearRedondo(l.gastado - l.presupuesto)} por encima en el año` : `${formatearRedondo(l.presupuesto - l.gastado)} por debajo en el año`}
                  </p>
                </li>
              )
            })}
          </ul>
          <p className="mt-1 px-4 text-[12px] text-zinc-500">Presupuesto de cada mes (con sus meses especiales) frente a lo gastado. El mes en curso cuenta hasta el último dato importado.</p>
        </section>
      )}
      {total > 0 && (
        <div className="mt-6">
          <BotonClaude onPulsar={() => setClaude(true)} />
        </div>
      )}
      <HojaClaude
        abierta={claude}
        titulo="Analizar con Claude"
        explicacion="Claude revisa si tu presupuesto es realista frente a lo que gastas y cómo repartirlo para ahorrar más."
        texto={claude ? textoPresupuesto(db, mes, hoyIso()) : ''}
        archivo="puchifin-presupuesto.txt"
        registro="Analizar presupuesto"
        onCerrar={() => setClaude(false)}
      />
    </>
  )
}

const COLOR_ESTADO = { dentro: 'var(--serie-3)', cerca: '#FF9500', superado: '#FF3B30' } as const

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
    <div className="space-y-2 border-t border-zinc-200/70 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-800/40">
      {lista.length > 0 && (
        <ul className="space-y-1">
          {lista.map(([m, v]) => (
            <li key={m} className="flex items-center gap-2 text-[15px]">
              <span className="flex-1">{mesLargo(`${m}-01`)}</span>
              <span className="tabular-nums">{formatearImporte(v)}</span>
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
      <div className="flex items-center gap-2">
        <select className="campo flex-1 py-1.5" value={mes} onChange={(e) => setMes(e.target.value)} aria-label="Mes">
          {proximos.map((m) => (
            <option key={m} value={m}>
              {mesLargo(`${m}-01`)}
            </option>
          ))}
        </select>
        <input className="campo w-24 py-1.5 text-right tabular-nums" inputMode="decimal" placeholder="Importe" value={importe} onChange={(e) => setImporte(e.target.value)} aria-label="Importe de ese mes" />
        <button type="button" className="boton-secundario px-3 py-1.5" onClick={anadir}>
          Añadir
        </button>
      </div>
      {error && <p className="text-[13px] text-red-600">{error}</p>}
      <p className="text-[12px] text-zinc-500">Por ejemplo, Viajes en agosto o Hijos en septiembre. Ese mes cuenta este importe en lugar del de siempre.</p>
    </div>
  )
}
