import { ChevronDown, ChevronRight, Pencil, Plus } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Aviso } from '../../componentes/Encabezado'
import { mensajeError, supabase } from '../../lib/supabase'
import type { Categoria, Naturaleza } from '../../lib/tipos'

interface Arbol {
  raiz: Categoria
  hijas: Categoria[]
}

export function Categorias() {
  const [categorias, setCategorias] = useState<Categoria[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set())
  const [editando, setEditando] = useState<string | null>(null)
  const [nuevaEn, setNuevaEn] = useState<string | 'raiz' | null>(null)
  const [verInactivas, setVerInactivas] = useState(false)

  const cargar = useCallback(async () => {
    const { data, error: e } = await supabase.from('categorias').select('*').order('orden').order('nombre')
    if (e) setError(mensajeError(e))
    else setCategorias(data as Categoria[])
  }, [])

  useEffect(() => {
    // Carga asíncrona: el estado se actualiza al llegar la respuesta de Supabase
    // oxlint-disable-next-line react/set-state-in-effect
    cargar()
  }, [cargar])

  const arbol: Arbol[] = useMemo(() => {
    const todas = (categorias ?? []).filter((c) => verInactivas || c.activa)
    return todas
      .filter((c) => !c.padre_id)
      .map((raiz) => ({ raiz, hijas: todas.filter((c) => c.padre_id === raiz.id) }))
  }, [categorias, verInactivas])

  const alternar = (id: string) =>
    setAbiertas((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const crear = async (nombre: string, padre: Categoria | null, naturaleza: Naturaleza): Promise<string | null> => {
    const hermanas = (categorias ?? []).filter((c) => c.padre_id === (padre?.id ?? null))
    const { error: e } = await supabase.from('categorias').insert({
      nombre: nombre.trim(),
      padre_id: padre?.id ?? null,
      naturaleza,
      color: padre?.color ?? '#607D8B',
      icono: padre ? null : '🏷️',
      orden: hermanas.length + 1,
    })
    if (e) return mensajeError(e)
    setNuevaEn(null)
    if (padre) setAbiertas((s) => new Set(s).add(padre.id))
    await cargar()
    return null
  }

  const total = categorias?.filter((c) => !c.padre_id && c.activa).length ?? 0

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-zinc-500">{total} categorías activas</p>
        <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
          <input type="checkbox" checked={verInactivas} onChange={(e) => setVerInactivas(e.target.checked)} />
          Mostrar inactivas
        </label>
      </div>
      {error && <Aviso>{error}</Aviso>}

      <ul className="tarjeta divide-y divide-zinc-100 p-0 dark:divide-zinc-800">
        {arbol.map(({ raiz, hijas }) => {
          const abierta = abiertas.has(raiz.id)
          return (
            <li key={raiz.id}>
              {editando === raiz.id ? (
                <Editor categoria={raiz} todas={categorias ?? []} onFin={() => { setEditando(null); cargar() }} />
              ) : (
                <div className={`flex items-center gap-3 px-4 py-3 ${raiz.activa ? '' : 'opacity-50'}`}>
                  <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => alternar(raiz.id)}>
                    {abierta ? <ChevronDown className="size-4 text-zinc-400" /> : <ChevronRight className="size-4 text-zinc-400" />}
                    <span
                      className="grid size-8 shrink-0 place-items-center rounded-lg text-base"
                      style={{ backgroundColor: `${raiz.color ?? '#607D8B'}22` }}
                    >
                      {raiz.icono}
                    </span>
                    <span className="truncate font-medium">{raiz.nombre}</span>
                    {raiz.naturaleza === 'ingreso' && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200">
                        Ingreso
                      </span>
                    )}
                    <span className="ml-auto text-xs text-zinc-400">{hijas.length}</span>
                  </button>
                  <button className="boton-secundario px-2" aria-label={`Editar ${raiz.nombre}`} onClick={() => setEditando(raiz.id)}>
                    <Pencil className="size-4" />
                  </button>
                </div>
              )}

              {abierta && (
                <ul className="border-t border-zinc-100 bg-zinc-50/60 py-1 dark:border-zinc-800 dark:bg-zinc-950/40">
                  {hijas.map((h) =>
                    editando === h.id ? (
                      <li key={h.id}>
                        <Editor categoria={h} todas={categorias ?? []} onFin={() => { setEditando(null); cargar() }} />
                      </li>
                    ) : (
                      <li key={h.id} className={`flex items-center gap-3 py-1.5 pr-4 pl-14 ${h.activa ? '' : 'opacity-50'}`}>
                        <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: h.color ?? raiz.color ?? '#607D8B' }} />
                        <span className="flex-1 truncate text-sm">{h.nombre}</span>
                        <button
                          className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-800"
                          aria-label={`Editar ${h.nombre}`}
                          onClick={() => setEditando(h.id)}
                        >
                          <Pencil className="size-3.5" />
                        </button>
                      </li>
                    ),
                  )}
                  <li className="py-1.5 pr-4 pl-14">
                    {nuevaEn === raiz.id ? (
                      <NuevaCategoria
                        placeholder="Nombre de la subcategoría"
                        onCrear={(n) => crear(n, raiz, raiz.naturaleza)}
                        onCancelar={() => setNuevaEn(null)}
                      />
                    ) : (
                      <button className="flex items-center gap-1 text-sm text-marca-700 hover:underline dark:text-marca-500" onClick={() => setNuevaEn(raiz.id)}>
                        <Plus className="size-3.5" /> Añadir subcategoría
                      </button>
                    )}
                  </li>
                </ul>
              )}
            </li>
          )
        })}
      </ul>

      {nuevaEn === 'raiz' ? (
        <div className="tarjeta">
          <NuevaCategoria
            placeholder="Nombre de la categoría"
            conNaturaleza
            onCrear={(n, nat) => crear(n, null, nat)}
            onCancelar={() => setNuevaEn(null)}
          />
        </div>
      ) : (
        <button className="boton-primario" onClick={() => setNuevaEn('raiz')}>
          <Plus className="size-4" /> Nueva categoría
        </button>
      )}
    </div>
  )
}

function NuevaCategoria({
  placeholder,
  conNaturaleza,
  onCrear,
  onCancelar,
}: {
  placeholder: string
  conNaturaleza?: boolean
  onCrear: (nombre: string, naturaleza: Naturaleza) => Promise<string | null>
  onCancelar: () => void
}) {
  const [nombre, setNombre] = useState('')
  const [naturaleza, setNaturaleza] = useState<Naturaleza>('gasto')
  const [error, setError] = useState<string | null>(null)

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    if (!nombre.trim()) return
    setError(await onCrear(nombre, naturaleza))
  }

  return (
    <form onSubmit={enviar} className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <input className="campo min-w-40 flex-1" autoFocus value={nombre} maxLength={60} placeholder={placeholder} onChange={(e) => setNombre(e.target.value)} />
        {conNaturaleza && (
          <select className="campo w-auto" value={naturaleza} onChange={(e) => setNaturaleza(e.target.value as Naturaleza)}>
            <option value="gasto">Gasto</option>
            <option value="ingreso">Ingreso</option>
          </select>
        )}
        <button type="submit" className="boton-primario">Crear</button>
        <button type="button" className="boton-secundario" onClick={onCancelar}>Cancelar</button>
      </div>
      {error && <Aviso>{error}</Aviso>}
    </form>
  )
}

function Editor({ categoria, todas, onFin }: { categoria: Categoria; todas: Categoria[]; onFin: () => void }) {
  const [nombre, setNombre] = useState(categoria.nombre)
  const [icono, setIcono] = useState(categoria.icono ?? '')
  const [color, setColor] = useState(categoria.color ?? '#607D8B')
  const [activa, setActiva] = useState(categoria.activa)
  const [destino, setDestino] = useState('')
  const [error, setError] = useState<string | null>(null)
  const esRaiz = !categoria.padre_id

  // Destinos posibles de una fusión: cualquier otra categoría o subcategoría activa,
  // salvo las propias subcategorías de la que se fusiona.
  const destinos = todas.filter((c) => c.activa && c.id !== categoria.id && c.padre_id !== categoria.id)
  const nombreCompleto = (c: Categoria) => {
    const padre = todas.find((p) => p.id === c.padre_id)
    return padre ? `${padre.nombre} > ${c.nombre}` : c.nombre
  }

  const guardar = async (e: FormEvent) => {
    e.preventDefault()
    const { error: err } = await supabase
      .from('categorias')
      .update({ nombre: nombre.trim(), icono: esRaiz ? icono || null : categoria.icono, color, activa })
      .eq('id', categoria.id)
    if (err) setError(mensajeError(err))
    else onFin()
  }

  const fusionar = async () => {
    const d = todas.find((c) => c.id === destino)
    if (!d) return
    const ok = window.confirm(
      `Se moverán los movimientos, reglas y presupuestos de "${categoria.nombre}" a "${nombreCompleto(d)}" y se borrará "${categoria.nombre}". ¿Continuar?`,
    )
    if (!ok) return
    const { error: err } = await supabase.rpc('fusionar_categoria', { id_origen: categoria.id, id_destino: destino })
    if (err) setError(mensajeError(err))
    else onFin()
  }

  return (
    <form onSubmit={guardar} className={`space-y-3 bg-marca-50/50 px-4 py-3 dark:bg-marca-900/20 ${esRaiz ? '' : 'pl-14'}`}>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <label>
          <span className="etiqueta">Nombre</span>
          <input className="campo" value={nombre} maxLength={60} onChange={(e) => setNombre(e.target.value)} />
        </label>
        {esRaiz && (
          <label>
            <span className="etiqueta">Icono</span>
            <input className="campo w-20 text-center" value={icono} maxLength={4} onChange={(e) => setIcono(e.target.value)} />
          </label>
        )}
        <label>
          <span className="etiqueta">Color</span>
          <input type="color" className="h-[42px] w-16 cursor-pointer rounded-lg border border-zinc-300 bg-white p-1 dark:border-zinc-700 dark:bg-zinc-950" value={color} onChange={(e) => setColor(e.target.value)} />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={activa} onChange={(e) => setActiva(e.target.checked)} />
        Activa
      </label>
      {error && <Aviso>{error}</Aviso>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="boton-primario">Guardar</button>
        <button type="button" className="boton-secundario" onClick={onFin}>Cancelar</button>
      </div>
      <div className="border-t border-zinc-200 pt-3 dark:border-zinc-800">
        <span className="etiqueta">Fusionar en otra categoría</span>
        <div className="flex flex-wrap gap-2">
          <select className="campo min-w-48 flex-1" value={destino} onChange={(e) => setDestino(e.target.value)}>
            <option value="">Elige la categoría de destino</option>
            {destinos.map((c) => (
              <option key={c.id} value={c.id}>
                {nombreCompleto(c)}
              </option>
            ))}
          </select>
          <button type="button" className="boton-secundario" disabled={!destino} onClick={fusionar}>
            Fusionar
          </button>
        </div>
      </div>
    </form>
  )
}
