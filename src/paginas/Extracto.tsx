import { ChartColumn, ChevronRight, ListChecks, Repeat, Target, FileText, FlaskConical, HardDriveDownload, Landmark, Sheet, Sparkles, Tag, Upload } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Aviso, Encabezado } from '../componentes/Encabezado'
import { Deslizable } from '../componentes/gestos'
import { opcionesMeses, TiraPeriodos } from '../componentes/TiraPeriodos'
import { TarjetaPosicion } from '../componentes/Posicion'
import { Baldosa } from '../componentes/Icono'
import { useInterfaz } from '../componentes/Interfaz'
import { contarDatosPrueba } from '../datos/operaciones'
import { useDatos } from '../datos/ProveedorDatos'
import { avisoExportacion, avisoImportacion } from '../lib/avisos'
import { mesPorCerrar, pasosCierre } from '../lib/cierre'
import { avisosRecurrentes, detectarRecurrentes } from '../lib/recurrentes'
import { preverCierre } from '../lib/prevision'
import { consumoPresupuestos, type LineaPresupuesto } from '../lib/presupuesto'
import { ultimaExportacion } from '../lib/copias'
import { calcularExtracto, fraseDelMes, mesDe } from '../lib/extracto'
import { mesEfectivo } from '../lib/imputacion'
import { hoyIso, mesLargo, sumarMeses } from '../lib/fechas'
import { formatearFecha, formatearImporte, formatearRedondo, plural } from '../lib/formato'
import { porcentaje, textoComparacion, type Tono } from '../lib/resumen'
import { cuadrarCuenta } from '../lib/saldos'
import { propuestasRecategorizacion } from '../datos/categorizar'
import { cuadrarLiquidaciones } from '../lib/tarjeta'

const TONO: Record<Tono, string> = {
  bueno: 'text-[#248A3D] dark:text-[#30D158]',
  malo: 'text-[#D70015] dark:text-[#FF6961]',
  neutro: 'text-zinc-500',
}

export function Extracto() {
  const db = useDatos()
  const navegar = useNavigate()
  const { avisar } = useInterfaz()
  const [params, setParams] = useSearchParams()
  const mes = params.get('mes') ?? mesDe(hoyIso())
  const e = useMemo(() => calcularExtracto(db, mes, hoyIso()), [db, mes])
  const prueba = contarDatosPrueba(db)
  const mejoras = useMemo(() => propuestasRecategorizacion(db).reduce((s, p) => s + p.movimientos.length, 0), [db])
  const descuadradas = useMemo(
    () =>
      db.cuentas.filter((c) => c.activa && c.tipo === 'cuenta' && !cuadrarCuenta(db.movimientos.filter((x) => x.cuenta_id === c.id)).cuadra).length +
      cuadrarLiquidaciones(db).filter((l) => l.estado === 'no_cuadra' || l.estado === 'sin_tarjeta').length,
    [db],
  )
  const aviso = avisoExportacion(db)
  const importar = useMemo(() => avisoImportacion(db), [db])
  // Cierre de mes: el mes que se ve si ya pasó, o el anterior en los primeros días del mes
  const actual = mesDe(hoyIso())
  const mesCierre = mes < actual ? mes : mesPorCerrar(hoyIso())
  const cierre = useMemo(() => (mesCierre && db.movimientos.length ? pasosCierre(db, mesCierre, ultimaExportacion()) : null), [db, mesCierre])
  const cierreHechos = cierre ? cierre.filter((p) => p.hecho).length : 0
  const recurrentes = useMemo(() => detectarRecurrentes(db), [db])
  const avisosFijos = useMemo(() => avisosRecurrentes(db, recurrentes), [db, recurrentes])
  const prevision = useMemo(() => preverCierre(db, mes, hoyIso(), recurrentes), [db, mes, recurrentes])
  const [verPendientes, setVerPendientes] = useState(false)
  const presupuestos = useMemo(() => consumoPresupuestos(db, mes, hoyIso()), [db, mes])
  const irA = (m: string) => setParams({ mes: m }, { replace: true })
  // Meses de la tira: del primero con datos al último (el en curso o uno posterior imputado, como la nómina)
  const meses = useMemo(() => {
    const efectivos = db.movimientos.map(mesEfectivo)
    const actual = mesDe(hoyIso())
    const desde = efectivos.reduce((min, x) => (x < min ? x : min), actual)
    const hasta = efectivos.reduce((max, x) => (x > max ? x : max), actual)
    return opcionesMeses(desde < mes ? desde : mes, hasta > mes ? hasta : mes)
  }, [db.movimientos, mes])
  const anterior = sumarMeses(`${mes}-01`, -1).slice(0, 7)
  const siguiente = sumarMeses(`${mes}-01`, 1).slice(0, 7)
  const puedeSiguiente = siguiente <= mesDe(hoyIso()) || e.haySiguiente
  const t = e.totales
  const m = e.media
  const comparar = (actual: number, media: number | undefined, subirEsBueno: boolean) =>
    m && media !== undefined ? textoComparacion(actual, media, 'la media', subirEsBueno) : null

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

  // El mismo mes del año anterior (mismos días si el mes está en curso)
  const a = e.haceUnAno
  const indicadores: { etiqueta: string; valor: string; comp: { texto: string; tono: Tono } | null; anio: string | null }[] = [
    { etiqueta: 'Ingresos', valor: formatearImporte(t.ingresos), comp: comparar(t.ingresos, m?.ingresos, true), anio: a ? formatearImporte(a.ingresos) : null },
    { etiqueta: 'Gastos', valor: formatearImporte(t.gastos), comp: comparar(t.gastos, m?.gastos, false), anio: a ? formatearImporte(a.gastos) : null },
    { etiqueta: 'Ahorro', valor: formatearImporte(t.ahorro), comp: m ? { texto: `Media: ${formatearImporte(m.ahorro)}`, tono: t.ahorro >= m.ahorro ? 'bueno' : 'malo' } : null, anio: a ? formatearImporte(a.ahorro) : null },
    {
      etiqueta: 'Tasa de ahorro',
      valor: t.tasaAhorro === null ? 'Sin ingresos' : porcentaje(t.tasaAhorro),
      comp: m?.tasaAhorro != null && t.tasaAhorro !== null ? { texto: `Media: ${porcentaje(m.tasaAhorro)}`, tono: t.tasaAhorro >= m.tasaAhorro ? 'bueno' : 'malo' } : null,
      anio: a?.tasaAhorro != null ? porcentaje(a.tasaAhorro) : null,
    },
  ]
  const frase = fraseDelMes(e, mesLargo(`${mes}-01`).split(' de ')[0].toLowerCase())

  return (
    <>
      <Encabezado
        titulo="Extracto"
        accion={
          <div className="flex gap-1">
            <Link to="/analisis" className="boton-icono" aria-label="Análisis" title="Análisis">
              <ChartColumn className="size-[22px]" strokeWidth={1.75} />
            </Link>
            <Link to="/resumenes" className="boton-icono" aria-label="Resúmenes en PDF" title="Resúmenes en PDF">
              <FileText className="size-[22px]" strokeWidth={1.75} />
            </Link>
          </div>
        }
      />

      <div className="mb-3 space-y-2">
        {!!prueba && (
          <Aviso tipo="info">
            <span className="flex flex-wrap items-center gap-2">
              <FlaskConical className="size-4 text-[#FF9500]" strokeWidth={2} /> Hay {prueba} movimientos de prueba.
              <Link to="/ajustes/herramientas" className="font-medium text-marca-700 underline dark:text-marca-500">
                Gestionarlos
              </Link>
            </span>
          </Aviso>
        )}
        {importar && (
          <Link to="/movimientos/importar" className="lista fila">
            <Baldosa glifo={Upload} color="#007AFF" tamano="sm" />
            <span className="min-w-0 flex-1">
              <span className="block text-[15px]">Sube los movimientos del banco</span>
              <span className="block text-xs text-zinc-500">
                {importar.cuentas.length === 1 ? importar.cuentas[0] : `${importar.cuentas.slice(0, -1).join(', ')} y ${importar.cuentas[importar.cuentas.length - 1]}`}
                {`: última importación hace ${importar.dias} días`}
              </span>
            </span>
            <ChevronRight className="size-4 text-zinc-400" />
          </Link>
        )}
        {aviso && (
          <Aviso tipo="info">
            <span className="flex flex-wrap items-center gap-2">
              <HardDriveDownload className="size-4 text-[#007AFF]" strokeWidth={2} /> {aviso}
              <Link to="/ajustes/herramientas" className="font-medium text-marca-700 underline dark:text-marca-500">
                Exportar
              </Link>
            </span>
          </Aviso>
        )}
      </div>

      <TarjetaPosicion />

      <div className="mb-3">
        <TiraPeriodos etiqueta="Mes del extracto" opciones={meses} valor={mes} onElegir={irA} />
      </div>

      <Deslizable onAnterior={() => irA(anterior)} onSiguiente={() => irA(siguiente)} hayAnterior={e.hayAnterior} haySiguiente={puedeSiguiente}>
        {t.movimientos === 0 && !e.categorias.length ? (
          <div className="tarjeta space-y-3 text-center">
            <p className="text-[15px]">Sin movimientos en {mesLargo(`${mes}-01`).toLowerCase()}.</p>
            <Link to="/movimientos/importar" className="boton-primario">
              <Upload className="size-4" strokeWidth={2} /> Importar Excel de BBVA
            </Link>
            <p className="text-xs text-zinc-500">¿Sin datos todavía? En Ajustes, Herramientas, puedes descargar Excel de prueba o generar datos de prueba.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {frase && <p className="px-1 text-[15px] leading-snug">{frase}</p>}
            {prevision && prevision.diasRestantes > 0 && (
              <section className="tarjeta">
                <h3 className="text-[13px] font-medium text-zinc-500 uppercase">Previsión a final de mes</h3>
                <p className="mt-0.5 text-[22px] leading-tight font-bold tabular-nums">Unos {formatearRedondo(prevision.total)} de gasto</p>
                <p className="mt-1 text-[13px] text-zinc-500">
                  Llevas {formatearRedondo(prevision.gastado)}. Faltan {prevision.pendientes.length ? `recibos por ${formatearRedondo(prevision.recibos)} y ` : ''}unos{' '}
                  {formatearRedondo(prevision.variable)} de gasto variable en los {prevision.diasRestantes} días que quedan, a tu ritmo habitual.
                  {prevision.media !== null && ` Tu media mensual: ${formatearRedondo(prevision.media)}.`}
                </p>
                {prevision.pendientes.length > 0 && (
                  <>
                    <button className="boton-texto mt-1 -ml-1 px-1" onClick={() => setVerPendientes((v) => !v)}>
                      {verPendientes ? 'Ocultar' : 'Ver'} {plural(prevision.pendientes.length, 'recibo pendiente', 'recibos pendientes')}
                    </button>
                    {verPendientes && (
                      <ul className="mt-1 divide-y divide-zinc-200/70 dark:divide-zinc-800">
                        {prevision.pendientes.map((r) => (
                          <li key={r.clave} className="flex min-h-10 items-center gap-3 py-1 text-[15px]">
                            <span className="min-w-0 flex-1 truncate">{r.nombre}</span>
                            <span className="text-[12px] text-zinc-500">hacia el {formatearFecha(r.proxima).slice(0, 5)}</span>
                            <span className="tabular-nums">{formatearImporte(r.importe)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </section>
            )}
            {m && (
              <p className="px-1 text-xs text-zinc-500">
                Comparado con la media de {e.mesesMedia} {e.mesesMedia === 1 ? 'mes anterior' : 'meses anteriores'}
                {e.enCurso ? `, del día 1 al ${e.diaCorte}, porque el mes está en curso` : ''}.
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              {indicadores.map((i) => (
                <div key={i.etiqueta} className="tarjeta p-3">
                  <p className="text-xs text-zinc-500">{i.etiqueta}</p>
                  <p className="mt-0.5 text-lg font-semibold tabular-nums">{i.valor}</p>
                  {i.comp && <p className={`mt-0.5 text-[11px] leading-tight ${TONO[i.comp.tono]}`}>{i.comp.texto}</p>}
                  {i.anio && <p className="mt-0.5 text-[11px] leading-tight text-zinc-500">Hace un año: {i.anio}</p>}
                </div>
              ))}
            </div>

            {(e.sinCategoria > 0 || descuadradas > 0 || mejoras > 0 || avisosFijos.length > 0 || (cierre && cierreHechos < cierre.length)) && (
              <div className="lista divide-y divide-zinc-200/70 dark:divide-zinc-800">
                {avisosFijos.length > 0 && (
                  <Link to="/informes/fijos" className="fila">
                    <Baldosa glifo={Repeat} color="#5856D6" tamano="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px]">Recibos y suscripciones</span>
                      <span className="block truncate text-xs text-zinc-500">{avisosFijos[0].nombre}: {avisosFijos[0].texto.charAt(0).toLowerCase() + avisosFijos[0].texto.slice(1)}</span>
                    </span>
                    <span className="text-[15px] text-zinc-500">{avisosFijos.length}</span>
                    <ChevronRight className="size-4 text-zinc-400" />
                  </Link>
                )}
                {cierre && mesCierre && cierreHechos < cierre.length && (
                  <Link to={`/extracto/cierre?mes=${mesCierre}`} className="fila">
                    <Baldosa glifo={ListChecks} color="#34C759" tamano="sm" />
                    <span className="flex-1 text-[15px]">Cierre de {mesLargo(`${mesCierre}-01`).split(' de ')[0].toLowerCase()}</span>
                    <span className="text-[15px] text-zinc-500 tabular-nums">
                      {cierreHechos} de {cierre.length}
                    </span>
                    <ChevronRight className="size-4 text-zinc-400" />
                  </Link>
                )}
                {descuadradas > 0 && (
                  <Link to="/ajustes/cuentas" className="fila">
                    <Baldosa glifo={Landmark} color="#FF9500" tamano="sm" />
                    <span className="flex-1 text-[15px]">Revisar el cuadre con el banco</span>
                    <span className="text-[15px] text-zinc-500">{descuadradas}</span>
                    <ChevronRight className="size-4 text-zinc-400" />
                  </Link>
                )}
                {mejoras > 0 && (
                  <Link to="/movimientos/categorizar" className="fila">
                    <Baldosa glifo={Sparkles} color="#5856D6" tamano="sm" />
                    <span className="flex-1 text-[15px]">Mejoras de categoría para revisar</span>
                    <span className="text-[15px] text-zinc-500">{mejoras}</span>
                    <ChevronRight className="size-4 text-zinc-400" />
                  </Link>
                )}
                {e.sinCategoria > 0 && (
                  <Link to="/movimientos/categorizar" className="fila">
                    <Baldosa glifo={Tag} color="#FF9500" tamano="sm" />
                    <span className="flex-1 text-[15px]">Movimientos sin categoría</span>
                    <span className="text-[15px] text-zinc-500">{e.sinCategoria}</span>
                    <ChevronRight className="size-4 text-zinc-400" />
                  </Link>
                )}
              </div>
            )}

            <SeccionPresupuesto lineas={presupuestos} />

            <section>
              <div className="mb-1.5 flex items-baseline justify-between px-4">
                <h3 className="text-[13px] font-medium text-zinc-500 uppercase">Gasto por categoría</h3>
                {m && <span className="text-[11px] text-zinc-500">frente a la media</span>}
              </div>
              <ul className="lista divide-y divide-zinc-200/70 dark:divide-zinc-800">
                {e.categorias.map((c) => {
                  const dif = c.media !== null ? Math.round((c.importe - c.media) * 100) / 100 : null
                  return (
                    <li key={c.id ?? 'sin'}>
                      <button className="fila w-full active:bg-zinc-100 dark:active:bg-zinc-800" onClick={() => navegar(`/extracto/categoria/${c.id ?? 'sin'}?mes=${mes}`)}>
                        {c.id ? <Baldosa icono={c.icono} color={c.color} /> : <Baldosa glifo={Tag} color="#C7C7CC" />}
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline gap-2">
                            <span className="flex-1 truncate text-[15px]">{c.nombre}</span>
                            <span className="text-[15px] tabular-nums">{formatearImporte(c.importe)}</span>
                          </span>
                          <span className="mt-1 flex items-center gap-2">
                            <span className="h-1 flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                              <span className="block h-full rounded-full" style={{ width: `${Math.max(1, c.peso * 100)}%`, backgroundColor: c.color }} />
                            </span>
                            <span className="w-11 text-right text-[11px] text-zinc-500 tabular-nums">{porcentaje(c.peso)}</span>
                            {dif !== null && (
                              <span className={`w-20 text-right text-[11px] tabular-nums ${dif > 0 ? TONO.malo : dif < 0 ? TONO.bueno : TONO.neutro}`}>
                                {dif > 0 ? '+' : ''}
                                {formatearImporte(dif)}
                              </span>
                            )}
                          </span>
                        </span>
                        <ChevronRight className="size-4 shrink-0 text-zinc-400" />
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>

            <button className="boton-texto mx-auto flex items-center gap-1.5" onClick={exportar}>
              <Sheet className="size-4" strokeWidth={2} /> Exportar el mes a Excel
            </button>
          </div>
        )}
      </Deslizable>
    </>
  )
}

const COLOR_ESTADO = { dentro: 'var(--serie-3)', cerca: '#FF9500', superado: '#FF3B30' } as const

/** Barras de consumo del presupuesto del mes; sin presupuestos, un acceso para definirlos */
function SeccionPresupuesto({ lineas }: { lineas: LineaPresupuesto[] }) {
  if (!lineas.length)
    return (
      <Link to="/extracto/presupuesto" className="lista fila">
        <Baldosa glifo={Target} color="#34C759" tamano="sm" />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px]">Definir un presupuesto</span>
          <span className="block text-xs text-zinc-500">Un importe al mes por categoría, con tu media como punto de partida</span>
        </span>
        <ChevronRight className="size-4 text-zinc-400" />
      </Link>
    )
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
              <p className={`mt-1 text-[12px] ${l.estado === 'superado' ? 'text-[#D70015] dark:text-[#FF6961]' : 'text-zinc-500'}`}>
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
