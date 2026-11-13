/** Piezas comunes para mostrar y corregir movimientos */
import { Briefcase, Check, ChevronRight, Search, Tag } from 'lucide-react'
import { useMemo, useState } from 'react'
import { aplicado, cambiarCategoria, cambiarTipo, cerrarReembolso, guardarNota, mismoConcepto } from '../datos/movimientos'
import { intentar, useDatos } from '../datos/ProveedorDatos'
import { normalizarConcepto } from '../lib/conceptos'
import { formatearFecha, formatearImporte } from '../lib/formato'
import { NOMBRE_TIPO_MOVIMIENTO, type BaseDatos, type Categoria, type Movimiento, type TipoMovimiento } from '../lib/tipos'
import { COLOR_TIPO, nombreCategoria } from '../lib/vista'
import { Aviso } from './Encabezado'
import { Baldosa } from './Icono'
import { FilaInterruptor, Hoja } from './Interfaz'

function raizDe(db: BaseDatos, id: string | null): Categoria | undefined {
  const c = id ? db.categorias.find((x) => x.id === id) : undefined
  return c?.padre_id ? db.categorias.find((x) => x.id === c.padre_id) : c
}

/** Contenido de la fila de un movimiento (baldosa, concepto, categoría o tipo, importe) */
export function ContenidoMovimiento({ m, seleccion, conFecha }: { m: Movimiento; seleccion?: boolean | null; conFecha?: boolean }) {
  const db = useDatos()
  const raiz = raizDe(db, m.categoria_id)
  const fuera = m.tipo !== 'normal'
  return (
    <div className="flex min-h-14 items-center gap-3 px-4 py-2">
      {seleccion !== undefined && seleccion !== null && (
        <span className={`grid size-[22px] shrink-0 place-items-center rounded-full border-2 ${seleccion ? 'border-marca-600 bg-marca-600 text-white' : 'border-zinc-300 dark:border-zinc-600'}`}>
          {seleccion && <Check className="size-3.5" strokeWidth={3} />}
        </span>
      )}
      {m.tipo === 'gasto_empleado' ? (
        <Baldosa glifo={Briefcase} color={COLOR_TIPO.gasto_empleado} />
      ) : raiz ? (
        <Baldosa icono={raiz.icono} color={raiz.color} />
      ) : (
        <Baldosa glifo={Tag} color="#C7C7CC" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px]">{m.concepto_limpio}</p>
        <p className={`truncate text-xs ${!m.categoria_id && !fuera ? 'text-[#FF9500]' : 'text-zinc-500'}`}>
          {conFecha && `${formatearFecha(m.fecha_operacion)}, `}
          {fuera ? NOMBRE_TIPO_MOVIMIENTO[m.tipo] : nombreCategoria(db, m.categoria_id)}
          {m.nota ? '. Con nota' : ''}
        </p>
      </div>
      <span className={`shrink-0 text-[15px] tabular-nums ${fuera ? 'text-zinc-400' : m.importe > 0 ? 'text-[#248A3D] dark:text-[#30D158]' : ''}`}>
        {formatearImporte(m.importe)}
      </span>
    </div>
  )
}

/** Hoja para elegir una categoría o subcategoría, con búsqueda */
export function SelectorCategoria({
  abierta,
  actual,
  onElegir,
  onCerrar,
  permitirNinguna = true,
}: {
  abierta: boolean
  actual?: string | null
  onElegir: (id: string | null) => void
  onCerrar: () => void
  permitirNinguna?: boolean
}) {
  const db = useDatos()
  const [busqueda, setBusqueda] = useState('')
  const q = normalizarConcepto(busqueda)
  const grupos = useMemo(() => {
    const activas = db.categorias.filter((c) => c.activa)
    return activas
      .filter((c) => !c.padre_id)
      .sort((a, b) => a.orden - b.orden)
      .map((raiz) => ({ raiz, hijas: activas.filter((c) => c.padre_id === raiz.id).sort((a, b) => a.orden - b.orden) }))
      .map((g) => {
        if (!q) return g
        const raizCoincide = normalizarConcepto(g.raiz.nombre).includes(q)
        return { raiz: g.raiz, hijas: raizCoincide ? g.hijas : g.hijas.filter((h) => normalizarConcepto(h.nombre).includes(q)), visible: raizCoincide }
      })
      .filter((g) => !q || ('visible' in g && g.visible) || g.hijas.length)
  }, [db.categorias, q])

  const elegir = (id: string | null) => {
    setBusqueda('')
    onElegir(id)
  }

  return (
    <Hoja abierta={abierta} titulo="Categoría" onCerrar={onCerrar}>
      <label className="mb-3 flex items-center gap-2 rounded-[10px] bg-zinc-100 px-3 py-2 dark:bg-zinc-800">
        <Search className="size-4 text-zinc-500" />
        <input className="w-full bg-transparent outline-none" placeholder="Buscar" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
      </label>
      <div className="space-y-3">
        {permitirNinguna && !q && (
          <button className="lista fila w-full border border-zinc-200 dark:border-zinc-800" onClick={() => elegir(null)}>
            <Baldosa glifo={Tag} color="#C7C7CC" tamano="sm" />
            <span className="flex-1">Sin categoría</span>
            {actual === null && <Check className="size-5 text-marca-600" />}
          </button>
        )}
        {grupos.map(({ raiz, hijas }) => (
          <div key={raiz.id} className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
            <button className="fila w-full bg-zinc-50 dark:bg-zinc-800/50" onClick={() => elegir(raiz.id)}>
              <Baldosa icono={raiz.icono} color={raiz.color} tamano="sm" />
              <span className="flex-1 font-medium">{raiz.nombre}</span>
              {actual === raiz.id && <Check className="size-5 text-marca-600" />}
            </button>
            {hijas.map((h) => (
              <button key={h.id} className="fila min-h-11 w-full border-t border-zinc-100 pl-14 dark:border-zinc-800" onClick={() => elegir(h.id)}>
                <span className="flex-1 text-[15px]">{h.nombre}</span>
                {actual === h.id && <Check className="size-5 text-marca-600" />}
              </button>
            ))}
          </div>
        ))}
      </div>
    </Hoja>
  )
}

/**
 * Corrección de categoría con las preguntas de la especificación: aplicar a todos los movimientos con
 * el mismo concepto y crear la regla para los futuros.
 */
export function HojaCorreccion({
  ids,
  categoria,
  onCerrar,
  onHecho,
}: {
  ids: string[] | null
  categoria: string | null
  onCerrar: () => void
  onHecho?: (n: number) => void
}) {
  const db = useDatos()
  const [todos, setTodos] = useState(true)
  const [regla, setRegla] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const otros = ids ? mismoConcepto(db, ids).filter((m) => m.categoria_id !== categoria) : []
  const aplicar = async () => {
    if (!ids) return
    const n = ids.length + (todos ? otros.length : 0)
    const e = await intentar((d) => cambiarCategoria(d, ids, categoria, { mismoConcepto: todos, crearRegla: regla && !!categoria }), `Categoría corregida en ${n} movimientos`)
    if (e) setError(e)
    else onHecho?.(n)
  }
  return (
    <Hoja
      abierta={!!ids}
      titulo={`Cambiar a ${nombreCategoria(db, categoria)}`}
      onCerrar={onCerrar}
      acciones={
        <>
          <button className="boton-secundario" onClick={onCerrar}>
            Cancelar
          </button>
          <button className="boton-primario" onClick={aplicar}>
            Aplicar
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {otros.length > 0 && (
          <FilaInterruptor texto={`Aplicar también a ${otros.length} ${otros.length === 1 ? 'movimiento' : 'movimientos'} con el mismo concepto`} activo={todos} onCambio={setTodos} />
        )}
        {categoria && <FilaInterruptor texto="Crear una regla para las próximas importaciones" nota="Los movimientos nuevos con este concepto se categorizarán solos" activo={regla} onCambio={setRegla} />}
        {error && <Aviso>{error}</Aviso>}
      </div>
    </Hoja>
  )
}

const TIPOS: TipoMovimiento[] = ['normal', 'gasto_empleado', 'reembolso_empresa', 'traspaso_interno', 'pago_deuda']

/** Detalle de un movimiento: categoría, tipo, nota y reembolso */
export function DetalleMovimiento({ id, onCerrar }: { id: string | null; onCerrar: () => void }) {
  const db = useDatos()
  const m = id ? db.movimientos.find((x) => x.id === id) : undefined
  const [selector, setSelector] = useState(false)
  const [correccion, setCorreccion] = useState<string | null | undefined>(undefined)
  const [nota, setNota] = useState<{ id: string; texto: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (!m) return null
  const cuenta = db.cuentas.find((c) => c.id === m.cuenta_id)
  const textoNota = nota?.id === m.id ? nota.texto : m.nota ?? ''
  const { gastos, reembolsos } = aplicado(db)
  const conciliados = db.conciliaciones.filter((c) => c.gasto_id === m.id || c.reembolso_id === m.id)

  const elegirCategoria = async (cat: string | null) => {
    setSelector(false)
    if (cat === m.categoria_id) return
    if (mismoConcepto(db, [m.id]).length || cat) setCorreccion(cat)
    else {
      const e = await intentar((d) => cambiarCategoria(d, [m.id], cat), 'Categoría corregida')
      if (e) setError(e)
    }
  }

  const guardarLaNota = async () => {
    if (textoNota === (m.nota ?? '')) return
    const e = await intentar((d) => guardarNota(d, m.id, textoNota), 'Nota guardada')
    if (e) setError(e)
  }

  return (
    <>
      <Hoja
        abierta={!!id && !selector && correccion === undefined}
        titulo="Movimiento"
        onCerrar={() => {
          guardarLaNota()
          setNota(null)
          setError(null)
          onCerrar()
        }}
      >
        <div className="space-y-4">
          <div className="text-center">
            <p className={`text-3xl font-semibold tabular-nums ${m.importe > 0 && m.tipo === 'normal' ? 'text-[#248A3D] dark:text-[#30D158]' : ''}`}>{formatearImporte(m.importe)}</p>
            <p className="mt-1 text-[15px]">{m.concepto_limpio}</p>
            <p className="text-xs text-zinc-500">
              {formatearFecha(m.fecha_operacion)}, {cuenta?.alias ?? '?'}
            </p>
          </div>

          <div className="lista divide-y divide-zinc-200/70 border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            <button className="fila hover:bg-zinc-50 dark:hover:bg-zinc-800/60" onClick={() => setSelector(true)}>
              <span className="flex-1 text-[15px]">Categoría</span>
              <span className={`text-[15px] ${m.categoria_id ? 'text-zinc-500' : 'text-[#FF9500]'}`}>{nombreCategoria(db, m.categoria_id)}</span>
              <ChevronRight className="size-4 text-zinc-400" />
            </button>
            <div className="px-4 py-3">
              <p className="mb-2 text-[15px]">Tipo</p>
              <div className="flex flex-wrap gap-1.5">
                {TIPOS.map((t) => (
                  <button
                    key={t}
                    className={`rounded-full px-3 py-1 text-[13px] font-medium ${m.tipo === t ? 'bg-marca-700 text-white' : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'}`}
                    onClick={async () => {
                      const e = await intentar((d) => cambiarTipo(d, [m.id], t), 'Tipo cambiado')
                      if (e) setError(e)
                    }}
                  >
                    {NOMBRE_TIPO_MOVIMIENTO[t]}
                  </button>
                ))}
              </div>
              {m.tipo !== 'normal' && <p className="mt-2 text-xs text-zinc-500">No computa en el extracto ni en los totales.</p>}
            </div>
            {m.tipo === 'gasto_empleado' && (
              <div className="space-y-2 px-4 py-3">
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Reembolsado: {formatearImporte(gastos.get(m.id) ?? 0)} de {formatearImporte(-m.importe)}
                </p>
                <FilaInterruptor
                  texto="Cerrado sin reembolso completo"
                  nota="Deja de contar como pendiente; la diferencia queda visible"
                  activo={m.reembolso_cerrado}
                  onCambio={async (v) => {
                    const e = await intentar((d) => cerrarReembolso(d, m.id, v), v ? 'Gasto cerrado' : 'Gasto reabierto')
                    if (e) setError(e)
                  }}
                />
              </div>
            )}
            {m.tipo === 'reembolso_empresa' && (
              <p className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">
                Aplicado a gastos: {formatearImporte(reembolsos.get(m.id) ?? 0)} de {formatearImporte(m.importe)} ({conciliados.length}{' '}
                {conciliados.length === 1 ? 'gasto' : 'gastos'}). Se concilia en la pestaña Empleado.
              </p>
            )}
            <label className="block px-4 py-3">
              <span className="mb-1 block text-[15px]">Nota</span>
              <textarea
                className="campo min-h-16"
                maxLength={500}
                placeholder="Añadir una nota"
                value={textoNota}
                onChange={(e) => setNota({ id: m.id, texto: e.target.value })}
                onBlur={guardarLaNota}
              />
            </label>
          </div>
          <p className="text-xs break-words text-zinc-500">Concepto del banco, anonimizado: {m.concepto_original}</p>
          {error && <Aviso>{error}</Aviso>}
        </div>
      </Hoja>
      <SelectorCategoria abierta={selector} actual={m.categoria_id} onElegir={elegirCategoria} onCerrar={() => setSelector(false)} />
      <HojaCorreccion ids={correccion !== undefined ? [m.id] : null} categoria={correccion ?? null} onCerrar={() => setCorreccion(undefined)} onHecho={() => setCorreccion(undefined)} />
    </>
  )
}

