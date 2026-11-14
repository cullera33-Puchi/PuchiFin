import { CreditCard, EyeOff, History, Search, SlidersHorizontal, Sparkles, Tag, Upload, X } from 'lucide-react'
import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Encabezado } from '../componentes/Encabezado'
import { FilaMovimientoDeslizable } from '../componentes/FilaMovimientoDeslizable'
import { FilaDeslizable } from '../componentes/gestos'
import { useHacer } from '../componentes/acciones'
import { Flotante, Hoja, useInterfaz } from '../componentes/Interfaz'
import { ContenidoMovimiento, DetalleMovimiento, HojaCorreccion, SelectorCategoria } from '../componentes/movimientos'
import { cambiarTipo, marcarFuera } from '../datos/movimientos'
import { obtenerDatos } from '../datos/almacen'
import { useDatos } from '../datos/ProveedorDatos'
import { aplicarReglasAPendientes } from '../importacion/pendientes'
import { gruposPasarela, propuestasRecategorizacion } from '../datos/categorizar'
import { claveComercio, normalizarConcepto } from '../lib/conceptos'
import { diaLargo, mesLargo } from '../lib/fechas'
import { formatearImporte, leerImporteUsuario, plural } from '../lib/formato'
import { NOMBRE_TIPO_MOVIMIENTO, type Movimiento, type TipoMovimiento } from '../lib/tipos'
import { nombreCategoria, porDia } from '../lib/vista'
import { mesEfectivo } from '../lib/imputacion'

interface Filtros {
  cuenta: string | null
  categoria: string | null | undefined // undefined: todas; null: sin categoría
  tipo: TipoMovimiento | null
  mes: string | null
  min: number | null
  max: number | null
}

const SIN_FILTROS: Filtros = { cuenta: null, categoria: undefined, tipo: null, mes: null, min: null, max: null }
/** Filas que se pintan de una vez; el resto llega al acercarse al final (v0.32.0: antes, 120 de golpe) */
const PAGINA = 40
const CLAVE_AYUDA = 'puchifin-ayuda-deslizar'

/**
 * Lo que había en Movimientos al irse a otra pestaña (v0.32.0): al volver, la misma búsqueda, los mismos
 * filtros y el mismo sitio. Solo en memoria, mientras la app está abierta.
 */
const memoria: { busqueda: string; filtros: Filtros; limite: number; scroll: number } = { busqueda: '', filtros: SIN_FILTROS, limite: PAGINA, scroll: 0 }

/** La ayuda de deslizar se enseña las tres primeras veces */
function leerAyuda(): boolean {
  try {
    const n = Number(localStorage.getItem(CLAVE_AYUDA) ?? 0)
    localStorage.setItem(CLAVE_AYUDA, String(n + 1))
    return n < 3
  } catch {
    return false
  }
}

export function Movimientos() {
  const db = useDatos()
  const { avisar } = useInterfaz()
  const hacer = useHacer()
  // Las cabeceras de día se paran debajo de la barra de búsqueda y filtros, no encima
  const barra = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = barra.current
    if (!el) return
    const raiz = document.documentElement
    const medir = () => raiz.style.setProperty('--alto-fijo', `${el.offsetHeight}px`)
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => {
      ro.disconnect()
      raiz.style.removeProperty('--alto-fijo')
    }
  }, [])
  const [params, setParams] = useSearchParams()
  // Se puede llegar con una búsqueda hecha (desde Informes: un comercio y un mes); si no, lo que había
  const conParams = ['q', 'sin', 'mes', 'min', 'max'].some((k) => params.get(k) !== null)
  const [busqueda, setBusqueda] = useState(() => (conParams ? (params.get('q') ?? '') : memoria.busqueda))
  const numero = (v: string | null) => (v ? Number(v) : null)
  const [filtros, setFiltros] = useState<Filtros>(() =>
    conParams
      ? {
          ...SIN_FILTROS,
          categoria: params.get('sin') ? null : undefined,
          mes: params.get('mes'),
          min: numero(params.get('min')),
          max: numero(params.get('max')),
        }
      : memoria.filtros,
  )
  // El filtro va un paso por detrás de lo que se escribe: el teclado no se bloquea con muchos movimientos
  const consulta = useDeferredValue(busqueda)
  const [ayuda] = useState(leerAyuda)
  const [buscando, setBuscando] = useState(false)

  const campo = useRef<HTMLInputElement>(null)
  const cancelarBusqueda = () => {
    setBusqueda('')
    setBuscando(false)
    campo.current?.blur()
    if (params.get('q')) setParams({}, { replace: true })
  }
  const cuentasFiltro = db.cuentas.filter((c) => c.activa && c.tipo !== 'hipoteca' && db.movimientos.some((m) => m.cuenta_id === c.id))
  const [verFiltros, setVerFiltros] = useState(false)
  const [limite, setLimite] = useState(() => (conParams ? PAGINA : memoria.limite))
  // Si se llega con otra búsqueda estando ya en Movimientos («Ver los del mismo comercio»), se aplica
  const claveParams = ['q', 'mes', 'min', 'max'].map((k) => params.get(k)).join('|')
  const [paramsAplicados, setParamsAplicados] = useState(claveParams)
  if (paramsAplicados !== claveParams) {
    setParamsAplicados(claveParams)
    if (params.get('q') !== null || params.get('mes') !== null || params.get('min') !== null) {
      if (params.get('q') !== null) setBusqueda(params.get('q')!)
      setFiltros((f) => ({ ...f, mes: params.get('mes'), min: numero(params.get('min')), max: numero(params.get('max')) }))
      setLimite(PAGINA)
    }
  }
  const [seleccion, setSeleccion] = useState<Set<string> | null>(null)
  const [detalle, setDetalle] = useState<string | null>(null)
  const [selectorBloque, setSelectorBloque] = useState(false)
  const [correccionBloque, setCorreccionBloque] = useState<string | null | undefined>(undefined)
  const [tipoBloque, setTipoBloque] = useState(false)

  const mejoras = useMemo(() => propuestasRecategorizacion(db).reduce((s, p) => s + p.movimientos.length, 0), [db])
  const sinCategoria = db.movimientos.filter((m) => m.tipo === 'normal' && !m.categoria_id).length
  const paypal = useMemo(() => gruposPasarela(db).reduce((s, g) => s + g.porRevisar.length, 0), [db])
  const hijas = useMemo(() => {
    const mapa = new Map<string, Set<string>>()
    for (const c of db.categorias) mapa.set(c.id, new Set([c.id, ...db.categorias.filter((h) => h.padre_id === c.id).map((h) => h.id)]))
    return mapa
  }, [db.categorias])

  // Clave de comercio de cada movimiento: los enlaces «del mismo comercio» buscan por ella
  const claves = useMemo(() => new Map(db.movimientos.map((m) => [m.id, claveComercio(m.concepto_limpio)])), [db.movimientos])
  const lista = useMemo(() => {
    const q = normalizarConcepto(consulta)
    return db.movimientos.filter((m) => {
      if (q && !m.concepto_normalizado.includes(q) && !claves.get(m.id)?.includes(q) && !normalizarConcepto(m.nota ?? '').includes(q)) return false
      if (filtros.cuenta && m.cuenta_id !== filtros.cuenta) return false
      if (filtros.categoria === null && (m.categoria_id || m.tipo !== 'normal')) return false
      if (filtros.categoria && !hijas.get(filtros.categoria)?.has(m.categoria_id ?? '')) return false
      if (filtros.tipo && m.tipo !== filtros.tipo) return false
      if (filtros.mes && mesEfectivo(m) !== filtros.mes) return false
      if (filtros.min !== null && Math.abs(m.importe) < filtros.min) return false
      if (filtros.max !== null && Math.abs(m.importe) > filtros.max) return false
      return true
    })
  }, [db.movimientos, consulta, filtros, hijas, claves])

  const grupos = useMemo(() => porDia(lista.slice().sort((a, b) => b.fecha_operacion.localeCompare(a.fecha_operacion)).slice(0, limite)), [lista, limite])
  const total = Math.round(lista.reduce((s, m) => s + (m.tipo === 'normal' ? m.importe : 0), 0) * 100) / 100

  // Al irse, se guarda dónde estaba; al volver (sin una búsqueda nueva), se recupera el sitio
  const estado = useRef({ busqueda, filtros, limite })
  useEffect(() => {
    estado.current = { busqueda, filtros, limite }
  }, [busqueda, filtros, limite])
  useLayoutEffect(() => {
    if (!conParams && memoria.scroll) window.scrollTo(0, memoria.scroll)
    return () => {
      memoria.busqueda = estado.current.busqueda
      memoria.filtros = estado.current.filtros
      memoria.limite = estado.current.limite
      memoria.scroll = window.scrollY
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Las filas siguientes se pintan al acercarse al final de la lista
  const finLista = useRef<HTMLDivElement>(null)
  const quedan = lista.length > limite
  useEffect(() => {
    const el = finLista.current
    if (!el || !quedan) return
    const io = new IntersectionObserver((e) => e[0].isIntersecting && setLimite((l) => l + PAGINA), { rootMargin: '800px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [quedan, limite])
  const filtrado = !!consulta || hayFiltros(filtros)

  const chips: { texto: string; quitar: () => void }[] = []
  if (filtros.categoria) chips.push({ texto: nombreCategoria(db, filtros.categoria), quitar: () => setFiltros({ ...filtros, categoria: undefined }) })
  if (filtros.tipo) chips.push({ texto: NOMBRE_TIPO_MOVIMIENTO[filtros.tipo], quitar: () => setFiltros({ ...filtros, tipo: null }) })
  if (filtros.mes) chips.push({ texto: mesLargo(`${filtros.mes}-01`), quitar: () => setFiltros({ ...filtros, mes: null }) })
  if (filtros.min !== null || filtros.max !== null)
    chips.push({
      texto: `Importe ${filtros.min !== null ? `desde ${formatearImporte(filtros.min)}` : ''}${filtros.max !== null ? ` hasta ${formatearImporte(filtros.max)}` : ''}`.trim(),
      quitar: () => setFiltros({ ...filtros, min: null, max: null }),
    })

  const alternarSin = () => {
    const activo = filtros.categoria === null
    setFiltros({ ...filtros, categoria: activo ? undefined : null })
    if (activo && params.get('sin')) setParams({}, { replace: true })
  }

  const elegidos = seleccion ? lista.filter((m) => seleccion.has(m.id)) : []
  const alternar = (m: Movimiento) =>
    setSeleccion((s) => {
      const n = new Set(s)
      if (n.has(m.id)) n.delete(m.id)
      else n.add(m.id)
      return n
    })

  const exportar = async () => {
    const r = await (await import('../lib/exportarExcel')).exportarVista(db, 'movimientos', lista, [
      ['Movimientos filtrados', lista.length],
      ['Búsqueda', busqueda],
      ...(filtros.cuenta ? [['Cuenta', db.cuentas.find((c) => c.id === filtros.cuenta)?.alias ?? '']] : []),
      ...chips.map((c) => ['Filtro', c.texto]),
      ['Total de los de tipo Normal', total],
    ])
    if (r === 'descargado') avisar('Excel descargado')
  }

  return (
    <>
      <Encabezado
        titulo="Movimientos"
        accion={
          seleccion ? (
            <button className="boton-texto text-[17px] font-semibold" onClick={() => setSeleccion(null)}>
              Listo
            </button>
          ) : (
            <div className="flex items-center gap-1">
              <Link to="/movimientos/importaciones" className="boton-icono" aria-label="Importaciones" title="Importaciones">
                <History className="size-[22px]" strokeWidth={1.75} />
              </Link>
              <Link to="/movimientos/importar" className="boton-icono" aria-label="Importar Excel" title="Importar Excel">
                <Upload className="size-[22px]" strokeWidth={1.75} />
              </Link>
              <button className="boton-texto px-1 text-[17px]" onClick={() => setSeleccion(new Set())} disabled={!lista.length}>
                Seleccionar
              </button>
            </div>
          )
        }
      />

      <div ref={barra} className="sticky top-[env(safe-area-inset-top)] z-20 -mx-4 mb-3 space-y-2 bg-[#F2F2F7] px-4 pt-1 pb-2 [transform:translateZ(0)] dark:bg-black">
        <div className="flex gap-2">
          <label className="flex flex-1 items-center gap-2 rounded-[10px] bg-zinc-200/70 px-3 py-2 dark:bg-zinc-800">
            <Search className="size-4 text-zinc-500" />
            <input
              ref={campo}
              type="search"
              enterKeyHint="search"
              className="w-full bg-transparent outline-none [&::-webkit-search-cancel-button]:hidden"
              placeholder="Buscar concepto o nota"
              value={busqueda}
              onFocus={() => setBuscando(true)}
              onBlur={() => !busqueda && setBuscando(false)}
              onChange={(e) => {
                setBusqueda(e.target.value)
                setLimite(PAGINA)
              }}
            />
            {busqueda && (
              <button aria-label="Borrar búsqueda" onClick={() => setBusqueda('')}>
                <X className="size-4 text-zinc-500" />
              </button>
            )}
          </label>
          {buscando || busqueda ? (
            <button className="boton-texto shrink-0 px-1 text-[17px]" onMouseDown={(e) => e.preventDefault()} onClick={cancelarBusqueda}>
              Cancelar
            </button>
          ) : (
            <button className={`boton-icono ${chips.length ? 'bg-marca-50 dark:bg-marca-900/40' : ''}`} aria-label="Filtros" onClick={() => setVerFiltros(true)}>
              <SlidersHorizontal className="size-5" strokeWidth={1.75} />
            </button>
          )}
        </div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
          {(sinCategoria > 0 || mejoras > 0) && (
            <Link to="/movimientos/categorizar" className="flex shrink-0 items-center gap-1 rounded-full bg-[#FF9500]/15 px-3 py-1 text-[13px] font-medium text-[#C93400] dark:text-[#FF9F0A]">
              <Sparkles className="size-3.5" strokeWidth={2} /> Categorizar
            </Link>
          )}
          {paypal > 0 && (
            <Link to="/movimientos/paypal" className="flex shrink-0 items-center gap-1 rounded-full bg-[#007AFF]/12 px-3 py-1 text-[13px] font-medium text-[#0062CC] dark:text-[#0A84FF]">
              <CreditCard className="size-3.5" strokeWidth={2} /> PayPal {paypal}
            </Link>
          )}
          <button
            onClick={alternarSin}
            className={`shrink-0 rounded-full px-3 py-1 text-[13px] font-medium ${filtros.categoria === null ? 'bg-[#FF9500] text-white' : 'bg-white text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200'}`}
          >
            Sin categoría {sinCategoria}
          </button>
          {cuentasFiltro.length > 1 &&
            cuentasFiltro.map((c) => {
              const activa = filtros.cuenta === c.id
              return (
                <button
                  key={c.id}
                  aria-pressed={activa}
                  onClick={() => {
                    setFiltros({ ...filtros, cuenta: activa ? null : c.id })
                    setLimite(PAGINA)
                  }}
                  className={`shrink-0 rounded-full px-3 py-1 text-[13px] font-medium ${activa ? 'bg-marca-700 text-white' : 'bg-white text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200'}`}
                >
                  {c.alias}
                </button>
              )
            })}
          {chips.map((c) => (
              <button key={c.texto} onClick={c.quitar} className="flex shrink-0 items-center gap-1 rounded-full bg-marca-700 px-3 py-1 text-[13px] font-medium text-white">
                {c.texto} <X className="size-3.5" />
              </button>
            ))}
        </div>
        {filtros.categoria === null && sinCategoria > 0 && (
          <button
            className="boton-texto px-1"
            onClick={async () => {
              const r = aplicarReglasAPendientes(obtenerDatos())
              const n = r.categorizados + r.traspasos
              if (!n) return avisar('Ninguna regla ni categoría aprendida encaja con lo pendiente')
              await hacer((d) => aplicarReglasAPendientes(d).db, `${plural(n, 'movimiento categorizado', 'movimientos categorizados')} con las reglas`)
            }}
          >
            Aplicar reglas a lo pendiente
          </button>
        )}
        <p className="px-1 text-xs text-zinc-500">
          {plural(lista.length, 'movimiento', 'movimientos')}
          {filtrado ? `. Suma de los de tipo Normal: ${formatearImporte(total)}` : ''}
          {!seleccion && lista.length > 0 && (
            <button className="ml-2 font-medium text-marca-700 dark:text-marca-500" onClick={exportar}>
              Exportar a Excel
            </button>
          )}
        </p>
      </div>

      {db.movimientos.length === 0 ? (
        <div className="tarjeta space-y-3 text-center">
          <p className="text-[15px]">Todavía no hay movimientos.</p>
          <Link to="/movimientos/importar" className="boton-primario">
            <Upload className="size-4" strokeWidth={2} /> Importar Excel de BBVA
          </Link>
          <p className="text-xs text-zinc-500">¿Sin datos todavía? En Ajustes, Herramientas, puedes descargar Excel de prueba.</p>
        </div>
      ) : lista.length === 0 ? (
        <p className="tarjeta text-center text-sm text-zinc-500">Ningún movimiento con estos filtros.</p>
      ) : (
        <div className="space-y-4">
          {!seleccion && ayuda && <p className="px-4 text-xs text-zinc-500">Desliza hacia la derecha para que un movimiento no cuente (gasto de empleado o reembolso); hacia la izquierda, para cambiar la categoría.</p>}
          {grupos.map(([dia, movs]) => (
            <section key={dia}>
              <h3 className="cabecera-grupo">
                <span>{diaLargo(dia, true)}</span>
                <span className="normal-case tabular-nums">{plural(movs.length, 'movimiento', 'movimientos')}</span>
              </h3>
              <ul className="lista divide-y divide-zinc-200/70 dark:divide-zinc-800">
                {movs.map((m) => (
                  <li key={m.id}>
                    {seleccion ? (
                      <FilaDeslizable onPulsar={() => alternar(m)} etiqueta={`Seleccionar ${m.concepto_limpio}`}>
                        <ContenidoMovimiento m={m} seleccion={seleccion.has(m.id)} />
                      </FilaDeslizable>
                    ) : (
                      <FilaMovimientoDeslizable m={m} onPulsar={() => setDetalle(m.id)} />
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {quedan && (
            <div ref={finLista}>
              <button className="boton-secundario w-full" onClick={() => setLimite((l) => l + PAGINA)}>
                Mostrar más ({lista.length - limite})
              </button>
            </div>
          )}
        </div>
      )}

      {/* Barra de acciones de la selección múltiple */}
      {seleccion && (
        <Flotante>
        <div className="flex items-center gap-1 rounded-2xl border border-white/60 bg-white/90 p-2 shadow-lg backdrop-blur-xl dark:border-white/10 dark:bg-zinc-900/90">
          <button className="boton-texto px-2" onClick={() => setSeleccion(seleccion.size === lista.length ? new Set() : new Set(lista.map((m) => m.id)))}>
            {seleccion.size === lista.length ? 'Ninguno' : 'Todos'}
          </button>
          <span className="flex-1 text-center text-[13px] text-zinc-500">{plural(seleccion.size, 'seleccionado', 'seleccionados')}</span>
          <button className="boton-icono" aria-label="Categoría" disabled={!seleccion.size} onClick={() => setSelectorBloque(true)}>
            <Tag className="size-5" strokeWidth={1.75} />
          </button>
          <button
            className="boton-icono"
            aria-label="Que no cuenten"
            disabled={!seleccion.size}
            onClick={async () => {
              const ids = [...seleccion]
              if (await hacer((d) => marcarFuera(d, ids, true), `${plural(ids.length, 'movimiento', 'movimientos')} fuera del extracto`)) setSeleccion(new Set())
            }}
          >
            <EyeOff className="size-5" strokeWidth={1.75} />
          </button>
          <button className="boton-texto px-2" disabled={!seleccion.size} onClick={() => setTipoBloque(true)}>
            Tipo
          </button>
        </div>
        </Flotante>
      )}

      <DetalleMovimiento id={detalle} onCerrar={() => setDetalle(null)} />
      <SelectorCategoria
        abierta={selectorBloque}
        onElegir={(c) => {
          setSelectorBloque(false)
          setCorreccionBloque(c)
        }}
        onCerrar={() => setSelectorBloque(false)}
      />
      <HojaCorreccion
        ids={correccionBloque !== undefined ? elegidos.map((m) => m.id) : null}
        categoria={correccionBloque ?? null}
        onCerrar={() => setCorreccionBloque(undefined)}
        onHecho={() => {
          setCorreccionBloque(undefined)
          setSeleccion(new Set())
        }}
      />
      <Hoja abierta={tipoBloque} titulo={`Tipo de ${plural(seleccion?.size ?? 0, 'movimiento', 'movimientos')}`} onCerrar={() => setTipoBloque(false)}>
        <div className="lista divide-y divide-zinc-200/70 border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {(Object.keys(NOMBRE_TIPO_MOVIMIENTO) as TipoMovimiento[]).map((t) => (
            <button
              key={t}
              className="fila w-full"
              onClick={async () => {
                const ids = [...(seleccion ?? [])]
                setTipoBloque(false)
                if (await hacer((d) => cambiarTipo(d, ids, t), `${plural(ids.length, 'movimiento', 'movimientos')}: ${NOMBRE_TIPO_MOVIMIENTO[t]}`)) setSeleccion(new Set())
              }}
            >
              {NOMBRE_TIPO_MOVIMIENTO[t]}
            </button>
          ))}
        </div>
      </Hoja>
      <HojaFiltros abierta={verFiltros} filtros={filtros} onCerrar={() => setVerFiltros(false)} onAplicar={(f) => { setFiltros(f); setLimite(PAGINA); setVerFiltros(false) }} />
    </>
  )
}

function HojaFiltros({ abierta, filtros, onCerrar, onAplicar }: { abierta: boolean; filtros: Filtros; onCerrar: () => void; onAplicar: (f: Filtros) => void }) {
  const db = useDatos()
  const [f, setF] = useState(filtros)
  const [selector, setSelector] = useState(false)
  const [min, setMin] = useState('')
  const [max, setMax] = useState('')
  const meses = [...new Set(db.movimientos.map(mesEfectivo))].sort().reverse()
  const abrir = abierta && !selector

  return (
    <>
      <Hoja
        abierta={abrir}
        titulo="Filtros"
        onCerrar={onCerrar}
        acciones={
          <>
            <button className="boton-secundario" onClick={() => { setF(SIN_FILTROS); setMin(''); setMax('') }}>
              Quitar todos
            </button>
            <button className="boton-primario" onClick={() => onAplicar({ ...f, min: leerImporteUsuario(min), max: leerImporteUsuario(max) })}>
              Aplicar
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <label className="block">
            <span className="etiqueta">Cuenta</span>
            <select className="campo" value={f.cuenta ?? ''} onChange={(e) => setF({ ...f, cuenta: e.target.value || null })}>
              <option value="">Todas</option>
              {db.cuentas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.alias}
                </option>
              ))}
            </select>
          </label>
          <div>
            <span className="etiqueta">Categoría</span>
            <button className="campo flex items-center justify-between text-left" onClick={() => setSelector(true)}>
              {f.categoria === undefined ? 'Todas' : nombreCategoria(db, f.categoria)}
            </button>
          </div>
          <label className="block">
            <span className="etiqueta">Tipo</span>
            <select className="campo" value={f.tipo ?? ''} onChange={(e) => setF({ ...f, tipo: (e.target.value || null) as TipoMovimiento | null })}>
              <option value="">Todos</option>
              {(Object.keys(NOMBRE_TIPO_MOVIMIENTO) as TipoMovimiento[]).map((t) => (
                <option key={t} value={t}>
                  {NOMBRE_TIPO_MOVIMIENTO[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="etiqueta">Mes</span>
            <select className="campo" value={f.mes ?? ''} onChange={(e) => setF({ ...f, mes: e.target.value || null })}>
              <option value="">Todos</option>
              {meses.map((m) => (
                <option key={m} value={m}>
                  {mesLargo(`${m}-01`)}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className="etiqueta">Importe desde (€)</span>
              <input className="campo" inputMode="decimal" placeholder="0" value={min} onChange={(e) => setMin(e.target.value)} />
            </label>
            <label>
              <span className="etiqueta">Importe hasta (€)</span>
              <input className="campo" inputMode="decimal" placeholder="Sin límite" value={max} onChange={(e) => setMax(e.target.value)} />
            </label>
          </div>
          <p className="text-xs text-zinc-500">El importe se compara sin signo: sirve igual para gastos e ingresos.</p>
        </div>
      </Hoja>
      <SelectorCategoria
        abierta={abierta && selector}
        actual={f.categoria ?? undefined}
        onElegir={(c) => {
          setF({ ...f, categoria: c })
          setSelector(false)
        }}
        onCerrar={() => setSelector(false)}
      />
    </>
  )
}

/** Hay algún filtro aplicado (sin contar la búsqueda) */
function hayFiltros(f: Filtros): boolean {
  return f.cuenta !== null || f.categoria !== undefined || f.tipo !== null || f.mes !== null || f.min !== null || f.max !== null
}
