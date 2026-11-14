import {
  ChartColumn,
  ChevronRight,
  Ellipsis,
  FileText,
  FlaskConical,
  HardDriveDownload,
  Info,
  Landmark,
  ListChecks,
  Repeat,
  Sheet,
  Sparkles,
  Tag,
  Target,
  Upload,
} from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Encabezado } from '../componentes/Encabezado'
import { HojaClaude } from '../componentes/HojaClaude'
import { Baldosa } from '../componentes/Icono'
import { Hoja, useInterfaz } from '../componentes/Interfaz'
import { FilasPatrimonio } from '../componentes/Patrimonio'
import { opcionesMeses, TiraPeriodos } from '../componentes/TiraPeriodos'
import { propuestasRecategorizacion } from '../datos/categorizar'
import { contarDatosPrueba } from '../datos/operaciones'
import { useDatos } from '../datos/ProveedorDatos'
import { textoExtracto } from '../lib/analizar'
import { avisoExportacion, avisoImportacion } from '../lib/avisos'
import { mesPorCerrar, pasosCierre } from '../lib/cierre'
import { ultimaExportacion } from '../lib/copias'
import { calcularExtracto, categoriaQueMasSube, diferenciaRelevante, mesDe, type Extracto as DatosExtracto } from '../lib/extracto'
import { hoyIso, mesLargo } from '../lib/fechas'
import { formatearFecha, formatearRedondo, plural } from '../lib/formato'
import { mesEfectivo } from '../lib/imputacion'
import { consumoPresupuestos, type LineaPresupuesto } from '../lib/presupuesto'
import { preverCierre, type Prevision } from '../lib/prevision'
import { avisosRecurrentes, detectarRecurrentes } from '../lib/recurrentes'
import { porcentaje } from '../lib/resumen'
import { cuadrarCuenta } from '../lib/saldos'
import { cuadrarLiquidaciones } from '../lib/tarjeta'

const VERDE = 'text-[#248A3D] dark:text-[#30D158]'
const ROJO = 'text-[#D70015] dark:text-[#FF6961]'
/** Categorías que se ven de entrada; el resto, con «Ver todas» */
const CATEGORIAS_VISIBLES = 6

const nombreDelMes = (mes: string) => mesLargo(`${mes}-01`).split(' de ')[0]
const conMayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

interface Pendiente {
  clave: string
  titulo: string
  detalle?: string
  cifra?: string
  a: string
  glifo: typeof Tag
  color: string
}

/**
 * Extracto (rediseño de la v0.31.0): capital y deuda en dos filas, la tira de meses, una tarjeta principal
 * con lo esencial del mes, los avisos agrupados, el presupuesto si lo hay y el gasto por categoría.
 * Las acciones (PDF, análisis, Claude, Excel) van en el menú de arriba.
 */
export function Extracto() {
  const db = useDatos()
  const { avisar } = useInterfaz()
  const [params, setParams] = useSearchParams()
  const mes = params.get('mes') ?? mesDe(hoyIso())
  const e = useMemo(() => calcularExtracto(db, mes, hoyIso()), [db, mes])
  const recurrentes = useMemo(() => detectarRecurrentes(db), [db])
  const prevision = useMemo(() => preverCierre(db, mes, hoyIso(), recurrentes), [db, mes, recurrentes])
  const presupuestos = useMemo(() => consumoPresupuestos(db, mes, hoyIso()), [db, mes])
  const pendientes = usePendientes(mes, e.sinCategoria, recurrentes, presupuestos.length > 0)
  const [menu, setMenu] = useState(false)
  const [claude, setClaude] = useState(false)
  const irA = (m: string) => setParams({ mes: m }, { replace: true })
  // Meses de la tira: del primero con datos al último (el en curso o uno posterior imputado, como la nómina)
  const meses = useMemo(() => {
    const efectivos = db.movimientos.map(mesEfectivo)
    const actual = mesDe(hoyIso())
    const desde = efectivos.reduce((min, x) => (x < min ? x : min), actual)
    const hasta = efectivos.reduce((max, x) => (x > max ? x : max), actual)
    return opcionesMeses(desde < mes ? desde : mes, hasta > mes ? hasta : mes)
  }, [db.movimientos, mes])
  const t = e.totales

  const exportar = async () => {
    const movs = db.movimientos.filter((x) => mesEfectivo(x) === mes)
    const r = await (await import('../lib/exportarExcel')).exportarVista(db, `extracto ${mes}`, movs, [
      ['Extracto', mesLargo(`${mes}-01`)],
      ['Ingresos', t.ingresos],
      ['Gastos', t.gastos],
      ['Ahorro', t.ahorro],
      ['Tasa de ahorro', t.tasaAhorro === null ? '' : Math.round(t.tasaAhorro * 1000) / 10],
      [],
      ['Categoría', 'Importe', 'Peso (%)', 'Media'],
      ...e.categorias.map((c) => [c.nombre, c.importe, Math.round(c.peso * 1000) / 10, c.media]),
    ])
    if (r === 'descargado') avisar('Excel descargado')
  }

  return (
    <>
      <Encabezado
        titulo="Extracto"
        accion={
          <div className="flex gap-1">
            <Link to="/resumenes" className="boton-icono" aria-label="Resúmenes en PDF" title="Resúmenes en PDF">
              <FileText className="size-[22px]" strokeWidth={1.75} />
            </Link>
            <button className="boton-icono" aria-label="Más opciones del extracto" onClick={() => setMenu(true)}>
              <Ellipsis className="size-[22px]" strokeWidth={1.75} />
            </button>
          </div>
        }
      />

      <FilasPatrimonio />

      <div className="mb-3">
        <TiraPeriodos etiqueta="Mes del extracto" opciones={meses} valor={mes} onElegir={irA} />
      </div>

      {t.movimientos === 0 && !e.categorias.length ? (
        <div className="space-y-4">
          <div className="tarjeta space-y-3 text-center">
            <p className="text-[15px]">Sin movimientos en {mesLargo(`${mes}-01`).toLowerCase()}.</p>
            <Link to="/movimientos/importar" className="boton-primario">
              <Upload className="size-4" strokeWidth={2} /> Importar Excel de BBVA
            </Link>
            <p className="text-xs text-zinc-500">¿Sin datos todavía? En Ajustes, Herramientas, puedes descargar Excel de prueba o generar datos de prueba.</p>
          </div>
          <Pendientes lista={pendientes} />
        </div>
      ) : (
        <div className="space-y-4">
          <TarjetaMes e={e} mes={mes} prevision={prevision} presupuestos={presupuestos} />
          <Pendientes lista={pendientes} />
          {presupuestos.length > 0 && <SeccionPresupuesto lineas={presupuestos} />}
          <Categorias e={e} mes={mes} />
        </div>
      )}

      <Hoja abierta={menu} titulo="Extracto" onCerrar={() => setMenu(false)}>
        <ul className="lista divide-y divide-zinc-200/70 bg-zinc-100/70 dark:divide-zinc-800 dark:bg-zinc-800/50">
          {[
            { texto: 'Resúmenes en PDF', icono: FileText, a: '/resumenes' },
            { texto: 'Evolución y cierre anual', icono: ChartColumn, a: '/analisis' },
            { texto: 'Analizar con Claude', icono: Sparkles, fn: () => setClaude(true) },
            { texto: 'Exportar el mes a Excel', icono: Sheet, fn: exportar },
          ].map((o) => (
            <li key={o.texto}>
              {o.a ? (
                <Link to={o.a} className="fila min-h-12 w-full text-[17px] active:bg-zinc-200/60 dark:active:bg-zinc-700/60" onClick={() => setMenu(false)}>
                  <o.icono className="size-5 text-marca-700 dark:text-marca-500" strokeWidth={1.75} />
                  <span className="flex-1 text-left">{o.texto}</span>
                </Link>
              ) : (
                <button
                  className="fila min-h-12 w-full text-[17px] active:bg-zinc-200/60 dark:active:bg-zinc-700/60"
                  onClick={() => {
                    setMenu(false)
                    void o.fn?.()
                  }}
                >
                  <o.icono className="size-5 text-marca-700 dark:text-marca-500" strokeWidth={1.75} />
                  <span className="flex-1 text-left">{o.texto}</span>
                </button>
              )}
            </li>
          ))}
        </ul>
      </Hoja>
      <HojaClaude
        abierta={claude}
        titulo="Analizar con Claude"
        explicacion="Claude analiza el mes: qué se desvía de tu media, tu tasa de ahorro y qué hacer el mes que viene."
        texto={claude ? textoExtracto(db, mes, hoyIso()) : ''}
        archivo={`puchifin-extracto-${mes}.txt`}
        registro="Analizar extracto"
        onCerrar={() => setClaude(false)}
      />
    </>
  )
}

/**
 * Lo que está pendiente, de más a menos urgente: datos de prueba, subir movimientos, exportar, recibos,
 * cierre del mes, cuadre con el banco, mejoras, sin categoría y presupuesto sin definir.
 */
function usePendientes(mes: string, sinCategoria: number, recurrentes: ReturnType<typeof detectarRecurrentes>, hayPresupuesto: boolean): Pendiente[] {
  const db = useDatos()
  const movsMejora = useMemo(() => propuestasRecategorizacion(db).flatMap((p) => p.movimientos), [db])
  const liquidaciones = useMemo(() => cuadrarLiquidaciones(db), [db])
  const descuadradas = useMemo(
    () =>
      db.cuentas.filter((c) => c.activa && c.tipo === 'cuenta' && !cuadrarCuenta(db.movimientos.filter((x) => x.cuenta_id === c.id)).cuadra).length +
      liquidaciones.filter((l) => l.estado === 'no_cuadra' || l.estado === 'sin_tarjeta').length,
    [db, liquidaciones],
  )
  const importar = useMemo(() => avisoImportacion(db), [db])
  const avisosFijos = useMemo(() => avisosRecurrentes(db, recurrentes), [db, recurrentes])
  // Cierre de mes: el mes que se ve si ya pasó, o el anterior en los primeros días del mes
  const actual = mesDe(hoyIso())
  const mesCierre = mes < actual ? mes : mesPorCerrar(hoyIso())
  const cierre = useMemo(
    () => (mesCierre && db.movimientos.length ? pasosCierre(db, mesCierre, ultimaExportacion()) : null),
    [db, mesCierre],
  )
  const prueba = contarDatosPrueba(db)
  const exportacion = avisoExportacion(db)
  const lista: Pendiente[] = []
  if (prueba) lista.push({ clave: 'prueba', titulo: 'Datos de prueba', detalle: plural(prueba, 'movimiento inventado', 'movimientos inventados'), a: '/ajustes/herramientas', glifo: FlaskConical, color: '#FF9500' })
  if (importar)
    lista.push({
      clave: 'importar',
      titulo: 'Sube los movimientos del banco',
      detalle: `${importar.cuentas.length === 1 ? importar.cuentas[0] : `${importar.cuentas.slice(0, -1).join(', ')} y ${importar.cuentas[importar.cuentas.length - 1]}`}: hace ${importar.dias} días`,
      a: '/movimientos/importar',
      glifo: Upload,
      color: '#007AFF',
    })
  if (exportacion) lista.push({ clave: 'exportar', titulo: 'Exporta una copia de tus datos', detalle: exportacion, a: '/ajustes/herramientas', glifo: HardDriveDownload, color: '#007AFF' })
  if (avisosFijos.length)
    lista.push({
      clave: 'fijos',
      titulo: 'Recibos y suscripciones',
      detalle: `${avisosFijos[0].nombre}: ${avisosFijos[0].texto.charAt(0).toLowerCase()}${avisosFijos[0].texto.slice(1)}`,
      cifra: String(avisosFijos.length),
      a: '/informes/fijos',
      glifo: Repeat,
      color: '#5856D6',
    })
  if (cierre && mesCierre) {
    const hechos = cierre.filter((p) => p.hecho).length
    if (hechos < cierre.length)
      lista.push({ clave: 'cierre', titulo: `Cierre de ${nombreDelMes(mesCierre)}`, cifra: `${hechos} de ${cierre.length}`, a: `/extracto/cierre?mes=${mesCierre}`, glifo: ListChecks, color: '#34C759' })
  }
  if (descuadradas) lista.push({ clave: 'cuadre', titulo: 'Revisar el cuadre con el banco', cifra: String(descuadradas), a: '/ajustes/cuentas', glifo: Landmark, color: '#FF9500' })
  if (movsMejora.length) lista.push({ clave: 'mejoras', titulo: 'Mejoras de categoría para revisar', cifra: String(movsMejora.length), a: '/movimientos/categorizar', glifo: Sparkles, color: '#5856D6' })
  if (sinCategoria) lista.push({ clave: 'sin', titulo: 'Movimientos sin categoría', cifra: String(sinCategoria), a: '/movimientos/categorizar', glifo: Tag, color: '#FF9500' })
  if (!hayPresupuesto && db.movimientos.length)
    lista.push({ clave: 'presupuesto', titulo: 'Definir un presupuesto', detalle: 'Con tu media como punto de partida', a: '/extracto/presupuesto', glifo: Target, color: '#34C759' })
  return lista
}

function FilaPendiente({ p, onIr }: { p: Pendiente; onIr?: () => void }) {
  return (
    <Link to={p.a} className="fila min-h-12 active:bg-zinc-100 dark:active:bg-zinc-800" onClick={onIr}>
      <Baldosa glifo={p.glifo} color={p.color} tamano="sm" />
      <span className="min-w-0 flex-1">
        <span className="block text-[15px]">{p.titulo}</span>
        {p.detalle && <span className="block truncate text-[12px] text-zinc-500">{p.detalle}</span>}
      </span>
      {p.cifra && <span className="text-[15px] text-zinc-500 tabular-nums">{p.cifra}</span>}
      <ChevronRight className="size-4 shrink-0 text-zinc-400" />
    </Link>
  )
}

/** Un aviso se ve tal cual; varios, en una sola fila que abre la lista */
function Pendientes({ lista }: { lista: Pendiente[] }) {
  const [abierta, setAbierta] = useState(false)
  if (!lista.length) return null
  if (lista.length === 1)
    return (
      <div className="lista">
        <FilaPendiente p={lista[0]} />
      </div>
    )
  return (
    <>
      <button className="lista fila min-h-12 w-full active:bg-zinc-100 dark:active:bg-zinc-800" onClick={() => setAbierta(true)}>
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#FF9500] text-[13px] font-semibold text-white tabular-nums">{lista.length}</span>
        <span className="min-w-0 flex-1 text-left">
          <span className="block text-[15px]">Cosas pendientes</span>
          <span className="block truncate text-[12px] text-zinc-500">{lista.map((p) => p.titulo).join(', ')}</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-zinc-400" />
      </button>
      <Hoja abierta={abierta} titulo="Pendiente" listo="Listo" onCerrar={() => setAbierta(false)}>
        <ul className="lista divide-y divide-zinc-200/70 dark:divide-zinc-800">
          {lista.map((p) => (
            <li key={p.clave}>
              <FilaPendiente p={p} onIr={() => setAbierta(false)} />
            </li>
          ))}
        </ul>
      </Hoja>
    </>
  )
}

/** Cifra pequeña de la fila de abajo de la tarjeta del mes */
function Dato({ etiqueta, valor, tono = '' }: { etiqueta: string; valor: string; tono?: string }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="text-[12px] text-zinc-500">{etiqueta}</p>
      <p className={`truncate text-[17px] font-semibold tabular-nums ${tono}`}>{valor}</p>
    </div>
  )
}

/**
 * Lo esencial del mes en una tarjeta: lo gastado frente a la media, una barra con la referencia (el
 * presupuesto o la media) y, si el mes está en curso, cómo cerrará; la categoría que más sube; e ingresos,
 * ahorro y tasa de ahorro. El detalle de la comparación y de la previsión, en «i».
 */
function TarjetaMes({ e, mes, prevision, presupuestos }: { e: DatosExtracto; mes: string; prevision: Prevision | null; presupuestos: LineaPresupuesto[] }) {
  const navegar = useNavigate()
  const [detalle, setDetalle] = useState(false)
  const t = e.totales
  const m = e.media
  const v = m && m.gastos > 0 ? (t.gastos - m.gastos) / m.gastos : null
  const presupuesto = presupuestos.reduce((s, l) => s + l.presupuesto, 0)
  // Referencia del mes entero: el presupuesto si cubre la mayor parte del gasto habitual (un presupuesto
  // solo de Alimentación no sirve para comparar todo el mes); si no, la media de los meses completos
  const media = e.enCurso ? (prevision?.media ?? null) : (m?.gastos ?? null)
  const cubre = presupuesto > 0 && (!media || presupuesto >= media * 0.8)
  const ref = cubre ? { importe: presupuesto, nombre: 'Presupuesto' } : media ? { importe: media, nombre: 'Media' } : null
  const previsto = e.enCurso && prevision && prevision.diasRestantes > 0 ? prevision.total : null
  const escala = Math.max(ref?.importe ?? 0, t.gastos, previsto ?? 0) || 1
  const pasa = ref ? (previsto ?? t.gastos) > ref.importe : false
  const sube = categoriaQueMasSube(e)

  return (
    <section className="tarjeta" aria-label={`Resumen de ${nombreDelMes(mes)}`}>
      <div className="flex items-center gap-2">
        <h2 className="text-[13px] font-medium text-zinc-500 uppercase">
          {nombreDelMes(mes)}
          {e.enCurso && e.diaCorte ? `, hasta el día ${e.diaCorte}` : ''}
        </h2>
        <button className="boton-icono -my-2 -mr-2 ml-auto" aria-label="Cómo se calcula" onClick={() => setDetalle(true)}>
          <Info className="size-5" strokeWidth={1.75} />
        </button>
      </div>
      <div className="flex items-baseline gap-2">
        <p className="text-[30px] leading-tight font-bold tracking-tight tabular-nums">{formatearRedondo(t.gastos)}</p>
        <p className="text-[15px] text-zinc-500">gastado</p>
      </div>
      {v !== null && (
        <p className={`text-[13px] ${Math.abs(v) < 0.05 ? 'text-zinc-500' : v > 0 ? ROJO : VERDE}`}>
          {Math.abs(v) < 0.05 ? 'En línea con tu media' : `${v > 0 ? '+' : '−'}${Math.round(Math.abs(v) * 100)} % frente a tu media`}
          {e.enCurso ? ' a estas alturas' : ''}
        </p>
      )}

      {ref && (
        <div className="mt-3">
          <div className="relative h-2.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
            {previsto !== null && previsto > t.gastos && (
              <div className={`absolute inset-y-0 left-0 rounded-full ${pasa ? 'bg-[#FF3B30]/30' : 'bg-marca-600/30'}`} style={{ width: `${(previsto / escala) * 100}%` }} />
            )}
            <div className={`absolute inset-y-0 left-0 rounded-full ${pasa ? 'bg-[#FF3B30]' : 'bg-marca-600 dark:bg-marca-500'}`} style={{ width: `${Math.max(1, (t.gastos / escala) * 100)}%` }} />
            <div className="absolute inset-y-0 w-0.5 bg-zinc-900/60 dark:bg-white/70" style={{ left: `calc(${(ref.importe / escala) * 100}% - 1px)` }} />
          </div>
          <div className="mt-1 flex justify-between gap-2 text-[12px] text-zinc-500 tabular-nums">
            <span>{previsto !== null ? `Cerrarás en unos ${formatearRedondo(previsto)}` : ' '}</span>
            <span>
              {ref.nombre}: {formatearRedondo(ref.importe)}
            </span>
          </div>
        </div>
      )}

      {ref && previsto !== null && prevision && <Quedan referencia={ref} prevision={prevision} />}

      {sube && (
        <button className="mt-2 flex w-full items-center gap-1 text-left text-[13px] active:opacity-60" onClick={() => navegar(`/extracto/categoria/${sube.id}?mes=${mes}`)}>
          <span className="text-zinc-500">Lo que más sube:</span>
          <span className="min-w-0 truncate">
            {sube.nombre}, <span className={ROJO}>+{formatearRedondo(sube.importe - sube.media!)}</span>
          </span>
          <ChevronRight className="ml-auto size-3.5 shrink-0 text-zinc-400" />
        </button>
      )}

      <div className="mt-3 flex gap-3 border-t border-zinc-200/70 pt-3 dark:border-zinc-800">
        <Dato etiqueta="Ingresos" valor={formatearRedondo(t.ingresos)} />
        <Dato etiqueta="Ahorro" valor={formatearRedondo(t.ahorro)} tono={t.ahorro < 0 ? ROJO : ''} />
        <Dato etiqueta="Tasa de ahorro" valor={t.tasaAhorro === null ? '—' : porcentaje(t.tasaAhorro)} />
      </div>

      <HojaDetalleMes abierta={detalle} onCerrar={() => setDetalle(false)} e={e} mes={mes} prevision={previsto !== null ? prevision : null} />
    </section>
  )
}

/**
 * Cuánto queda para gastar hasta fin de mes (v0.32.0): la referencia (presupuesto o media) menos lo
 * gastado, los recibos que faltan y los gastos previstos; y cuánto es al día.
 */
function Quedan({ referencia, prevision }: { referencia: { importe: number; nombre: string }; prevision: Prevision }) {
  const comprometido = prevision.recibos + prevision.importePrevistos
  const quedan = referencia.importe - prevision.gastado - comprometido
  const nombre = referencia.nombre === 'Presupuesto' ? 'tu presupuesto' : 'tu media'
  if (quedan <= 0)
    return (
      <p className={`mt-2 text-[13px] ${ROJO}`}>
        {comprometido > 0 ? `Con los recibos que faltan, ya pasas de ${nombre}` : `Ya has pasado de ${nombre}`} en {formatearRedondo(-quedan)}.
      </p>
    )
  const diario = quedan / Math.max(1, prevision.diasRestantes)
  return (
    <p className="mt-2 text-[13px]">
      Te quedan <span className="font-semibold tabular-nums">{formatearRedondo(quedan)}</span> hasta fin de mes para llegar a {nombre}, unos{' '}
      <span className="font-semibold tabular-nums">{formatearRedondo(diario)}</span> al día
      {comprometido > 0 ? <span className="text-zinc-500">{`, ya descontados ${formatearRedondo(comprometido)} de recibos y previstos`}</span> : ''}.
    </p>
  )
}

/** Cómo se calcula: el mes frente a la media (y hace un año, si hay datos) y la previsión de cierre */
function HojaDetalleMes({ abierta, onCerrar, e, mes, prevision }: { abierta: boolean; onCerrar: () => void; e: DatosExtracto; mes: string; prevision: Prevision | null }) {
  const t = e.totales
  const m = e.media
  const a = e.haceUnAno && e.haceUnAno.movimientos > 0 ? e.haceUnAno : null
  const filas: [string, (x: typeof t) => string][] = [
    ['Ingresos', (x) => formatearRedondo(x.ingresos)],
    ['Gastos', (x) => formatearRedondo(x.gastos)],
    ['Ahorro', (x) => formatearRedondo(x.ahorro)],
    ['Tasa de ahorro', (x) => (x.tasaAhorro === null ? '—' : porcentaje(x.tasaAhorro))],
  ]
  const celda = 'px-2 py-2 text-right tabular-nums'
  let bloquePrevision: ReactNode = null
  if (prevision) {
    bloquePrevision = (
      <section>
        <h3 className="cabecera-grupo">Previsión a final de mes</h3>
        <div className="lista space-y-2 px-4 py-3 text-[15px]">
          <p className="text-[22px] font-bold tabular-nums">Unos {formatearRedondo(prevision.total)}</p>
          <p className="text-[13px] text-zinc-500">
            Llevas {formatearRedondo(prevision.gastado)}
            {prevision.hasta < hoyIso() ? ` con los datos hasta el ${formatearFecha(prevision.hasta).slice(0, 5)}` : ''}. Faltan{' '}
            {prevision.pendientes.length ? `recibos por ${formatearRedondo(prevision.recibos)}, ` : ''}
            {prevision.previstos.length ? `${plural(prevision.previstos.length, 'gasto previsto', 'gastos previstos')} por ${formatearRedondo(prevision.importePrevistos)} y ` : prevision.pendientes.length ? 'y ' : ''}
            unos {formatearRedondo(prevision.variable)} de gasto variable en los {prevision.diasRestantes} días que quedan, a tu ritmo habitual.
          </p>
          {prevision.pendientes.length > 0 && (
            <ul className="divide-y divide-zinc-200/70 dark:divide-zinc-800">
              {prevision.pendientes.map((r) => (
                <li key={r.clave} className="flex min-h-10 items-center gap-3 py-1 text-[15px]">
                  <span className="min-w-0 flex-1 truncate">{r.nombre}</span>
                  <span className="text-[12px] text-zinc-500">hacia el {formatearFecha(r.proxima).slice(0, 5)}</span>
                  <span className="tabular-nums">{formatearRedondo(r.importe)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    )
  }
  return (
    <Hoja abierta={abierta} titulo={conMayuscula(mesLargo(`${mes}-01`).toLowerCase())} listo="Listo" onCerrar={onCerrar}>
      <div className="space-y-4">
        <section>
          <h3 className="cabecera-grupo">Frente a otros meses</h3>
          <div className="lista overflow-hidden">
            <table className="w-full text-[15px]">
              <thead>
                <tr className="text-[12px] text-zinc-500">
                  <th className="px-4 py-2 text-left font-normal"></th>
                  <th className={`${celda} font-normal`}>Este mes</th>
                  {m && <th className={`${celda} font-normal`}>Media</th>}
                  {a && <th className={`${celda} pr-4 font-normal`}>Hace un año</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200/70 dark:divide-zinc-800">
                {filas.map(([nombre, f]) => (
                  <tr key={nombre}>
                    <td className="px-4 py-2">{nombre}</td>
                    <td className={celda}>{f(t)}</td>
                    {m && <td className={`${celda} text-zinc-500`}>{f(m)}</td>}
                    {a && <td className={`${celda} pr-4 text-zinc-500`}>{f(a)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {m && (
            <p className="mt-1 px-4 text-[12px] text-zinc-500">
              Media de {plural(e.mesesMedia, 'mes anterior', 'meses anteriores')}
              {e.enCurso ? `, del día 1 al ${e.diaCorte}, porque el mes está en curso` : ''}. Solo cuentan los movimientos de tipo Normal.
            </p>
          )}
        </section>
        {bloquePrevision}
        <div className="flex flex-wrap gap-x-4 px-1">
          <Link to="/extracto/previstos" className="boton-texto px-1" onClick={onCerrar}>
            Gastos previstos del año
          </Link>
          <Link to="/extracto/ingresos" className="boton-texto px-1" onClick={onCerrar}>
            Ingresos previstos
          </Link>
        </div>
      </div>
    </Hoja>
  )
}

/** Gasto por categoría: las primeras seis y «Ver todas»; la diferencia con la media, solo si es relevante */
function Categorias({ e, mes }: { e: DatosExtracto; mes: string }) {
  const navegar = useNavigate()
  const [todas, setTodas] = useState(false)
  if (!e.categorias.length) return null
  const lista = todas ? e.categorias : e.categorias.slice(0, CATEGORIAS_VISIBLES)
  return (
    <section>
      <div className="mb-1.5 flex items-baseline justify-between px-4">
        <h3 className="text-[13px] font-medium text-zinc-500 uppercase">Gasto por categoría</h3>
        {e.media && <span className="text-[11px] text-zinc-500">frente a la media</span>}
      </div>
      <ul className="lista divide-y divide-zinc-200/70 dark:divide-zinc-800">
        {lista.map((c) => {
          const dif = diferenciaRelevante(c)
          return (
            <li key={c.id ?? 'sin'}>
              <button className="fila w-full active:bg-zinc-100 dark:active:bg-zinc-800" onClick={() => navegar(`/extracto/categoria/${c.id ?? 'sin'}?mes=${mes}`)}>
                {c.id ? <Baldosa icono={c.icono} color={c.color} /> : <Baldosa glifo={Tag} color="#C7C7CC" />}
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="flex-1 truncate text-[15px]">{c.nombre}</span>
                    <span className="text-[15px] tabular-nums">{formatearRedondo(c.importe)}</span>
                  </span>
                  <span className="mt-1 flex items-center gap-2">
                    <span className="h-1 flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                      <span className="block h-full rounded-full" style={{ width: `${Math.max(1, c.peso * 100)}%`, backgroundColor: c.color }} />
                    </span>
                    <span className="w-10 text-right text-[11px] text-zinc-500 tabular-nums">{porcentaje(c.peso)}</span>
                    <span className={`w-16 text-right text-[11px] tabular-nums ${dif === null ? '' : dif > 0 ? ROJO : VERDE}`}>
                      {dif === null ? '' : `${dif > 0 ? '+' : '−'}${formatearRedondo(Math.abs(dif))}`}
                    </span>
                  </span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-zinc-400" />
              </button>
            </li>
          )
        })}
        {e.categorias.length > CATEGORIAS_VISIBLES && (
          <li>
            <button className="fila min-h-11 w-full justify-center text-[15px] text-marca-700 active:bg-zinc-100 dark:text-marca-500 dark:active:bg-zinc-800" onClick={() => setTodas((x) => !x)}>
              {todas ? 'Ver menos' : `Ver todas (${e.categorias.length})`}
            </button>
          </li>
        )}
      </ul>
    </section>
  )
}

const COLOR_ESTADO = { dentro: 'var(--serie-3)', cerca: '#FF9500', superado: '#FF3B30' } as const

/** Barras de consumo del presupuesto del mes */
function SeccionPresupuesto({ lineas }: { lineas: LineaPresupuesto[] }) {
  return (
    <section>
      <div className="mb-1.5 flex items-baseline justify-between px-4">
        <h3 className="text-[13px] font-medium text-zinc-500 uppercase">Presupuesto</h3>
        <Link to="/extracto/presupuesto" className="text-[15px] text-marca-700 dark:text-marca-500">
          Editar
        </Link>
      </div>
      <ul className="lista divide-y divide-zinc-200/70 dark:divide-zinc-800">
        {lineas.map((l) => {
          const pct = l.gastado / l.presupuesto
          const queda = l.presupuesto - l.gastado
          return (
            <li key={l.categoria.id} className="px-4 py-2.5">
              <div className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate text-[15px]">{l.categoria.nombre}</span>
                <span className="text-[15px] tabular-nums">
                  {formatearRedondo(l.gastado)} <span className="text-zinc-500">de {formatearRedondo(l.presupuesto)}</span>
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800" role="progressbar" aria-valuenow={Math.round(pct * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={l.categoria.nombre}>
                <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct * 100)}%`, background: COLOR_ESTADO[l.estado] }} />
              </div>
              <p className={`mt-1 text-[12px] ${l.estado === 'superado' ? ROJO : 'text-zinc-500'}`}>
                {Math.abs(queda) < 0.5 ? 'Presupuesto agotado' : l.estado === 'superado' ? `Superado en ${formatearRedondo(-queda)}` : `Quedan ${formatearRedondo(queda)} (${Math.round(pct * 100)} % usado)`}
                {l.proyeccion !== null && l.estado !== 'superado' && l.proyeccion > l.presupuesto ? `. A este ritmo, ${formatearRedondo(l.proyeccion)} a final de mes` : ''}
              </p>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
