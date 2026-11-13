import { Check, ChevronRight, Plus } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Aviso } from '../../componentes/Encabezado'
import { Baldosa } from '../../componentes/Icono'
import { ICONOS, ICONO_POR_DEFECTO } from '../../componentes/iconos'
import { FilaInterruptor } from '../../componentes/Interfaz'
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
      color: padre?.color ?? '#8E8E93',
      icono: padre ? null : ICONO_POR_DEFECTO,
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
        <div className="w-52">
          <FilaInterruptor texto="Mostrar inactivas" activo={verInactivas} onCambio={setVerInactivas} />
        </div>
      </div>
      {error && <Aviso>{error}</Aviso>}

      <ul className="lista divide-y divide-zinc-200/70 dark:divide-zinc-800">
        {arbol.map(({ raiz, hijas }) => {
          const abierta = abiertas.has(raiz.id)
          return (
            <li key={raiz.id}>
              {editando === raiz.id ? (
                <Editor categoria={raiz} todas={categorias ?? []} onFin={() => { setEditando(null); cargar() }} />
              ) : (
                <div className={`flex items-center gap-1 pr-3 ${raiz.activa ? '' : 'opacity-50'}`}>
                  <button className="fila flex-1 hover:bg-zinc-50 dark:hover:bg-zinc-800/60" aria-expanded={abierta} onClick={() => alternar(raiz.id)}>
                    <Baldosa icono={raiz.icono} color={raiz.color} />
                    <span className="truncate">{raiz.nombre}</span>
                    {raiz.naturaleza === 'ingreso' && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200">
                        Ingreso
                      </span>
                    )}
                    <span className="ml-auto text-sm text-zinc-400">{hijas.length}</span>
                    <ChevronRight className={`size-4 text-zinc-400 transition-transform ${abierta ? 'rotate-90' : ''}`} strokeWidth={2} />
                  </button>
                  <button className="boton-texto px-1" aria-label={`Editar ${raiz.nombre}`} onClick={() => setEditando(raiz.id)}>
                    Editar
                  </button>
                </div>
              )}

              {abierta && (
                <ul className="border-t border-zinc-200/70 bg-zinc-50/70 py-1 dark:border-zinc-800 dark:bg-zinc-950/40">
                  {hijas.map((h) =>
                    editando === h.id ? (
                      <li key={h.id}>
                        <Editor categoria={h} todas={categorias ?? []} onFin={() => { setEditando(null); cargar() }} />
                      </li>
                    ) : (
                      <li key={h.id} className={`flex items-center gap-3 py-2 pr-4 pl-[60px] ${h.activa ? '' : 'opacity-50'}`}>
                        <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: h.color ?? raiz.color ?? '#8E8E93' }} />
                        <span className="flex-1 truncate text-sm">{h.nombre}</span>
                        <button className="boton-texto text-xs" aria-label={`Editar ${h.nombre}`} onClick={() => setEditando(h.id)}>
                          Editar
                        </button>
                      </li>
                    ),
                  )}
                  <li className="py-2 pr-4 pl-[60px]">
                    {nuevaEn === raiz.id ? (
                      <NuevaCategoria
                        placeholder="Nombre de la subcategoría"
                        onCrear={(n) => crear(n, raiz, raiz.naturaleza)}
                        onCancelar={() => setNuevaEn(null)}
                      />
                    ) : (
                      <button className="boton-texto flex items-center gap-1" onClick={() => setNuevaEn(raiz.id)}>
                        <Plus className="size-4" strokeWidth={2} /> Añadir subcategoría
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

/** Paleta del sistema de iOS */
const COLORES = ['#FF3B30', '#FF9500', '#F7B500', '#34C759', '#00C7BE', '#30B0C7', '#32ADE6', '#007AFF', '#5856D6', '#AF52DE', '#FF2D55', '#A2845E', '#8E8E93', '#636366']

function Editor({ categoria, todas, onFin }: { categoria: Categoria; todas: Categoria[]; onFin: () => void }) {
  const [nombre, setNombre] = useState(categoria.nombre)
  const [icono, setIcono] = useState(categoria.icono && ICONOS[categoria.icono] ? categoria.icono : ICONO_POR_DEFECTO)
  const [color, setColor] = useState(categoria.color ?? '#8E8E93')
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
      .update({ nombre: nombre.trim(), icono: esRaiz ? icono : categoria.icono, color, activa })
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
    <form onSubmit={guardar} className={`space-y-4 bg-zinc-50 px-4 py-4 dark:bg-zinc-800/40 ${esRaiz ? '' : 'pl-[60px]'}`}>
      <div className="flex items-end gap-3">
        {esRaiz && <Baldosa icono={icono} color={color} tamano="lg" />}
        <label className="flex-1">
          <span className="etiqueta">Nombre</span>
          <input className="campo" value={nombre} maxLength={60} onChange={(e) => setNombre(e.target.value)} />
        </label>
      </div>
      <div>
        <span className="etiqueta">Color</span>
        <div className="flex flex-wrap items-center gap-2">
          {COLORES.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Color ${c}`}
              aria-pressed={color.toUpperCase() === c}
              className="grid size-8 place-items-center rounded-full text-white"
              style={{ backgroundColor: c }}
              onClick={() => setColor(c)}
            >
              {color.toUpperCase() === c && <Check className="size-4" strokeWidth={3} />}
            </button>
          ))}
          <label className="relative grid size-8 cursor-pointer place-items-center overflow-hidden rounded-full bg-[conic-gradient(#FF3B30,#FF9500,#FFCC00,#34C759,#007AFF,#AF52DE,#FF3B30)]" title="Otro color">
            <input type="color" className="absolute inset-0 cursor-pointer opacity-0" value={color} onChange={(e) => setColor(e.target.value.toUpperCase())} />
          </label>
        </div>
      </div>
      {esRaiz && (
        <div>
          <span className="etiqueta">Icono</span>
          <div className="grid grid-cols-8 gap-2 sm:grid-cols-10">
            {Object.entries(ICONOS).map(([clave, { nombre: n }]) => (
              <button
                key={clave}
                type="button"
                title={n}
                aria-label={n}
                aria-pressed={icono === clave}
                onClick={() => setIcono(clave)}
                className={`grid place-items-center rounded-[10px] p-0.5 ring-offset-2 transition ${icono === clave ? 'ring-2 ring-marca-600 dark:ring-offset-zinc-900' : 'opacity-80 hover:opacity-100'}`}
              >
                <Baldosa icono={clave} color={icono === clave ? color : '#8E8E93'} />
              </button>
            ))}
          </div>
        </div>
      )}
      <FilaInterruptor texto="Activa" nota="Las inactivas no se ofrecen al categorizar" activo={activa} onCambio={setActiva} />
      {error && <Aviso>{error}</Aviso>}
      <div className="flex justify-end gap-2">
        <button type="button" className="boton-secundario" onClick={onFin}>Cancelar</button>
        <button type="submit" className="boton-primario">Guardar</button>
      </div>
      <div className="border-t border-zinc-200 pt-4 dark:border-zinc-700">
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
