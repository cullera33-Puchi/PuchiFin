/** Piezas comunes para mostrar y corregir movimientos */
import { Briefcase, Check, ChevronRight, Plus, Search, Tag } from 'lucide-react'
import { FormCrearCategoria } from './CrearCategoria'
import { useEffect, useMemo, useState } from 'react'
import { haySimilares, similares } from '../datos/categorizar'
import { cambiarCategoria, cambiarTipo, guardarNota, imputarMesSiguiente } from '../datos/movimientos'
import { mesSiguiente } from '../lib/imputacion'
import { obtenerDatos } from '../datos/almacen'
import { intentar, useDatos } from '../datos/ProveedorDatos'
import { claveComercio, esPasarela, normalizarConcepto } from '../lib/conceptos'
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
  // Crear una categoría al momento (con aviso de las parecidas que ya existen)
  const [creando, setCreando] = useState(false)
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
    setCreando(false)
    onElegir(id)
  }
  const botonCrear = (
    <button className="lista fila w-full border border-dashed border-zinc-300 text-marca-700 dark:border-zinc-700 dark:text-marca-500" onClick={() => setCreando(true)}>
      <Plus className="size-5" strokeWidth={2} />
      <span className="flex-1 text-[15px]">{busqueda.trim() ? `Crear «${busqueda.trim()}»` : 'Nueva categoría'}</span>
    </button>
  )

  return (
    <Hoja
      abierta={abierta}
      titulo={creando ? 'Nueva categoría' : 'Categoría'}
      onCerrar={() => {
        setCreando(false)
        onCerrar()
      }}
    >
      {creando ? (
        <FormCrearCategoria nombreInicial={busqueda.trim()} padreInicial={raizDe(db, actual ?? null)?.id ?? null} onListo={(id) => elegir(id)} onCancelar={() => setCreando(false)} />
      ) : (
      <>
      <label className="mb-3 flex items-center gap-2 rounded-[10px] bg-zinc-100 px-3 py-2 dark:bg-zinc-800">
        <Search className="size-4 text-zinc-500" />
        <input className="w-full bg-transparent outline-none" placeholder="Buscar" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
      </label>
      <div className="space-y-3">
        {botonCrear}
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
        {q && !grupos.length && <p className="px-1 text-[15px] text-zinc-500">Ninguna categoría se llama así.</p>}
      </div>
      </>
      )}
    </Hoja>
  )
}

/** Un grupo de movimientos que se pueden incluir en la corrección, cada uno con su casilla */
function GrupoMarcable({
  titulo,
  nota,
  movs,
  marcados,
  onCambio,
  pasarela,
}: {
  titulo: string
  nota?: string
  movs: Movimiento[]
  marcados: Set<string>
  onCambio: (ids: string[], incluir: boolean) => void
  pasarela: boolean
}) {
  const db = useDatos()
  if (!movs.length) return null
  const n = movs.filter((m) => marcados.has(m.id)).length
  const todos = n === movs.length
  return (
    <section>
      <div className="mb-1.5 flex items-end gap-2 px-1">
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-medium text-zinc-500 uppercase">{titulo}</span>
          {nota && <span className="block text-[12px] text-zinc-500">{nota}</span>}
        </span>
        <span className="shrink-0 text-[13px] text-zinc-500 tabular-nums">
          {n} de {movs.length}
        </span>
        <button type="button" className="boton-texto shrink-0 px-1" onClick={() => onCambio(movs.map((m) => m.id), !todos)}>
          {todos ? 'Ninguno' : 'Todos'}
        </button>
      </div>
      <ul className="lista divide-y divide-zinc-200/70 border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        {movs.map((m) => {
          const dentro = marcados.has(m.id)
          return (
            <li key={m.id}>
              <button type="button" className="flex min-h-12 w-full items-center gap-3 px-3 py-1.5 text-left active:bg-zinc-100 dark:active:bg-zinc-800" onClick={() => onCambio([m.id], !dentro)}>
                <span className={`grid size-[22px] shrink-0 place-items-center rounded-full border-2 ${dentro ? 'border-marca-600 bg-marca-600 text-white' : 'border-zinc-300 dark:border-zinc-600'}`}>
                  {dentro && <Check className="size-3.5" strokeWidth={3} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px]">{pasarela ? formatearFecha(m.fecha_operacion) : m.concepto_limpio}</span>
                  <span className={`block truncate text-[12px] ${m.categoria_id ? 'text-zinc-500' : 'text-[#FF9500]'}`}>
                    {pasarela ? '' : `${formatearFecha(m.fecha_operacion)}, `}
                    {nombreCategoria(db, m.categoria_id)}
                    {m.origen_categoria === 'manual' ? ', elegida por ti' : ''}
                  </span>
                </span>
                <span className="shrink-0 text-[15px] tabular-nums">{formatearImporte(m.importe)}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

const recientes = (movs: Movimiento[]) => [...movs].sort((a, b) => b.fecha_operacion.localeCompare(a.fecha_operacion))

/**
 * Corrección de categoría: además de los elegidos, lista para revisar los parecidos, cada uno con su
 * casilla: pendientes del mismo comercio y parecidos (marcados), ya categorizados del mismo comercio
 * (sin marcar, salvo en PayPal lo que puso una regla) y, en PayPal, el resto de cargos de PayPal (marcados
 * salvo los que elegiste tú). Así se reclasifica el histórico de golpe desmarcando lo que no aplique.
 * Crea la regla para las próximas importaciones. Todo con «Deshacer».
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
  const [regla, setRegla] = useState(true)
  const s = useMemo(() => (ids ? similares(db, ids, categoria) : null), [db, ids, categoria])
  // En PayPal, «el mismo comercio» es el mismo importe
  const pasarela = !!ids?.length && ids.every((id) => {
    const m = db.movimientos.find((x) => x.id === id)
    return !!m && esPasarela(claveComercio(m.concepto_limpio))
  })
  // Lo que se marca de entrada; se recalcula al abrir la hoja para otros movimientos o categoría
  const clave = `${ids?.join(',')}|${categoria}`
  const [marcados, setMarcados] = useState<{ clave: string; ids: Set<string> } | null>(null)
  const iniciales = useMemo(() => {
    if (!s) return new Set<string>()
    const noManual = (m: Movimiento) => m.origen_categoria !== 'manual'
    return new Set(
      [...s.mismoComercio, ...s.parecidos, ...(pasarela ? s.yaCategorizados.filter(noManual) : []), ...s.otrosPasarela.filter(noManual)].map((m) => m.id),
    )
  }, [s, pasarela])
  const actuales = marcados?.clave === clave ? marcados.ids : iniciales
  const cambiar = (lista: string[], incluir: boolean) => {
    const n = new Set(actuales)
    lista.forEach((id) => (incluir ? n.add(id) : n.delete(id)))
    setMarcados({ clave, ids: n })
  }

  const aplicar = async () => {
    if (!ids || !s) return
    const extras = [...actuales].filter((id) => !ids.includes(id))
    const total = ids.length + extras.length
    const ok = await hacer(
      (d) =>
        // En PayPal la regla es solo para el importe del elegido; el resto se cambia sin crear reglas
        pasarela
          ? cambiarCategoria(extras.length ? cambiarCategoria(d, extras, categoria) : d, ids, categoria, { crearRegla: regla && !!categoria })
          : cambiarCategoria(d, [...ids, ...extras], categoria, { crearRegla: regla && !!categoria }),
      `${plural(total, 'movimiento', 'movimientos')}: ${nombreCategoria(obtenerDatos(), categoria)}`,
    )
    if (ok) {
      setMarcados(null)
      onHecho?.(total)
    }
  }
  const total = (ids?.length ?? 0) + [...actuales].filter((id) => !ids?.includes(id)).length
  return (
    <Hoja
      abierta={!!ids}
      titulo={`Cambiar a ${nombreCategoria(db, categoria)}`}
      onCerrar={() => {
        setMarcados(null)
        onCerrar()
      }}
      acciones={
        <>
          <button className="boton-secundario" onClick={onCerrar}>
            Cancelar
          </button>
          <button className="boton-primario" onClick={aplicar}>
            Aplicar a {plural(total, 'movimiento', 'movimientos')}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <p className="px-1 text-[13px] text-zinc-500">Revisa la lista y desmarca lo que no sea de {nombreCategoria(db, categoria)}. El movimiento que elegiste se cambia siempre.</p>
        {s && (
          <>
            <GrupoMarcable
              titulo={pasarela ? 'PayPal del mismo importe, sin categoría' : 'Del mismo comercio, sin categoría'}
              movs={recientes(s.mismoComercio)}
              marcados={actuales}
              onCambio={cambiar}
              pasarela={pasarela}
            />
            <GrupoMarcable titulo="Parecidos, sin categoría" movs={recientes(s.parecidos)} marcados={actuales} onCambio={cambiar} pasarela={false} />
            <GrupoMarcable
              titulo={pasarela ? 'PayPal del mismo importe, ya categorizados' : 'Del mismo comercio, ya categorizados'}
              nota={pasarela ? undefined : 'Sin marcar: lo ya categorizado solo cambia si lo marcas'}
              movs={recientes(s.yaCategorizados)}
              marcados={actuales}
              onCambio={cambiar}
              pasarela={pasarela}
            />
            <GrupoMarcable
              titulo="Otros cargos de PayPal"
              nota="De otros importes. Los que categorizaste tú vienen sin marcar"
              movs={recientes(s.otrosPasarela)}
              marcados={actuales}
              onCambio={cambiar}
              pasarela
            />
          </>
        )}
        {categoria && (
          <div className="lista bg-zinc-100/70 dark:bg-zinc-800/50">
            <FilaInterruptor
              texto="Crear la regla para las próximas importaciones"
              nota={pasarela ? 'Los próximos cargos de PayPal con el importe del elegido se categorizarán solos' : 'Los movimientos nuevos de estos comercios se categorizarán solos'}
              activo={regla}
              onCambio={setRegla}
            />
          </div>
        )}
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
    if (haySimilares(s)) return alAbrirCorreccion(cat)
    await hacer(
      (d) => cambiarCategoria(d, ids, cat, { crearRegla: !!cat }),
      cat ? `${nombreCategoria(obtenerDatos(), cat)}${ids.length > 1 ? ` en ${ids.length} movimientos` : ''}. Regla creada para las próximas` : 'Sin categoría',
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
