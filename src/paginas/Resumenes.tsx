import { ChevronLeft, ChevronRight, Download, FlaskConical, Share2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Aviso, BarraNavegacion } from '../componentes/Encabezado'
import { Deslizable } from '../componentes/gestos'
import { Baldosa } from '../componentes/Icono'
import { FilaInterruptor, Segmentado, useInterfaz } from '../componentes/Interfaz'
import { compartirArchivo, puedeCompartirArchivos } from '../lib/compartir'
import { contarDatosPrueba } from '../datos/operaciones'
import { useDatos } from '../datos/ProveedorDatos'
import { diaSemana, hoyIso } from '../lib/fechas'
import { calcularPlan, escenarioNominas, supuestosCrecimiento } from '../lib/plan'
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
  type Periodo,
  type Resumen,
  type TipoPeriodo,
  type Tono,
} from '../lib/resumen'
import { NOMBRE_TIPO_MOVIMIENTO, type Categoria } from '../lib/tipos'

const CLAVE_CONCEPTOS = 'puchifin-resumen-conceptos'
const CLAVE_VERSION = 'puchifin-resumen-version'
const CLAVE_PLAN = 'puchifin-resumen-plan'
const TONO: Record<Tono, string> = {
  bueno: 'text-emerald-700 dark:text-emerald-400',
  malo: 'text-red-700 dark:text-red-400',
  neutro: 'text-zinc-500',
}

function leerPreferencia(clave: string, porDefecto: string): string {
  try {
    return localStorage.getItem(clave) ?? porDefecto
  } catch {
    return porDefecto
  }
}

function guardarPreferencia(clave: string, valor: string) {
  try {
    localStorage.setItem(clave, valor)
  } catch {
    // sin almacenamiento
  }
}

export function Resumenes() {
  const { avisar } = useInterfaz()
  const [tipo, setTipo] = useState<TipoPeriodo>('mes')
  const [desplazamiento, setDesplazamiento] = useState(0)
  const db = useDatos()
  const categorias = db.categorias
  const hayPrueba = contarDatosPrueba(db) > 0
  const [conceptos, setConceptos] = useState(() => leerPreferencia(CLAVE_CONCEPTOS, 'si') !== 'no')
  const [conPlan, setConPlan] = useState(() => leerPreferencia(CLAVE_PLAN, 'si') !== 'no')
  const hayPlan = useMemo(() => !!calcularPlan(db, hoyIso()).plan, [db])
  const escenario = useMemo(() => escenarioNominas(db), [db])
  const cambiarPlan = (v: boolean) => {
    setConPlan(v)
    guardarPreferencia(CLAVE_PLAN, v ? 'si' : 'no')
  }
  const [reducida, setReducida] = useState(() => leerPreferencia(CLAVE_VERSION, 'completa') === 'reducida')
  const [error, setError] = useState<string | null>(null)
  const [generando, setGenerando] = useState(false)

  const periodo: Periodo = useMemo(() => desplazarPeriodo(periodoDe(tipo, hoyIso()), desplazamiento), [tipo, desplazamiento])
  const resumen: Resumen = useMemo(
    () => calcularResumen(periodo, db.movimientos, categorias, 10, hoyIso()),
    [periodo, db.movimientos, categorias],
  )

  const cambiarConceptos = (v: boolean) => {
    setConceptos(v)
    guardarPreferencia(CLAVE_CONCEPTOS, v ? 'si' : 'no')
  }
  const cambiarVersion = (v: 'completa' | 'reducida') => {
    setReducida(v === 'reducida')
    guardarPreferencia(CLAVE_VERSION, v)
  }

  const generarPdf = async (descargar: boolean) => {
    setGenerando(true)
    try {
      const { generarPdfResumen, nombreArchivoResumen } = await import('../lib/pdf')
      // Plan de pagos: el actual y con las nóminas que no cuentan (la segunda), calculados al generar
      const actual = hayPlan && conPlan ? calcularPlan(db, hoyIso()).plan : null
      const otro = actual && escenario ? calcularPlan(db, hoyIso(), escenario.sim).plan : null
      const plan = actual ? { actual, conNominas: otro && escenario ? { nombres: escenario.nombres, plan: otro } : null, supuestos: supuestosCrecimiento(db) } : null
      const doc = generarPdfResumen(resumen, { incluirConceptos: conceptos, hayDatosPrueba: hayPrueba, categorias, reducida, plan })
      const nombre = nombreArchivoResumen(resumen, reducida)
      registrar('info', `Resumen ${resumen.periodo.tipo === 'mes' ? 'mensual' : 'semanal'} en PDF`, { periodo: resumen.periodo.inicio, paginas: doc.getNumberOfPages(), conceptos, reducida, plan: !!plan })
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
      <BarraNavegacion titulo="Resúmenes" atras="Extracto" subtitulo="Semanal y mensual, en PDF para compartir" />

      <div className="mb-4 space-y-3">
        <Segmentado
          etiqueta="Periodo"
          opciones={[['semana', 'Semanal'], ['mes', 'Mensual']]}
          valor={tipo}
          onCambio={(t) => {
            setTipo(t)
            setDesplazamiento(0)
          }}
        />

        <div className="flex items-center gap-2">
          <button className="boton-icono" aria-label="Periodo anterior" onClick={() => setDesplazamiento((d) => d - 1)}>
            <ChevronLeft className="size-6" strokeWidth={2} />
          </button>
          <p className="flex-1 text-center font-semibold">{periodo.etiqueta}</p>
          <button className="boton-icono" aria-label="Periodo siguiente" disabled={futuro} onClick={() => setDesplazamiento((d) => d + 1)}>
            <ChevronRight className="size-6" strokeWidth={2} />
          </button>
        </div>

        <div className="tarjeta space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-sm">PDF</span>
            <div className="flex-1">
              <Segmentado
                etiqueta="Versión del PDF"
                opciones={[['completa', 'Completo'], ['reducida', 'Para compartir']]}
                valor={reducida ? 'reducida' : 'completa'}
                onCambio={cambiarVersion}
              />
            </div>
          </div>
          {reducida ? (
            <p className="text-xs text-zinc-500">Solo ingresos, gastos, ahorro y gasto por categoría, sin movimientos ni lo que queda fuera del extracto. El plan de pagos va si lo incluyes.</p>
          ) : (
            <FilaInterruptor texto="Incluir los conceptos" nota="Sin ellos, solo fechas, categorías e importes" activo={conceptos} onCambio={cambiarConceptos} />
          )}
          {hayPlan && (
            <FilaInterruptor
              texto="Incluir el plan de pagos"
              nota={escenario ? `El actual y con ${escenario.nombres.join(' y ')}, con el capital previsto` : 'Pago de cada verano, deuda y capital previsto'}
              activo={conPlan}
              onCambio={cambiarPlan}
            />
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {compartir && (
            <button className="boton-primario" disabled={generando} onClick={() => generarPdf(false)}>
              <Share2 className="size-4" /> Compartir PDF
            </button>
          )}
          <button className={compartir ? 'boton-secundario' : 'boton-primario'} disabled={generando} onClick={() => generarPdf(true)}>
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

      <Deslizable onAnterior={() => setDesplazamiento((d) => d - 1)} onSiguiente={() => setDesplazamiento((d) => d + 1)} haySiguiente={!futuro}>
        <VistaPrevia r={resumen} conceptos={conceptos} reducida={reducida} categorias={categorias} />
      </Deslizable>
    </>
  )
}

/** "Del 2 al 8 de noviembre" pasa a "Del 2 al 8"; "1 de noviembre", a "Día 1" */
function etiquetaSemana(etiqueta: string): string {
  const e = etiqueta.replace(/ de [a-z]+$/, '')
  return /^\d+$/.test(e) ? `Día ${e}` : e
}

function VistaPrevia({ r, conceptos, reducida, categorias }: { r: Resumen; conceptos: boolean; reducida: boolean; categorias: Categoria[] }) {
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
      <div className="grid grid-cols-2 gap-3">
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
                  <span className="self-center">
                    <Baldosa icono={c.icono} color={c.color} tamano="sm" />
                  </span>
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
                <div className="mt-1 ml-9 flex items-center gap-2">
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

      {esMes && !reducida && (
        <section className="tarjeta overflow-x-auto">
          <h2 className="mb-2 text-sm font-semibold">Semana a semana <span className="font-normal text-zinc-500">({r.periodo.etiqueta.split(' de ')[0].toLowerCase()})</span></h2>
          <table className="w-full text-xs">
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

      {!esMes && !reducida && (
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

      {!reducida && lineasFueraDelExtracto(r).length > 0 && (
      <section className="tarjeta">
        <h2 className="mb-2 text-sm font-semibold">Fuera del extracto</h2>
        <ul className="space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
          {lineasFueraDelExtracto(r).map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </section>
      )}
    </div>
  )
}
