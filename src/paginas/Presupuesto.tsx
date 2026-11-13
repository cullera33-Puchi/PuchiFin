import { Wand2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useHacer } from '../componentes/acciones'
import { BarraNavegacion } from '../componentes/Encabezado'
import { Baldosa } from '../componentes/Icono'
import { guardarPresupuesto } from '../datos/operaciones'
import { intentar, useDatos } from '../datos/ProveedorDatos'
import { hoyIso } from '../lib/fechas'
import { formatearImporte, leerImporteUsuario, plural } from '../lib/formato'
import { sugerirPresupuestos } from '../lib/presupuesto'
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
  const raices = db.categorias.filter((c) => !c.padre_id && c.activa && c.naturaleza === 'gasto').sort((a, b) => a.orden - b.orden)
  const actual = new Map(db.presupuestos.map((p) => [p.categoria_id, p.importe_mensual]))
  const [borrador, setBorrador] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const total = [...actual.values()].reduce((s, x) => s + x, 0)
  const faltan = [...sugeridos.keys()].filter((id) => !actual.has(id))

  const guardar = async (id: string) => {
    const t = borrador[id]
    if (t === undefined) return
    const valor = leerImporteUsuario(t)
    if (t.trim() && valor === null) return setError('Escribe un importe, por ejemplo 250 o 250,50')
    setError(null)
    if ((valor ?? 0) === (actual.get(id) ?? 0)) return setBorrador(({ [id]: _, ...resto }) => resto)
    const e = await intentar((d) => guardarPresupuesto(d, id, valor), valor ? 'Presupuesto guardado' : 'Presupuesto quitado')
    if (e) setError(e)
    else setBorrador(({ [id]: _, ...resto }) => resto)
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
            <li key={c.id} className="fila min-h-14">
              <Baldosa icono={c.icono} color={c.color ?? '#8E8E93'} tamano="sm" />
              <label htmlFor={`p-${c.id}`} className="min-w-0 flex-1">
                <span className="block truncate text-[15px]">{c.nombre}</span>
                <span className="block text-[12px] text-zinc-500">{media ? `Media: ${formatearImporte(media)}` : 'Sin gasto reciente'}</span>
              </label>
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
            </li>
          )
        })}
      </ul>
    </>
  )
}
