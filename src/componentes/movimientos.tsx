/** Piezas comunes para mostrar y corregir movimientos */
import { Briefcase, Check, ChevronRight, Search, Tag } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { similares } from '../datos/categorizar'
import { cambiarCategoria, cambiarTipo, guardarNota, imputarMesSiguiente } from '../datos/movimientos'
import { mesSiguiente } from '../lib/imputacion'
import { intentar, useDatos } from '../datos/ProveedorDatos'
import { normalizarConcepto } from '../lib/conceptos'
import { formatearFecha, formatearImporte, plural } from '../lib/formato'
import { nombreMes } from '../lib/fechas'
import { NOMBRE_TIPO_MOVIMIENTO, type BaseDatos, type Categoria, type Movimiento, type TipoMovimiento } from '../lib/tipos'
import { COLOR_TIPO, nombreCategoria } from '../lib/vista'
import { Baldosa } from './Icono'
import { useHacer } from './acciones'
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
      {m.tipo === 'gasto_empleado' || m.tipo === 'reembolso_empresa' ? (
        <Baldosa glifo={Briefcase} color={COLOR_TIPO[m.tipo]} />
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
          {m.mes_imputacion ? `. Cuenta en ${nombreMes(`${m.mes_imputacion}-01`)}` : ''}
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
 * Corrección de categoría: además de los elegidos, propone a la vez los similares PENDIENTES (mismo
 * comercio y comercios que empiezan igual) y crear la regla para las próximas importaciones. Lo ya
 * categorizado de otra forma solo cambia si se activa a mano. Todo con «Deshacer».
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
  const hacer = useHacer()
  const [mismo, setMismo] = useState(true)
  const [parecidos, setParecidos] = useState(true)
  const [yaHechos, setYaHechos] = useState(false)
  const [regla, setRegla] = useState(true)
  const s = useMemo(() => (ids ? similares(db, ids, categoria) : null), [db, ids, categoria])
  const nombres = (movs: Movimiento[]) => {
    const unicos = [...new Set(movs.map((m) => m.concepto_limpio))]
    return unicos.slice(0, 4).join(', ') + (unicos.length > 4 ? ` y ${unicos.length - 4} más` : '')
  }
  const aplicar = async () => {
    if (!ids || !s) return
    const todos = [...ids, ...(mismo ? s.mismoComercio : []), ...(parecidos ? s.parecidos : []), ...(yaHechos ? s.yaCategorizados : [])].map((x) => (typeof x === 'string' ? x : x.id))
    const ok = await hacer(
      (d) => cambiarCategoria(d, todos, categoria, { crearRegla: regla && !!categoria }),
      `${plural(todos.length, 'movimiento', 'movimientos')}: ${nombreCategoria(db, categoria)}`,
    )
    if (ok) onHecho?.(todos.length)
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
        {s && s.mismoComercio.length > 0 && (
          <FilaInterruptor
            texto={`También ${plural(s.mismoComercio.length, 'pendiente', 'pendientes')} del mismo comercio`}
            activo={mismo}
            onCambio={setMismo}
          />
        )}
        {s && s.parecidos.length > 0 && (
          <FilaInterruptor
            texto={`También ${plural(s.parecidos.length, 'pendiente parecido', 'pendientes parecidos')}`}
            nota={nombres(s.parecidos)}
            activo={parecidos}
            onCambio={setParecidos}
          />
        )}
        {s && s.yaCategorizados.length > 0 && (
          <FilaInterruptor
            texto={`Cambiar también ${plural(s.yaCategorizados.length, 'ya categorizado', 'ya categorizados')} de otra forma`}
            nota="Del mismo comercio. Desactivado: lo que ya categorizaste no se toca"
            activo={yaHechos}
            onCambio={setYaHechos}
          />
        )}
        {categoria && <FilaInterruptor texto="Crear la regla para las próximas importaciones" nota="Los movimientos nuevos de estos comercios se categorizarán solos" activo={regla} onCambio={setRegla} />}
      </div>
    </Hoja>
  )
}

/** Tipos que se ofrecen según el signo: gasto de empleado para un gasto y reembolso para un ingreso */
const tiposPara = (m: Movimiento): TipoMovimiento[] => ['normal', m.importe < 0 ? 'gasto_empleado' : 'reembolso_empresa', 'traspaso_interno', 'pago_deuda']
const NOTA_TIPO: Record<TipoMovimiento, string> = {
  normal: 'Computa en el extracto',
  gasto_empleado: 'Un gasto de trabajo: no cuenta',
  reembolso_empresa: 'Lo que te devuelve la empresa: no cuenta',
  traspaso_interno: 'Entre tus cuentas o liquidación de la tarjeta',
  pago_deuda: 'Reduce la deuda familiar',
}

/**
 * Elegir categoría para unos movimientos: si hay pendientes parecidos (o del mismo comercio ya
 * categorizados de otra forma), abre la hoja de corrección; si no, aplica directamente con su regla
 * y el aviso con «Deshacer», sin pasos de más.
 */
// oxlint-disable-next-line react/only-export-components
export function useElegirCategoria(ids: string[], alAbrirCorreccion: (cat: string | null) => void) {
  const db = useDatos()
  const hacer = useHacer()
  return async (cat: string | null) => {
    const s = similares(db, ids, cat)
    if (s.mismoComercio.length || s.parecidos.length || s.yaCategorizados.length) return alAbrirCorreccion(cat)
    await hacer(
      (d) => cambiarCategoria(d, ids, cat, { crearRegla: !!cat }),
      cat ? `${nombreCategoria(db, cat)}${ids.length > 1 ? ` en ${ids.length} movimientos` : ''}. Regla creada para las próximas` : 'Sin categoría',
    )
  }
}

/** Detalle de un movimiento: categoría, tipo, mes y nota. Todo se guarda al momento */
export function DetalleMovimiento({ id, onCerrar }: { id: string | null; onCerrar: () => void }) {
  const db = useDatos()
  const hacer = useHacer()
  const m = id ? db.movimientos.find((x) => x.id === id) : undefined
  const [selector, setSelector] = useState(false)
  const [tipos, setTipos] = useState(false)
  const [correccion, setCorreccion] = useState<string | null | undefined>(undefined)
  const [nota, setNota] = useState<{ id: string; texto: string } | null>(null)
  const [estadoNota, setEstadoNota] = useState<'' | 'guardando' | 'guardada'>('')
  const elegir = useElegirCategoria(m ? [m.id] : [], setCorreccion)
  const textoNota = m && nota?.id === m.id ? nota.texto : (m?.nota ?? '')

  // La nota se guarda sola al dejar de escribir
  useEffect(() => {
    if (!m || !nota || nota.id !== m.id || nota.texto === (m.nota ?? '')) return
    const t = window.setTimeout(async () => {
      const e = await intentar((d) => guardarNota(d, m.id, nota.texto), 'Nota guardada')
      setEstadoNota(e ? '' : 'guardada')
    }, 600)
    return () => window.clearTimeout(t)
  }, [nota, m])

  if (!m) return null
  const cuenta = db.cuentas.find((c) => c.id === m.cuenta_id)
  const cat = db.categorias.find((c) => c.id === m.categoria_id)
  const raiz = raizDe(db, m.categoria_id)
  const cerrar = async () => {
    if (nota && nota.id === m.id && nota.texto !== (m.nota ?? '')) await intentar((d) => guardarNota(d, m.id, nota.texto), 'Nota guardada')
    setNota(null)
    setEstadoNota('')
    onCerrar()
  }

  return (
    <>
      <Hoja abierta={!!id} titulo="Movimiento" listo="Listo" onCerrar={cerrar}>
        <div className="space-y-5">
          <div className="flex flex-col items-center text-center">
            {m.tipo !== 'normal' ? (
              <Baldosa glifo={m.tipo === 'gasto_empleado' || m.tipo === 'reembolso_empresa' ? Briefcase : Tag} color={COLOR_TIPO[m.tipo]} tamano="lg" />
            ) : cat ? (
              <Baldosa icono={raiz?.icono ?? null} color={cat.color} tamano="lg" />
            ) : (
              <Baldosa glifo={Tag} color="#C7C7CC" tamano="lg" />
            )}
            <p className={`mt-3 text-[34px] leading-tight font-bold tracking-tight tabular-nums ${m.importe > 0 && m.tipo === 'normal' ? 'text-[#248A3D] dark:text-[#30D158]' : ''}`}>
              {formatearImporte(m.importe)}
            </p>
            <p className="mt-1 text-[17px]">{m.concepto_limpio}</p>
            <p className="text-[13px] text-zinc-500">
              {formatearFecha(m.fecha_operacion)}, {cuenta?.alias ?? '?'}
            </p>
          </div>

          <div className="lista divide-y divide-zinc-200/70 bg-zinc-100/70 dark:divide-zinc-800 dark:bg-zinc-800/50">
            <button className="fila min-h-12 active:bg-zinc-200/60 dark:active:bg-zinc-700/60" onClick={() => setSelector(true)}>
              <span className="text-[17px]">Categoría</span>
              <span className={`min-w-0 flex-1 truncate text-right text-[17px] ${m.categoria_id ? 'text-zinc-500' : 'text-[#FF9500]'}`}>{nombreCategoria(db, m.categoria_id)}</span>
              <ChevronRight className="size-4 shrink-0 text-zinc-400" />
            </button>
            <button className="fila min-h-12 active:bg-zinc-200/60 dark:active:bg-zinc-700/60" onClick={() => setTipos(true)}>
              <span className="text-[17px]">Tipo</span>
              <span className="min-w-0 flex-1 truncate text-right text-[17px] text-zinc-500">{NOMBRE_TIPO_MOVIMIENTO[m.tipo]}</span>
              <ChevronRight className="size-4 shrink-0 text-zinc-400" />
            </button>
            <div className="px-4 py-2.5">
              <FilaInterruptor
                texto={`Cuenta en ${nombreMes(`${mesSiguiente(m.fecha_operacion)}-01`)}`}
                nota="Cobros y cargos de fin de mes que son del mes siguiente"
                activo={!!m.mes_imputacion}
                onCambio={(v) => hacer((d) => imputarMesSiguiente(d, [m.id], v), v ? `Cuenta en ${nombreMes(`${mesSiguiente(m.fecha_operacion)}-01`)}` : 'Vuelve a su mes')}
              />
            </div>
          </div>
          {m.tipo !== 'normal' && <p className="-mt-3 px-4 text-[13px] text-zinc-500">No computa en el extracto ni en los totales.</p>}

          <div>
            <div className="mb-1.5 flex items-baseline justify-between px-4">
              <span className="text-[13px] text-zinc-500 uppercase">Nota</span>
              <span className="text-[13px] text-zinc-500" aria-live="polite">
                {estadoNota === 'guardando' ? 'Guardando…' : estadoNota === 'guardada' ? 'Guardada' : ''}
              </span>
            </div>
            <textarea
              className="campo min-h-20 rounded-xl border-0 bg-zinc-100/70 px-4 py-3 dark:bg-zinc-800/50"
              maxLength={500}
              placeholder="Añadir una nota"
              value={textoNota}
              onChange={(e) => {
                setNota({ id: m.id, texto: e.target.value })
                setEstadoNota('guardando')
              }}
            />
          </div>
          <p className="px-4 text-[13px] break-words text-zinc-500">
            Los cambios se guardan al momento. Concepto del banco, anonimizado: {m.concepto_original}
          </p>
        </div>
      </Hoja>

      <Hoja abierta={tipos} titulo="Tipo" listo="Listo" onCerrar={() => setTipos(false)}>
        <ul className="lista divide-y divide-zinc-200/70 bg-zinc-100/70 dark:divide-zinc-800 dark:bg-zinc-800/50">
          {[...new Set([...tiposPara(m), m.tipo])].map((t) => (
            <li key={t}>
              <button
                className="fila min-h-14 active:bg-zinc-200/60 dark:active:bg-zinc-700/60"
                onClick={async () => {
                  setTipos(false)
                  if (t !== m.tipo) await hacer((d) => cambiarTipo(d, [m.id], t), `Tipo: ${NOMBRE_TIPO_MOVIMIENTO[t]}`)
                }}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[17px]">{NOMBRE_TIPO_MOVIMIENTO[t]}</span>
                  <span className="block text-[13px] text-zinc-500">{NOTA_TIPO[t]}</span>
                </span>
                {m.tipo === t && <Check className="size-5 text-[#007AFF] dark:text-[#0A84FF]" strokeWidth={2.5} />}
              </button>
            </li>
          ))}
        </ul>
      </Hoja>
      <SelectorCategoria
        abierta={selector}
        actual={m.categoria_id}
        onElegir={(c) => {
          setSelector(false)
          if (c !== m.categoria_id) void elegir(c)
        }}
        onCerrar={() => setSelector(false)}
      />
      <HojaCorreccion ids={correccion !== undefined ? [m.id] : null} categoria={correccion ?? null} onCerrar={() => setCorreccion(undefined)} onHecho={() => setCorreccion(undefined)} />
    </>
  )
}
