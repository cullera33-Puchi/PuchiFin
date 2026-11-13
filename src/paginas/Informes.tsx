import { ChartColumn, Check, ChevronLeft, ChevronRight, Sheet, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { BarraNavegacion, Encabezado } from '../componentes/Encabezado'
import { FilaMovimientoDeslizable } from '../componentes/FilaMovimientoDeslizable'
import { Deslizable } from '../componentes/gestos'
import { Segmentado, useInterfaz } from '../componentes/Interfaz'
import { DetalleMovimiento } from '../componentes/movimientos'
import { useDatos } from '../datos/ProveedorDatos'
import { diaLargo, hoyIso, MESES, mesLargo } from '../lib/fechas'
import { formatearImporte, plural } from '../lib/formato'
import { calcularInforme, moverPeriodo, periodoDeFecha, porcionesGrafico, type Escala, type Informe, type PeriodoInforme, type Vista } from '../lib/informes'
import { porcentaje } from '../lib/resumen'
import { porDia } from '../lib/vista'

/*
 * Informes: gastos o ingresos de un mes o un año en un gráfico de quesito por categoría, con el
 * desglose por subcategoría y los movimientos al tocar una categoría.
 * Colores: paleta categórica validada (claro y oscuro), por posición en el gráfico; la leyenda de
 * debajo lleva el nombre, así que la identidad nunca depende solo del color.
 */
const SERIES = Array.from({ length: 8 }, (_, i) => `var(--serie-${i + 1})`)
const color = (i: number, otras?: boolean) => (otras ? 'var(--serie-otras)' : SERIES[i % SERIES.length])
const euroCorto = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })} k€` : `${Math.round(v)} €`)

/** Estado del informe en la dirección (se conserva al volver de una categoría) */
function useEstadoInforme() {
  const [params, setParams] = useSearchParams()
  const hoy = hoyIso()
  const vista: Vista = params.get('vista') === 'ingreso' ? 'ingreso' : 'gasto'
  const escala: Escala = params.get('escala') === 'anio' ? 'anio' : 'mes'
  const periodo: PeriodoInforme = { escala, clave: params.get('p') ?? periodoDeFecha(escala, hoy).clave }
  // Subcategoría elegida dentro de una categoría: es un paso más, «atrás» vuelve a la categoría entera
  const sub = params.get('sub') ?? undefined
  const ir = (cambios: { vista?: Vista; escala?: Escala; p?: string }) => {
    const e = cambios.escala ?? escala
    // Al pasar de mes a año se queda el año del mes; de año a mes, el mes en curso o diciembre
    const deEscala = e === escala ? periodo.clave : e === 'anio' ? periodo.clave.slice(0, 4) : hoy.startsWith(periodo.clave) ? hoy.slice(0, 7) : `${periodo.clave}-12`
    const p = cambios.p ?? deEscala
    setParams({ vista: cambios.vista ?? vista, escala: e, p, ...(sub ? { sub } : {}) }, { replace: true })
  }
  const elegirSub = (id: string | undefined) => {
    const base = { vista, escala, p: periodo.clave }
    if (id) setParams({ ...base, sub: id }, { replace: !!sub })
    else if (sub && window.history.state?.idx > 0) window.history.back()
    else setParams(base, { replace: true })
  }
  const consulta = `vista=${vista}&escala=${escala}&p=${periodo.clave}`
  return { hoy, vista, escala, periodo, ir, consulta, sub, elegirSub }
}

const nombrePeriodo = (p: PeriodoInforme) => (p.escala === 'mes' ? mesLargo(`${p.clave}-01`) : `Año ${p.clave}`)

export function Informes() {
  const db = useDatos()
  const navegar = useNavigate()
  const { hoy, vista, escala, periodo, ir, consulta } = useEstadoInforme()
  const informe = useMemo(() => calcularInforme(db, periodo, vista, undefined, hoy), [db, periodo.clave, periodo.escala, vista, hoy]) // eslint-disable-line react-hooks/exhaustive-deps
  const primero = useMemo(() => db.movimientos.reduce((min, m) => (m.fecha_operacion < min ? m.fecha_operacion : min), hoy), [db.movimientos, hoy])
  const anterior = moverPeriodo(periodo, -1)
  const siguiente = moverPeriodo(periodo, 1)
  const hayAnterior = anterior.clave >= periodoDeFecha(escala, primero).clave
  const haySiguiente = siguiente.clave <= periodoDeFecha(escala, hoy).clave

  return (
    <>
      <Encabezado
        titulo="Informes"
        accion={
          <Link to="/analisis" className="boton-icono" aria-label="Evolución y cierre anual" title="Evolución y cierre anual">
            <ChartColumn className="size-[22px]" strokeWidth={1.75} />
          </Link>
        }
      />
      <div className="mb-3 grid grid-cols-[1fr_auto] gap-2">
        <Segmentado etiqueta="Qué ver" opciones={[['gasto', 'Gastos'], ['ingreso', 'Ingresos']]} valor={vista} onCambio={(v) => ir({ vista: v })} />
        <Segmentado etiqueta="Periodo" opciones={[['mes', 'Mes'], ['anio', 'Año']]} valor={escala} onCambio={(e) => ir({ escala: e })} />
      </div>
      <div className="mb-3 flex items-center gap-1">
        <button className="boton-icono" aria-label="Periodo anterior" disabled={!hayAnterior} onClick={() => ir({ p: anterior.clave })}>
          <ChevronLeft className="size-6" strokeWidth={2} />
        </button>
        <h2 className="flex-1 text-center text-[17px] font-semibold">{nombrePeriodo(periodo)}</h2>
        <button className="boton-icono" aria-label="Periodo siguiente" disabled={!haySiguiente} onClick={() => ir({ p: siguiente.clave })}>
          <ChevronRight className="size-6" strokeWidth={2} />
        </button>
      </div>

      <Deslizable onAnterior={() => ir({ p: anterior.clave })} onSiguiente={() => ir({ p: siguiente.clave })} hayAnterior={hayAnterior} haySiguiente={haySiguiente}>
        <div className="space-y-4">
          <Totales informe={informe} onVista={(v) => ir({ vista: v })} />
          <PanelQuesito informe={informe} onAbrir={(id) => navegar(`/informes/categoria/${id ?? 'sin'}?${consulta}`)} />
          <Evolucion db={db} informe={informe} onPeriodo={(p) => ir({ p })} />
        </div>
      </Deslizable>
    </>
  )
}

/** Ingresos, gastos y ahorro del periodo; Ingresos y Gastos cambian el gráfico */
function Totales({ informe, onVista }: { informe: Informe; onVista: (v: Vista) => void }) {
  const t = informe.totales
  const a = informe.totalesAnteriores
  const casillas: { clave: Vista; texto: string; valor: number; antes: number }[] = [
    { clave: 'ingreso', texto: 'Ingresos', valor: t.ingresos, antes: a.ingresos },
    { clave: 'gasto', texto: 'Gastos', valor: t.gastos, antes: a.gastos },
  ]
  const conAnterior = a.movimientos > 0
  const difAhorro = Math.round((t.ahorro - a.ahorro) * 100) / 100
  return (
    <div className="grid grid-cols-2 gap-2">
      {casillas.map((c) => {
        const activa = c.clave === informe.vista
        const contenido = (
          <>
            <span className="block text-[11px] text-zinc-500">{c.texto}</span>
            <span className="block truncate text-[17px] font-semibold tabular-nums">{formatearImporte(c.valor)}</span>
            {conAnterior && (
              <span className="block truncate text-[11px] text-zinc-500 tabular-nums">
                {c.valor - c.antes >= 0 ? '+' : ''}
                {formatearImporte(Math.round((c.valor - c.antes) * 100) / 100)}
              </span>
            )}
          </>
        )
        return (
          <button
            key={c.clave}
            aria-pressed={activa}
            onClick={() => onVista(c.clave)}
            className={`tarjeta px-3 py-2.5 text-left ring-2 transition ${activa ? 'ring-marca-600 dark:ring-marca-500' : 'ring-transparent'}`}
          >
            {contenido}
          </button>
        )
      })}
      <p className="col-span-2 px-1 text-[13px] text-zinc-500">
        Ahorro: <span className="font-semibold text-zinc-900 tabular-nums dark:text-zinc-100">{formatearImporte(t.ahorro)}</span>
        {t.tasaAhorro !== null && t.tasaAhorro >= -1 && ` (${porcentaje(t.tasaAhorro)})`}
        {conAnterior && `. Diferencias frente a ${informe.periodo.escala === 'mes' ? mesLargo(`${informe.anterior.clave}-01`).toLowerCase() : informe.anterior.clave}${informe.enCurso ? ' con los mismos días' : ''}: ahorro ${difAhorro >= 0 ? '+' : ''}${formatearImporte(difAhorro)}.`}
      </p>
    </div>
  )
}

/**
 * Quesito con el total en el centro y la leyenda en forma de lista. Tocar una fila abre su detalle
 * (onAbrir) o filtra los movimientos por ella (onElegir, con la elegida marcada).
 */
function PanelQuesito({
  informe,
  onAbrir,
  onElegir,
  elegida,
}: {
  informe: Informe
  onAbrir?: (id: string | null) => void
  onElegir?: (id: string | null) => void
  elegida?: string | null
}) {
  const [marcada, setMarcada] = useState<number | null>(null)
  const grafico = porcionesGrafico(informe.porciones)
  const nombre = informe.vista === 'gasto' ? 'Gastos' : 'Ingresos'
  if (!informe.porciones.length) {
    return <p className="tarjeta text-center text-[15px] text-zinc-500">Sin {nombre.toLowerCase()} en este periodo.</p>
  }
  const sel = marcada !== null ? grafico[marcada] : null
  // La leyenda lista todas las categorías; las agrupadas en «Otras» comparten su color
  const indice = new Map(grafico.map((p, i) => [p.id, i]))
  const iOtras = grafico.findIndex((p) => p.otras)
  return (
    <section className="tarjeta">
      <div className="relative mx-auto aspect-square w-full max-w-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={grafico}
              dataKey="importe"
              nameKey="nombre"
              innerRadius="64%"
              outerRadius="96%"
              startAngle={90}
              endAngle={-270}
              stroke="var(--graf-superficie)"
              strokeWidth={2}
              cornerRadius={4}
              isAnimationActive={!matchMedia('(prefers-reduced-motion: reduce)').matches}
              onClick={(_, i) => setMarcada((m) => (m === i ? null : i))}
            >
              {grafico.map((p, i) => (
                <Cell key={p.id ?? 'sin'} fill={color(i, p.otras)} opacity={marcada === null || marcada === i ? 1 : 0.35} className="cursor-pointer outline-none" />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-[22%] flex flex-col items-center justify-center text-center" aria-live="polite">
          <span className="max-w-full truncate text-[13px] text-zinc-500">{sel ? sel.nombre : nombre}</span>
          <span className="text-[22px] leading-tight font-bold tabular-nums">{formatearImporte(sel ? sel.importe : informe.total)}</span>
          <span className="text-[13px] text-zinc-500 tabular-nums">{sel ? porcentaje(sel.peso) : `${informe.movimientos.length} movimientos`}</span>
        </div>
      </div>

      <ul className="mt-3 divide-y divide-zinc-200/70 dark:divide-zinc-800">
        {informe.porciones.map((p) => {
          const i = indice.get(p.id) ?? iOtras
          const dif = Math.round((p.importe - p.anterior) * 100) / 100
          const fila = (
            <>
              <span className="size-3 shrink-0 rounded-[3px]" style={{ background: i >= 0 ? color(i, grafico[i]?.otras) : 'var(--serie-otras)' }} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px]">{p.nombre}</span>
                <span className="block text-[11px] text-zinc-500 tabular-nums">
                  {porcentaje(p.peso)}
                  {informe.totalesAnteriores.movimientos > 0 && `, ${dif >= 0 ? '+' : ''}${formatearImporte(dif)}`}
                </span>
              </span>
              <span className="text-[15px] tabular-nums">{formatearImporte(p.importe)}</span>
              {onElegir ? (
                <Check className={`size-5 shrink-0 text-[#007AFF] dark:text-[#0A84FF] ${elegida === p.id ? '' : 'invisible'}`} strokeWidth={2.5} />
              ) : (
                <ChevronRight className="size-4 shrink-0 text-zinc-400" strokeWidth={2} />
              )}
            </>
          )
          const activa = onElegir && elegida === p.id
          return (
            <li key={p.id ?? 'sin'}>
              <button
                aria-pressed={onElegir ? activa : undefined}
                className={`flex min-h-11 w-full items-center gap-3 py-1.5 text-left active:opacity-60 ${onElegir && elegida !== undefined && !activa ? 'opacity-50' : ''}`}
                onClick={() => (onElegir ? onElegir(p.id) : onAbrir?.(p.id))}
              >
                {fila}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** Barras de los últimos 6 meses (vista mensual) o de los meses del año (vista anual) */
function Evolucion({ db, informe, onPeriodo, categoria }: { db: ReturnType<typeof useDatos>; informe: Informe; onPeriodo: (clave: string) => void; categoria?: string | null }) {
  const { periodo, vista } = informe
  const meses = useMemo(() => {
    const lista =
      periodo.escala === 'mes'
        ? Array.from({ length: 6 }, (_, i) => moverPeriodo(periodo, i - 5))
        : Array.from({ length: 12 }, (_, i) => ({ escala: 'mes' as const, clave: `${periodo.clave}-${String(i + 1).padStart(2, '0')}` }))
    const datos = lista.map((p) => ({ clave: p.clave, nombre: MESES[Number(p.clave.slice(5, 7)) - 1].slice(0, 3), importe: calcularInforme(db, p, vista, categoria).total }))
    // Sin los meses vacíos del principio (antes de tener datos)
    const desde = datos.findIndex((d) => d.importe !== 0)
    return periodo.escala === 'mes' && desde > 0 ? datos.slice(desde) : datos
  }, [db, periodo, vista, categoria])
  if (!meses.some((m) => m.importe)) return null
  return (
    <section className="tarjeta">
      <h3 className="mb-2 text-[13px] font-medium text-zinc-500 uppercase">
        {periodo.escala === 'mes' ? 'Últimos 6 meses' : 'Mes a mes'}, {vista === 'gasto' ? 'gastos' : 'ingresos'}
      </h3>
      <div className="h-36">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={meses} margin={{ top: 18, right: 0, bottom: 0, left: 0 }}>
            <XAxis dataKey="nombre" stroke="var(--graf-texto)" fontSize={11} tickLine={false} axisLine={false} interval={0} />
            <Tooltip
              formatter={(v) => [formatearImporte(Number(v)), vista === 'gasto' ? 'Gastos' : 'Ingresos']}
              contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.15)', fontSize: 13 }}
              cursor={{ fill: 'var(--graf-rejilla)', opacity: 0.5 }}
            />
            <Bar
              dataKey="importe"
              radius={[4, 4, 0, 0]}
              maxBarSize={28}
              onClick={(d) => periodo.escala === 'mes' && onPeriodo((d as unknown as { clave: string }).clave)}
              label={(props: { x?: number | string; y?: number | string; width?: number | string; value?: unknown }) =>
                Number(props.value) ? (
                  <text x={Number(props.x) + Number(props.width) / 2} y={Number(props.y) - 5} textAnchor="middle" fontSize={10} fill="var(--graf-texto)">
                    {euroCorto(Number(props.value))}
                  </text>
                ) : null
              }
            >
              {meses.map((m) => (
                <Cell key={m.clave} fill="var(--serie-1)" opacity={periodo.escala === 'anio' || m.clave === periodo.clave ? 1 : 0.4} className="cursor-pointer" />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}

/** Una categoría del informe: sus subcategorías en el quesito y sus movimientos */
export function InformeCategoria() {
  const db = useDatos()
  const { id } = useParams()
  const { avisar } = useInterfaz()
  const { hoy, vista, periodo, ir, sub, elegirSub } = useEstadoInforme()
  const categoriaId = id === 'sin' ? null : (id ?? null)
  const categoria = db.categorias.find((c) => c.id === categoriaId)
  const informe = useMemo(() => calcularInforme(db, periodo, vista, categoriaId, hoy), [db, periodo.clave, periodo.escala, vista, categoriaId, hoy]) // eslint-disable-line react-hooks/exhaustive-deps
  const [detalle, setDetalle] = useState<string | null>(null)
  const porcionSub = sub === undefined ? undefined : informe.porciones.find((p) => p.id === sub)
  const nombreSub = porcionSub?.nombre ?? (sub ? db.categorias.find((c) => c.id === sub)?.nombre : undefined)
  const movimientos = sub === undefined ? informe.movimientos : informe.movimientos.filter((m) => m.categoria_id === sub)
  const totalVisto = Math.round((vista === 'gasto' ? -1 : 1) * movimientos.reduce((s, m) => s + m.importe, 0) * 100) / 100
  const anterior = moverPeriodo(periodo, -1)
  const siguiente = moverPeriodo(periodo, 1)
  const haySiguiente = siguiente.clave <= periodoDeFecha(periodo.escala, hoy).clave

  const exportar = async () => {
    const r = await (await import('../lib/exportarExcel')).exportarVista(db, `informe ${categoria?.nombre ?? 'sin categoria'}${nombreSub ? ` ${nombreSub}` : ''} ${periodo.clave}`, movimientos, [
      ['Informe', `${vista === 'gasto' ? 'Gastos' : 'Ingresos'}, ${categoria?.nombre ?? 'Sin categoría'}${nombreSub ? `, ${nombreSub}` : ''}`],
      ['Periodo', nombrePeriodo(periodo)],
      ['Total', informe.total],
      [],
      ['Subcategoría', 'Importe', 'Peso (%)', 'Periodo anterior'],
      ...informe.porciones.map((p) => [p.nombre, p.importe, Math.round(p.peso * 1000) / 10, p.anterior]),
    ])
    if (r === 'descargado') avisar('Excel descargado')
  }

  return (
    <>
      <BarraNavegacion
        titulo={sub !== undefined ? (nombreSub ?? 'Subcategoría') : (categoria?.nombre ?? 'Sin categoría')}
        atras={sub !== undefined ? (categoria?.nombre ?? 'Atrás') : 'Informes'}
        subtitulo={`${nombrePeriodo(periodo)}. ${formatearImporte(sub !== undefined ? totalVisto : informe.total)} en ${plural(movimientos.length, 'movimiento', 'movimientos')}`}
        accion={
          <button className="boton-icono" aria-label="Exportar a Excel" title="Exportar a Excel" onClick={exportar}>
            <Sheet className="size-[22px]" strokeWidth={1.75} />
          </button>
        }
      />
      <div className="mb-3 flex items-center gap-1">
        <button className="boton-icono" aria-label="Periodo anterior" onClick={() => ir({ p: anterior.clave })}>
          <ChevronLeft className="size-6" strokeWidth={2} />
        </button>
        <h2 className="flex-1 text-center text-[17px] font-semibold">{nombrePeriodo(periodo)}</h2>
        <button className="boton-icono" aria-label="Periodo siguiente" disabled={!haySiguiente} onClick={() => ir({ p: siguiente.clave })}>
          <ChevronRight className="size-6" strokeWidth={2} />
        </button>
      </div>
      {/* Sin cambio de mes deslizando: en una pantalla apilada, deslizar a la derecha es volver */}
      <div>
        <div className="space-y-4">
          {informe.porciones.length > 1 && <PanelQuesito informe={informe} elegida={sub} onElegir={(id) => elegirSub(id === sub || !id ? undefined : id)} />}
          <Evolucion db={db} informe={informe} categoria={categoriaId} onPeriodo={(p) => ir({ p })} />
          {informe.porciones.length > 1 && (
            <div className="flex items-center gap-2 px-1">
              <p className="min-w-0 flex-1 text-[13px] text-zinc-500">
                {sub === undefined ? (
                  <>Todos los movimientos. Toca una subcategoría para ver solo los suyos.</>
                ) : (
                  <>
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100">{nombreSub ?? 'Subcategoría'}</span>: {formatearImporte(totalVisto)} en {plural(movimientos.length, 'movimiento', 'movimientos')}
                  </>
                )}
              </p>
              {sub !== undefined && (
                <button className="boton-texto inline-flex shrink-0 items-center gap-1 px-2" onClick={() => elegirSub(undefined)}>
                  <X className="size-4" strokeWidth={2} /> Ver todos
                </button>
              )}
            </div>
          )}
          {movimientos.length === 0 ? (
            <p className="tarjeta text-center text-[15px] text-zinc-500">Sin movimientos en este periodo.</p>
          ) : (
            porDia(movimientos).map(([dia, lista]) => (
              <section key={dia}>
                <h3 className="cabecera-grupo">{diaLargo(dia, periodo.escala === 'anio')}</h3>
                <ul className="lista divide-y divide-zinc-200/70 dark:divide-zinc-800">
                  {lista.map((m) => (
                    <li key={m.id}>
                      <FilaMovimientoDeslizable m={m} onPulsar={() => setDetalle(m.id)} />
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      </div>
      <DetalleMovimiento id={detalle} onCerrar={() => setDetalle(null)} />
    </>
  )
}
