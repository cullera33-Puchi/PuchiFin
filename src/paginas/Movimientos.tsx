import { Briefcase, History, Search, SlidersHorizontal, Tag, Upload, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Encabezado } from '../componentes/Encabezado'
import { FilaMovimientoDeslizable } from '../componentes/FilaMovimientoDeslizable'
import { FilaDeslizable } from '../componentes/gestos'
import { useHacer } from '../componentes/acciones'
import { Flotante, Hoja, useInterfaz } from '../componentes/Interfaz'
import { ContenidoMovimiento, DetalleMovimiento, HojaCorreccion, SelectorCategoria } from '../componentes/movimientos'
import { cambiarTipo } from '../datos/movimientos'
import { useDatos } from '../datos/ProveedorDatos'
import { normalizarConcepto } from '../lib/conceptos'
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
const PAGINA = 120

export function Movimientos() {
  const db = useDatos()
  const { avisar } = useInterfaz()
  const hacer = useHacer()
  const [params, setParams] = useSearchParams()
  const [busqueda, setBusqueda] = useState('')
  const [filtros, setFiltros] = useState<Filtros>(() => ({ ...SIN_FILTROS, categoria: params.get('sin') ? null : undefined }))
  const [verFiltros, setVerFiltros] = useState(false)
  const [limite, setLimite] = useState(PAGINA)
  const [seleccion, setSeleccion] = useState<Set<string> | null>(null)
  const [detalle, setDetalle] = useState<string | null>(null)
  const [selectorBloque, setSelectorBloque] = useState(false)
  const [correccionBloque, setCorreccionBloque] = useState<string | null | undefined>(undefined)
  const [tipoBloque, setTipoBloque] = useState(false)

  const sinCategoria = db.movimientos.filter((m) => m.tipo === 'normal' && !m.categoria_id).length
  const hijas = useMemo(() => {
    const mapa = new Map<string, Set<string>>()
    for (const c of db.categorias) mapa.set(c.id, new Set([c.id, ...db.categorias.filter((h) => h.padre_id === c.id).map((h) => h.id)]))
    return mapa
  }, [db.categorias])

  const lista = useMemo(() => {
    const q = normalizarConcepto(busqueda)
    return db.movimientos.filter((m) => {
      if (q && !m.concepto_normalizado.includes(q) && !normalizarConcepto(m.nota ?? '').includes(q)) return false
      if (filtros.cuenta && m.cuenta_id !== filtros.cuenta) return false
      if (filtros.categoria === null && (m.categoria_id || m.tipo !== 'normal')) return false
      if (filtros.categoria && !hijas.get(filtros.categoria)?.has(m.categoria_id ?? '')) return false
      if (filtros.tipo && m.tipo !== filtros.tipo) return false
      if (filtros.mes && mesEfectivo(m) !== filtros.mes) return false
      if (filtros.min !== null && Math.abs(m.importe) < filtros.min) return false
      if (filtros.max !== null && Math.abs(m.importe) > filtros.max) return false
      return true
    })
  }, [db.movimientos, busqueda, filtros, hijas])

  const grupos = useMemo(() => porDia(lista.slice().sort((a, b) => b.fecha_operacion.localeCompare(a.fecha_operacion)).slice(0, limite)), [lista, limite])
  const total = Math.round(lista.reduce((s, m) => s + (m.tipo === 'normal' ? m.importe : 0), 0) * 100) / 100

  const chips: { texto: string; quitar: () => void }[] = []
  if (filtros.cuenta) chips.push({ texto: db.cuentas.find((c) => c.id === filtros.cuenta)?.alias ?? '?', quitar: () => setFiltros({ ...filtros, cuenta: null }) })
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

      <div className="sticky top-0 z-10 -mx-4 mb-3 space-y-2 bg-[#F2F2F7]/90 px-4 pt-1 pb-2 backdrop-blur dark:bg-black/80">
        <div className="flex gap-2">
          <label className="flex flex-1 items-center gap-2 rounded-[10px] bg-zinc-200/70 px-3 py-2 dark:bg-zinc-800">
            <Search className="size-4 text-zinc-500" />
            <input className="w-full bg-transparent outline-none" placeholder="Buscar concepto o nota" value={busqueda} onChange={(e) => { setBusqueda(e.target.value); setLimite(PAGINA) }} />
            {busqueda && (
              <button aria-label="Borrar búsqueda" onClick={() => setBusqueda('')}>
                <X className="size-4 text-zinc-500" />
              </button>
            )}
          </label>
          <button className={`boton-icono ${chips.length ? 'bg-marca-50 dark:bg-marca-900/40' : ''}`} aria-label="Filtros" onClick={() => setVerFiltros(true)}>
            <SlidersHorizontal className="size-5" strokeWidth={1.75} />
          </button>
        </div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
          <button
            onClick={alternarSin}
            className={`shrink-0 rounded-full px-3 py-1 text-[13px] font-medium ${filtros.categoria === null ? 'bg-[#FF9500] text-white' : 'bg-white text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200'}`}
          >
            Sin categoría {sinCategoria}
          </button>
          {chips.map((c) => (
              <button key={c.texto} onClick={c.quitar} className="flex shrink-0 items-center gap-1 rounded-full bg-marca-700 px-3 py-1 text-[13px] font-medium text-white">
                {c.texto} <X className="size-3.5" />
              </button>
            ))}
        </div>
        <p className="px-1 text-xs text-zinc-500">
          {lista.length} movimientos. Suma de los de tipo Normal: {formatearImporte(total)}
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
          {!seleccion && <p className="px-4 text-xs text-zinc-500">Desliza a la izquierda para marcar gasto de empleado; a la derecha, para cambiar la categoría.</p>}
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
          {lista.length > limite && (
            <button className="boton-secundario w-full" onClick={() => setLimite((l) => l + PAGINA)}>
              Mostrar más ({lista.length - limite})
            </button>
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
            aria-label="Marcar como gasto de empleado"
            disabled={!seleccion.size}
            onClick={async () => {
              const ids = [...seleccion]
              if (await hacer((d) => cambiarTipo(d, ids, 'gasto_empleado'), `${plural(ids.length, 'gasto marcado', 'gastos marcados')} como de empleado`)) setSeleccion(new Set())
            }}
          >
            <Briefcase className="size-5" strokeWidth={1.75} />
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
        onHecho={(n) => {
          setCorreccionBloque(undefined)
          setSeleccion(new Set())
          avisar(`Categoría corregida en ${plural(n, 'movimiento', 'movimientos')}`)
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
