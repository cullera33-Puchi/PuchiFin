import { ChartColumn, ChevronLeft, ChevronRight, FileText, FlaskConical, HardDriveDownload, Landmark, Sheet, Sparkles, Tag, Upload } from 'lucide-react'
import { useMemo } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Aviso, Encabezado } from '../componentes/Encabezado'
import { Deslizable } from '../componentes/gestos'
import { Baldosa } from '../componentes/Icono'
import { useInterfaz } from '../componentes/Interfaz'
import { contarDatosPrueba } from '../datos/operaciones'
import { useDatos } from '../datos/ProveedorDatos'
import { avisoExportacion } from '../lib/avisos'
import { calcularExtracto, mesDe } from '../lib/extracto'
import { mesEfectivo } from '../lib/imputacion'
import { hoyIso, mesLargo, sumarMeses } from '../lib/fechas'
import { formatearImporte } from '../lib/formato'
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
  const irA = (m: string) => setParams({ mes: m }, { replace: true })
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

  const indicadores: { etiqueta: string; valor: string; comp: { texto: string; tono: Tono } | null }[] = [
    { etiqueta: 'Ingresos', valor: formatearImporte(t.ingresos), comp: comparar(t.ingresos, m?.ingresos, true) },
    { etiqueta: 'Gastos', valor: formatearImporte(t.gastos), comp: comparar(t.gastos, m?.gastos, false) },
    { etiqueta: 'Ahorro', valor: formatearImporte(t.ahorro), comp: m ? { texto: `Media: ${formatearImporte(m.ahorro)}`, tono: t.ahorro >= m.ahorro ? 'bueno' : 'malo' } : null },
    {
      etiqueta: 'Tasa de ahorro',
      valor: t.tasaAhorro === null ? 'Sin ingresos' : porcentaje(t.tasaAhorro),
      comp: m?.tasaAhorro != null && t.tasaAhorro !== null ? { texto: `Media: ${porcentaje(m.tasaAhorro)}`, tono: t.tasaAhorro >= m.tasaAhorro ? 'bueno' : 'malo' } : null,
    },
  ]

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

      <div className="mb-3 flex items-center gap-1">
        <button className="boton-icono" aria-label="Mes anterior" disabled={!e.hayAnterior} onClick={() => irA(anterior)}>
          <ChevronLeft className="size-6" strokeWidth={2} />
        </button>
        <h2 className="flex-1 text-center text-[17px] font-semibold">{mesLargo(`${mes}-01`)}</h2>
        <button className="boton-icono" aria-label="Mes siguiente" disabled={!puedeSiguiente} onClick={() => irA(siguiente)}>
          <ChevronRight className="size-6" strokeWidth={2} />
        </button>
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
                </div>
              ))}
            </div>

            {(e.sinCategoria > 0 || descuadradas > 0 || mejoras > 0) && (
              <div className="lista divide-y divide-zinc-200/70 dark:divide-zinc-800">
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
