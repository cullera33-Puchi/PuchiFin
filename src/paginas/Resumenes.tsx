import { ChevronLeft, ChevronRight, Download, FlaskConical, Share2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Aviso, Encabezado } from '../componentes/Encabezado'
import { useInterfaz } from '../componentes/Interfaz'
import { compartirArchivo, puedeCompartirArchivos } from '../lib/compartir'
import { contarDatosPrueba } from '../lib/datosPruebaSupabase'
import { cargarDatosResumen } from '../lib/datosResumen'
import { diaSemana, hoyIso } from '../lib/fechas'
import { formatearImporte } from '../lib/formato'
import { registrar } from '../lib/registro'
import {
  calcularResumen,
  desplazarPeriodo,
  indicadores,
  lineasFueraDelExtracto,
  textoEnCurso,
  periodoDe,
  porcentaje,
  type ConciliacionResumen,
  type MovimientoResumen,
  type Periodo,
  type Resumen,
  type TipoPeriodo,
  type Tono,
} from '../lib/resumen'
import { mensajeError, supabase } from '../lib/supabase'
import { NOMBRE_TIPO_MOVIMIENTO, type Categoria } from '../lib/tipos'

const CLAVE_CONCEPTOS = 'puchifin-resumen-conceptos'
const TONO: Record<Tono, string> = {
  bueno: 'text-emerald-700 dark:text-emerald-400',
  malo: 'text-red-700 dark:text-red-400',
  neutro: 'text-zinc-500',
}

function leerPreferencia(): boolean {
  try {
    return localStorage.getItem(CLAVE_CONCEPTOS) !== 'no'
  } catch {
    return true
  }
}

export function Resumenes() {
  const { avisar } = useInterfaz()
  const [tipo, setTipo] = useState<TipoPeriodo>('mes')
  const [desplazamiento, setDesplazamiento] = useState(0)
  const [categorias, setCategorias] = useState<Categoria[] | null>(null)
  const [datos, setDatos] = useState<{ clave: string; movimientos: MovimientoResumen[]; conciliaciones: ConciliacionResumen[] } | null>(null)
  const [hayPrueba, setHayPrueba] = useState(false)
  const [conceptos, setConceptos] = useState(leerPreferencia)
  const [error, setError] = useState<string | null>(null)
  const [generando, setGenerando] = useState(false)

  const periodo: Periodo = useMemo(() => desplazarPeriodo(periodoDe(tipo, hoyIso()), desplazamiento), [tipo, desplazamiento])
  const clave = `${periodo.tipo}:${periodo.inicio}`

  useEffect(() => {
    supabase.from('categorias').select('*').then(({ data, error: e }) => {
      if (e) setError(mensajeError(e))
      else setCategorias(data as Categoria[])
    })
    contarDatosPrueba().then((n) => setHayPrueba(n > 0), () => undefined)
  }, [])

  useEffect(() => {
    let cancelado = false
    cargarDatosResumen(periodo).then(
      (d) => !cancelado && setDatos({ clave, ...d }),
      (e) => !cancelado && setError((e as Error).message),
    )
    return () => {
      cancelado = true
    }
  }, [periodo, clave])

  const resumen: Resumen | null = useMemo(
    () => (categorias && datos?.clave === clave ? calcularResumen(periodo, datos.movimientos, categorias, datos.conciliaciones, 10, hoyIso()) : null),
    [categorias, datos, clave, periodo],
  )

  const cambiarConceptos = (v: boolean) => {
    setConceptos(v)
    try {
      localStorage.setItem(CLAVE_CONCEPTOS, v ? 'si' : 'no')
    } catch {
      // sin almacenamiento
    }
  }

  const generarPdf = async (descargar: boolean) => {
    if (!resumen || !categorias) return
    setGenerando(true)
    try {
      const { generarPdfResumen, nombreArchivoResumen } = await import('../lib/pdf')
      const doc = generarPdfResumen(resumen, { incluirConceptos: conceptos, hayDatosPrueba: hayPrueba, categorias })
      const nombre = nombreArchivoResumen(resumen)
      registrar('info', `Resumen ${resumen.periodo.tipo === 'mes' ? 'mensual' : 'semanal'} en PDF`, { periodo: resumen.periodo.inicio, paginas: doc.getNumberOfPages(), conceptos })
      const r = await compartirArchivo(doc.output('blob'), nombre, resumen.periodo.etiqueta, descargar)
      if (r === 'descargado') avisar(`${nombre} descargado`)
    } catch (e) {
      registrar('error', `PDF del resumen: ${(e as Error).message}`)
      setError('No se pudo generar el PDF')
    } finally {
      setGenerando(false)
    }
  }

  const futuro = desplazarPeriodo(periodo, 1).inicio > hoyIso()
  const compartir = puedeCompartirArchivos()

  return (
    <>
      <Encabezado titulo="Resúmenes" subtitulo="Semanal y mensual, en PDF para compartir" />

      <div className="mb-4 space-y-3">
        <div className="flex gap-1 rounded-xl bg-zinc-200/70 p-1 dark:bg-zinc-800/70">
          {(['semana', 'mes'] as const).map((t) => (
            <button
              key={t}
              onClick={() => {
                setTipo(t)
                setDesplazamiento(0)
              }}
              className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium ${
                tipo === t ? 'bg-white text-zinc-900 shadow-xs dark:bg-zinc-950 dark:text-zinc-100' : 'text-zinc-600 dark:text-zinc-400'
              }`}
            >
              {t === 'semana' ? 'Semanal' : 'Mensual'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button className="boton-secundario px-2" aria-label="Periodo anterior" onClick={() => setDesplazamiento((d) => d - 1)}>
            <ChevronLeft className="size-5" />
          </button>
          <p className="flex-1 text-center font-medium">{periodo.etiqueta}</p>
          <button className="boton-secundario px-2" aria-label="Periodo siguiente" disabled={futuro} onClick={() => setDesplazamiento((d) => d + 1)}>
            <ChevronRight className="size-5" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="mr-auto flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
            <input type="checkbox" checked={conceptos} onChange={(e) => cambiarConceptos(e.target.checked)} />
            Incluir los conceptos de los movimientos
          </label>
          {compartir && (
            <button className="boton-primario" disabled={!resumen || generando} onClick={() => generarPdf(false)}>
              <Share2 className="size-4" /> Compartir PDF
            </button>
          )}
          <button className={compartir ? 'boton-secundario' : 'boton-primario'} disabled={!resumen || generando} onClick={() => generarPdf(true)}>
            <Download className="size-4" /> {generando ? 'Generando…' : 'Descargar PDF'}
          </button>
        </div>
      </div>

      {error && <Aviso>{error}</Aviso>}
      {hayPrueba && (
        <div className="mb-4">
          <Aviso tipo="info">
            <span className="flex items-center gap-2">
              <FlaskConical className="size-4 text-amber-600" /> Hay datos de prueba. El PDF lo indica. Se eliminan en Ajustes, Herramientas.
            </span>
          </Aviso>
        </div>
      )}

      {!resumen ? <p className="text-sm text-zinc-500">Cargando…</p> : <VistaPrevia r={resumen} conceptos={conceptos} categorias={categorias ?? []} />}
    </>
  )
}

/** "Del 2 al 8 de noviembre" pasa a "Del 2 al 8"; "1 de noviembre", a "Día 1" */
function etiquetaSemana(etiqueta: string): string {
  const e = etiqueta.replace(/ de [a-z]+$/, '')
  return /^\d+$/.test(e) ? `Día ${e}` : e
}

function VistaPrevia({ r, conceptos, categorias }: { r: Resumen; conceptos: boolean; categorias: Categoria[] }) {
  const porId = new Map(categorias.map((c) => [c.id, c]))
  const nombreCategoria = (id: string | null) => {
    if (!id) return 'Sin categoría'
    const c = porId.get(id)
    const p = c?.padre_id ? porId.get(c.padre_id) : undefined
    return p ? `${p.nombre}, ${c?.nombre}` : c?.nombre ?? '?'
  }
  const esMes = r.periodo.tipo === 'mes'
  const anterior = r.anterior.nombreCorto
  const enCurso = textoEnCurso(r)

  return (
    <div className="space-y-4">
      {enCurso && <Aviso tipo="info">{enCurso}</Aviso>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {indicadores(r).map((i) => (
          <div key={i.etiqueta} className="tarjeta p-3">
            <p className="text-xs text-zinc-500">{i.etiqueta}</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums">{i.valor}</p>
            <p className={`mt-0.5 text-[11px] leading-tight ${TONO[i.comparacion.tono]}`}>{i.comparacion.texto}</p>
          </div>
        ))}
      </div>

      <section className="tarjeta">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">Gasto por categoría</h2>
          <span className="text-xs text-zinc-500">Diferencia frente a {anterior}</span>
        </div>
        {r.categorias.length === 0 ? (
          <p className="text-sm text-zinc-500">Sin gastos en el periodo.</p>
        ) : (
          <ul className="space-y-2.5">
            {r.categorias.map((c) => (
              <li key={c.id ?? 'sin'}>
                <div className="flex items-baseline gap-2 text-sm">
                  <span className="w-5 text-center">{c.icono ?? ''}</span>
                  <span className="flex-1 truncate">{c.nombre}</span>
                  <span className="font-medium tabular-nums">{formatearImporte(c.importe)}</span>
                  <span
                    className={`w-24 text-right text-xs tabular-nums ${
                      c.diferencia === null ? 'text-zinc-400' : c.diferencia > 0 ? TONO.malo : c.diferencia < 0 ? TONO.bueno : TONO.neutro
                    }`}
                  >
                    {c.diferencia === null ? 'nueva' : `${c.diferencia > 0 ? '+' : ''}${formatearImporte(c.diferencia)}`}
                  </span>
                </div>
                <div className="mt-1 ml-7 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                    <div className="h-full rounded-full" style={{ width: `${Math.max(1, c.peso * 100)}%`, backgroundColor: c.color }} />
                  </div>
                  <span className="w-12 text-right text-[11px] text-zinc-500 tabular-nums">{porcentaje(c.peso)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {esMes && (
        <section className="tarjeta overflow-x-auto">
          <h2 className="mb-2 text-sm font-semibold">Semana a semana <span className="font-normal text-zinc-500">({r.periodo.etiqueta.split(' de ')[0].toLowerCase()})</span></h2>
          <table className="w-full text-xs sm:text-sm">
            <thead className="text-xs text-zinc-500">
              <tr>
                <th className="py-1 text-left font-medium">Semana</th>
                <th className="py-1 text-right font-medium">Ingresos</th>
                <th className="py-1 text-right font-medium">Gastos</th>
                <th className="py-1 text-right font-medium">Ahorro</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {r.semanas.map((s) => (
                <tr key={s.periodo.inicio} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="py-1.5 pr-2">{etiquetaSemana(s.periodo.etiqueta)}</td>
                  <td className="py-1.5 pl-2 text-right whitespace-nowrap">{formatearImporte(s.ingresos)}</td>
                  <td className="py-1.5 pl-2 text-right whitespace-nowrap">{formatearImporte(s.gastos)}</td>
                  <td className={`py-1.5 pl-2 text-right whitespace-nowrap ${s.ahorro >= 0 ? TONO.bueno : TONO.malo}`}>{formatearImporte(s.ahorro)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {!esMes && (
        <section className="tarjeta">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold">Movimientos de la semana</h2>
            <span className="text-xs text-zinc-500">En gris, los que no computan</span>
          </div>
          {r.movimientos.length === 0 ? (
            <p className="text-sm text-zinc-500">Sin movimientos en la semana.</p>
          ) : (
            <ul className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
              {r.movimientos.map((m) => {
                const fuera = m.tipo !== 'normal'
                return (
                  <li key={m.id} className={`flex items-baseline gap-3 py-1.5 ${fuera ? 'text-zinc-400 italic' : ''}`}>
                    <span className="w-24 shrink-0 text-xs text-zinc-500">{diaSemana(m.fecha_operacion)}</span>
                    <span className="min-w-0 flex-1 truncate">
                      {conceptos ? m.concepto_limpio : nombreCategoria(m.categoria_id)}
                      {conceptos && (
                        <span className="block truncate text-xs text-zinc-500 not-italic">{fuera ? NOMBRE_TIPO_MOVIMIENTO[m.tipo] : nombreCategoria(m.categoria_id)}</span>
                      )}
                    </span>
                    <span className={`tabular-nums ${!fuera && m.importe > 0 ? TONO.bueno : ''}`}>{formatearImporte(m.importe)}</span>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      )}

      <section className="tarjeta">
        <h2 className="mb-2 text-sm font-semibold">Fuera del extracto</h2>
        <ul className="space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
          {lineasFueraDelExtracto(r).map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </section>
    </div>
  )
}
