import { ChartColumn, Check, ChevronRight, Repeat, Sheet, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Bar, BarChart, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { BarraNavegacion, Encabezado } from '../componentes/Encabezado'
import { FilaMovimientoDeslizable } from '../componentes/FilaMovimientoDeslizable'
import { opcionesAnios, opcionesMeses, TiraPeriodos } from '../componentes/TiraPeriodos'
import { Segmentado, useInterfaz } from '../componentes/Interfaz'
import { DetalleMovimiento } from '../componentes/movimientos'
import { useDatos } from '../datos/ProveedorDatos'
import { diaLargo, hoyIso, MESES, mesLargo } from '../lib/fechas'
import { formatearImporte, formatearRedondo, plural } from '../lib/formato'
import { calcularInforme, moverPeriodo, periodoDeFecha, porcionesGrafico, type Escala, type Informe, type PeriodoInforme, type Vista } from '../lib/informes'
import { calcularTotales, porcentaje } from '../lib/resumen'
import { calcularPosicion } from '../lib/posicion'
import { mesEfectivo } from '../lib/imputacion'
import { porDia } from '../lib/vista'
import { gastosHormiga, IMPORTE_HORMIGA, rankingComercios } from '../lib/comercios'
import { textoInforme } from '../lib/analizar'
import { BotonClaude, HojaClaude } from '../componentes/HojaClaude'
import { TarjetaDeuda } from '../componentes/TarjetaDeuda'
import { avisosRecurrentes, detectarRecurrentes, resumenFijos } from '../lib/recurrentes'
import { Baldosa } from '../componentes/Icono'

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

/** Desde el informe anual, tocar la barra de un mes abre ese mes, arriba del todo */
const irAlMes = (ir: (c: { escala?: Escala; p?: string }) => void, mes: string) => {
  ir({ escala: 'mes', p: mes })
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

/** Opciones de la tira de periodos: de los primeros datos a hoy */
const tiraDe = (escala: Escala, primero: string, hoy: string) => (escala === 'mes' ? opcionesMeses(primero.slice(0, 7), hoy.slice(0, 7)) : opcionesAnios(primero, hoy))

const nombrePeriodo = (p: PeriodoInforme) => (p.escala === 'mes' ? mesLargo(`${p.clave}-01`) : `Año ${p.clave}`)

export function Informes() {
  const db = useDatos()
  const navegar = useNavigate()
  const { hoy, vista, escala, periodo, ir, consulta } = useEstadoInforme()
  const informe = useMemo(() => calcularInforme(db, periodo, vista, undefined, hoy), [db, periodo.clave, periodo.escala, vista, hoy]) // eslint-disable-line react-hooks/exhaustive-deps
  const primero = useMemo(() => db.movimientos.reduce((min, m) => (m.fecha_operacion < min ? m.fecha_operacion : min), hoy), [db.movimientos, hoy])
  const [claude, setClaude] = useState(false)

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
      <div className="mb-3">
        <TiraPeriodos etiqueta="Periodo del informe" opciones={tiraDe(escala, primero, hoy)} valor={periodo.clave} onElegir={(p) => ir({ p })} />
      </div>

      {/* El periodo se cambia con la tira (sin gesto lateral, v0.26.0) */}
      <div>
        <div className="space-y-4">
          <Totales informe={informe} onVista={(v) => ir({ vista: v })} />
          <PanelQuesito informe={informe} onAbrir={(id) => navegar(`/informes/categoria/${id ?? 'sin'}?${consulta}`)} />
          <TarjetaDeuda className="" />
          {vista === 'gasto' && <TarjetaFijos />}
          <SeccionComercios informe={informe} movimientos={informe.movimientos} />
          {vista === 'gasto' && <SeccionHormiga informe={informe} hoy={hoy} />}
          <Evolucion db={db} informe={informe} onPeriodo={(p) => (p.length === 7 && escala === 'anio' ? irAlMes(ir, p) : ir({ p }))} />
          <SeccionCapital db={db} />
          <BotonClaude onPulsar={() => setClaude(true)} />
        </div>
      </div>
      <HojaClaude
        abierta={claude}
        titulo="Analizar con Claude"
        explicacion="Claude analiza el gasto del periodo frente al anterior, los comercios que más pesan y qué recortar."
        texto={claude ? textoInforme(db, periodo, hoy) : ''}
        archivo={`puchifin-informe-${periodo.clave}.txt`}
        registro="Analizar informe"
        onCerrar={() => setClaude(false)}
      />
    </>
  )
}

/** Ingresos, gastos y ahorro del periodo; Ingresos y Gastos cambian el gráfico */
function Totales({ informe, onVista }: { informe: Informe; onVista: (v: Vista) => void }) {
  const t = informe.totales
  const a = informe.totalesAnteriores
  const h = informe.haceUnAno?.totales
  const casillas: { clave: Vista; texto: string; valor: number; antes: number; anio: number | null }[] = [
    { clave: 'ingreso', texto: 'Ingresos', valor: t.ingresos, antes: a.ingresos, anio: h ? h.ingresos : null },
    { clave: 'gasto', texto: 'Gastos', valor: t.gastos, antes: a.gastos, anio: h ? h.gastos : null },
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
            {c.anio !== null && <span className="block truncate text-[11px] text-zinc-500 tabular-nums">Hace un año: {formatearImporte(c.anio)}</span>}
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

/** Acceso a los gastos fijos: coste mensual, cuántos y avisos */
function TarjetaFijos() {
  const db = useDatos()
  const datos = useMemo(() => {
    const rec = detectarRecurrentes(db)
    return { r: resumenFijos(rec, hoyIso()), avisos: avisosRecurrentes(db, rec).length }
  }, [db])
  if (!datos.r.activos.length) return null
  return (
    <Link to="/informes/fijos" className="tarjeta flex items-center gap-3 active:opacity-70">
      <Baldosa glifo={Repeat} color="#5856D6" />
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold">Gastos fijos: {formatearImporte(datos.r.alMes)} al mes</span>
        <span className="block text-[12px] text-zinc-500">
          {plural(datos.r.activos.length, 'cargo recurrente', 'cargos recurrentes')}
          {datos.r.proximos.length ? `, ${datos.r.proximos.length} en los próximos 30 días` : ''}
          {datos.avisos ? `. ${plural(datos.avisos, 'aviso', 'avisos')}` : ''}
        </span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-zinc-400" />
    </Link>
  )
}

/** Fecha de un periodo para buscarlo en Movimientos (solo el mes; el año, sin filtro de mes) */
const buscarComercio = (navegar: ReturnType<typeof useNavigate>, clave: string, periodo: PeriodoInforme) =>
  navegar(`/movimientos?q=${encodeURIComponent(clave)}${periodo.escala === 'mes' ? `&mes=${periodo.clave}` : ''}`)

/** Dónde más se gasta (o de dónde vienen los ingresos) del periodo, por importe o por veces */
function SeccionComercios({ informe, movimientos }: { informe: Informe; movimientos: Informe['movimientos'] }) {
  const navegar = useNavigate()
  const [orden, setOrden] = useState<'importe' | 'veces'>('importe')
  const lista = useMemo(() => rankingComercios(movimientos, informe.vista === 'gasto' ? -1 : 1, orden), [movimientos, informe.vista, orden])
  if (lista.length < 2) return null
  return (
    <section className="tarjeta">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="flex-1 text-[13px] font-medium text-zinc-500 uppercase">{informe.vista === 'gasto' ? 'Dónde más gastas' : 'De dónde vienen'}</h3>
        <div className="w-40">
          <Segmentado etiqueta="Ordenar por" opciones={[['importe', 'Importe'], ['veces', 'Veces']]} valor={orden} onCambio={setOrden} />
        </div>
      </div>
      <ol className="divide-y divide-zinc-200/70 dark:divide-zinc-800">
        {lista.map((l, i) => (
          <li key={l.clave}>
            <button className="flex min-h-11 w-full items-center gap-3 py-1.5 text-left active:opacity-60" onClick={() => buscarComercio(navegar, l.clave, informe.periodo)}>
              <span className="w-5 shrink-0 text-right text-[13px] text-zinc-500 tabular-nums">{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px]">{l.nombre}</span>
                <span className="block text-[11px] text-zinc-500">{l.veces === 1 ? '1 vez' : `${l.veces} veces`}</span>
              </span>
              <span className="text-[15px] tabular-nums">{formatearImporte(l.importe)}</span>
              <ChevronRight className="size-4 shrink-0 text-zinc-400" strokeWidth={2} />
            </button>
          </li>
        ))}
      </ol>
    </section>
  )
}

/** Meses que dura el periodo hasta hoy (fraccionario si está en curso), para el ritmo anual */
function mesesDelPeriodo(p: PeriodoInforme, hoy: string): number {
  if (!hoy.startsWith(p.clave)) return p.escala === 'mes' ? 1 : 12
  const dia = Number(hoy.slice(8, 10))
  if (p.escala === 'mes') return dia / new Date(Date.UTC(Number(p.clave.slice(0, 4)), Number(p.clave.slice(5, 7)), 0)).getUTCDate()
  return Number(hoy.slice(5, 7)) - 1 + dia / 30.4
}

/** Gastos hormiga: compras pequeñas y frecuentes, su total y lo que suman en un año */
function SeccionHormiga({ informe, hoy }: { informe: Informe; hoy: string }) {
  const navegar = useNavigate()
  // En un año, los meses con datos (un año con datos solo desde octubre son tres meses, no doce)
  const meses = useMemo(() => {
    const m = mesesDelPeriodo(informe.periodo, hoy)
    return informe.periodo.escala === 'anio' ? Math.max(1, Math.min(m, new Set(informe.movimientos.map(mesEfectivo)).size)) : m
  }, [informe, hoy])
  const h = useMemo(() => gastosHormiga(informe.movimientos, meses), [informe, meses])
  if (!h) return null
  return (
    <section className="tarjeta">
      <h3 className="text-[13px] font-medium text-zinc-500 uppercase">Gastos hormiga</h3>
      <p className="mt-1 text-[22px] leading-tight font-bold tabular-nums">{formatearImporte(h.total)}</p>
      <p className="text-[13px] text-zinc-500">
        {h.compras} compras de hasta {IMPORTE_HORMIGA} € en sitios donde repites. A este ritmo, unos <span className="font-semibold text-zinc-900 dark:text-zinc-100">{formatearRedondo(h.alAno)}</span> al año.
      </p>
      <ul className="mt-2 divide-y divide-zinc-200/70 dark:divide-zinc-800">
        {h.comercios.slice(0, 5).map((c) => (
          <li key={c.clave}>
            <button className="flex min-h-11 w-full items-center gap-3 py-1.5 text-left active:opacity-60" onClick={() => buscarComercio(navegar, c.clave, informe.periodo)}>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px]">{c.nombre}</span>
                <span className="block text-[11px] text-zinc-500">{c.veces} veces</span>
              </span>
              <span className="text-[15px] tabular-nums">{formatearImporte(c.importe)}</span>
              <ChevronRight className="size-4 shrink-0 text-zinc-400" strokeWidth={2} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * Tu capital a final de cada mes (cuentas según el banco menos lo pendiente de la tarjeta), lo que ha
 * variado cada mes (el ahorro real) y el ahorro que da el extracto con los movimientos de tipo Normal.
 */
function SeccionCapital({ db }: { db: ReturnType<typeof useDatos> }) {
  const datos = useMemo(() => {
    const p = calcularPosicion(db)
    if (!p || p.evolucion.length < 2) return null
    return p.evolucion.map((e, i) => {
      const anterior = i ? p.evolucion[i - 1].capital : null
      const delMes = db.movimientos.filter((m) => mesEfectivo(m) === e.mes)
      return {
        ...e,
        nombre: MESES[Number(e.mes.slice(5, 7)) - 1].slice(0, 3),
        variacion: anterior === null ? null : Math.round((e.capital - anterior) * 100) / 100,
        extracto: calcularTotales(delMes, db.categorias).ahorro,
      }
    })
  }, [db])
  if (!datos) return null
  const ultimo = datos[datos.length - 1]
  return (
    <section className="tarjeta">
      <h3 className="text-[13px] font-medium text-zinc-500 uppercase">Tu capital, mes a mes</h3>
      <p className="mt-1 text-[22px] leading-tight font-bold tabular-nums">{formatearImporte(ultimo.capital)}</p>
      <p className="text-[12px] text-zinc-500">Hoy. Cuentas según el banco menos lo pendiente de la tarjeta, a final de cada mes.</p>
      <div className="mt-2 h-32">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={datos} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
            <XAxis dataKey="nombre" stroke="var(--graf-texto)" fontSize={11} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis hide domain={['dataMin', 'dataMax']} />
            <Tooltip
              formatter={(v) => [formatearImporte(Number(v)), 'Capital']}
              contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.15)', fontSize: 13 }}
            />
            <Line type="monotone" dataKey="capital" stroke="var(--serie-1)" strokeWidth={2} dot={{ r: 3, strokeWidth: 0, fill: 'var(--serie-1)' }} activeDot={{ r: 5 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <table className="mt-3 w-full text-[13px] whitespace-nowrap tabular-nums">
        <thead>
          <tr className="text-[11px] text-zinc-500">
            <th className="py-1 text-left font-normal">Mes</th>
            <th className="py-1 text-right font-normal">Capital</th>
            <th className="py-1 text-right font-normal">Ahorro real</th>
            <th className="py-1 text-right font-normal">Extracto</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-200/70 dark:divide-zinc-800">
          {datos
            .slice(-6)
            .reverse()
            .map((d) => (
              <tr key={d.mes}>
                <td className="py-1.5">{d.mes === ultimo.mes ? 'Hoy' : `${d.nombre.charAt(0).toUpperCase()}${d.nombre.slice(1)} ${d.mes.slice(2, 4)}`}</td>
                <td className="py-1.5 pl-2 text-right">{formatearRedondo(d.capital)}</td>
                <td className={`py-1.5 pl-2 text-right ${d.variacion === null ? '' : d.variacion >= 0 ? 'text-[#248A3D] dark:text-[#30D158]' : 'text-[#D70015] dark:text-[#FF6961]'}`}>
                  {d.variacion === null ? '' : `${d.variacion >= 0 ? '+' : ''}${formatearRedondo(d.variacion)}`}
                </td>
                <td className="py-1.5 pl-2 text-right text-zinc-500">{formatearRedondo(d.extracto)}</td>
              </tr>
            ))}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] text-zinc-500">
        El ahorro real es lo que ha cambiado tu capital. Puede no coincidir con el del extracto por los gastos de empleado y reembolsos, la nómina que cuenta en el mes
        siguiente y los movimientos que no entran en el extracto.
      </p>
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
              onClick={(d) => onPeriodo((d as unknown as { clave: string }).clave)}
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
  const primero = useMemo(() => db.movimientos.reduce((min, m) => (m.fecha_operacion < min ? m.fecha_operacion : min), hoy), [db.movimientos, hoy])

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
      <div className="mb-3">
        <TiraPeriodos etiqueta="Periodo del informe" opciones={tiraDe(periodo.escala, primero, hoy)} valor={periodo.clave} onElegir={(p) => ir({ p })} />
      </div>
      {/* Sin cambio de mes deslizando: en una pantalla apilada, deslizar a la derecha es volver */}
      <div>
        <div className="space-y-4">
          {informe.porciones.length > 1 && <PanelQuesito informe={informe} elegida={sub} onElegir={(id) => elegirSub(id === sub || !id ? undefined : id)} />}
          <SeccionComercios informe={informe} movimientos={movimientos} />
          <Evolucion db={db} informe={informe} categoria={categoriaId} onPeriodo={(p) => (p.length === 7 && periodo.escala === 'anio' ? irAlMes(ir, p) : ir({ p }))} />
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
