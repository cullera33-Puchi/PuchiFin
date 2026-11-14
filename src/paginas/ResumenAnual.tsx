import { Share2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BarraNavegacion } from '../componentes/Encabezado'
import { Baldosa } from '../componentes/Icono'
import { useInterfaz } from '../componentes/Interfaz'
import { opcionesAnios, TiraPeriodos } from '../componentes/TiraPeriodos'
import { contarDatosPrueba } from '../datos/operaciones'
import { useDatos } from '../datos/ProveedorDatos'
import { resumenAnual } from '../lib/anual'
import { compartirArchivo } from '../lib/compartir'
import { hoyIso, mesLargo } from '../lib/fechas'
import { formatearRedondo } from '../lib/formato'
import { registrar } from '../lib/registro'
import { porcentaje } from '../lib/resumen'

const VERDE = 'text-[#248A3D] dark:text-[#30D158]'
const ROJO = 'text-[#D70015] dark:text-[#FF6961]'

/** Diferencia frente al año anterior, con color */
function Dif({ n, subirEsBueno }: { n: number; subirEsBueno: boolean }) {
  if (Math.abs(n) < 1) return null
  return <span className={`text-[12px] ${n > 0 === subirEsBueno ? VERDE : ROJO}`}>{`${n > 0 ? '+' : '−'}${formatearRedondo(Math.abs(n))}`}</span>
}

/**
 * Resumen del año (R5, v0.34.0): totales frente al año anterior, mejor y peor mes, categorías y comercios
 * que más pesan, gasto fijo, deuda y capital. Se comparte en PDF.
 */
export function ResumenAnual() {
  const db = useDatos()
  const { avisar } = useInterfaz()
  const hoy = hoyIso()
  const [params, setParams] = useSearchParams()
  const anio = params.get('anio') ?? hoy.slice(0, 4)
  const r = useMemo(() => resumenAnual(db, anio, hoy), [db, anio, hoy])
  const primero = useMemo(() => db.movimientos.reduce((min, m) => (m.fecha_operacion < min ? m.fecha_operacion : min), hoy), [db.movimientos, hoy])
  const [generando, setGenerando] = useState(false)
  const t = r.totales
  const a = r.anterior
  const compartir = async () => {
    setGenerando(true)
    try {
      const { generarPdfAnual } = await import('../lib/pdf')
      const doc = generarPdfAnual(r, { hayDatosPrueba: contarDatosPrueba(db) > 0 })
      registrar('info', 'Resumen del año en PDF', { anio, paginas: doc.getNumberOfPages() })
      const res = await compartirArchivo(doc.output('blob'), `PuchiFin resumen ${anio}.pdf`, `Resumen del año ${anio}`)
      if (res === 'descargado') avisar('PDF descargado')
    } catch (e) {
      registrar('error', `PDF del año: ${(e as Error).message}`)
      avisar('No se pudo generar el PDF')
    } finally {
      setGenerando(false)
    }
  }
  const casilla = (etiqueta: string, valor: number, antes: number | undefined, subirEsBueno: boolean) => (
    <div className="tarjeta px-3 py-2.5">
      <p className="text-[12px] text-zinc-500">{etiqueta}</p>
      <p className="text-[20px] font-semibold tabular-nums">{formatearRedondo(valor)}</p>
      {antes !== undefined && Math.abs(valor - antes) >= 1 && (
        <p className="text-[12px] tabular-nums">
          <Dif n={valor - antes} subirEsBueno={subirEsBueno} /> <span className="text-zinc-500">frente a {Number(anio) - 1}</span>
        </p>
      )}
    </div>
  )

  return (
    <>
      <BarraNavegacion titulo="Resumen del año" atras="Informes" subtitulo={r.enCurso ? `En curso, ${r.meses} meses con datos` : `${r.meses} meses con datos`} />
      <div className="mb-3">
        <TiraPeriodos etiqueta="Año del resumen" opciones={opcionesAnios(primero, hoy)} valor={anio} onElegir={(x) => setParams({ anio: x }, { replace: true })} />
      </div>
      {!r.meses ? (
        <p className="tarjeta text-center text-[15px] text-zinc-500">Sin movimientos en {anio}.</p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {casilla('Ingresos', t.ingresos, a?.ingresos, true)}
            {casilla('Gastos', t.gastos, a?.gastos, false)}
            {casilla('Ahorro', t.ahorro, a?.ahorro, true)}
            <div className="tarjeta px-3 py-2.5">
              <p className="text-[12px] text-zinc-500">Tasa de ahorro</p>
              <p className="text-[20px] font-semibold tabular-nums">{t.tasaAhorro === null ? '—' : porcentaje(t.tasaAhorro)}</p>
              {a?.tasaAhorro != null && <p className="text-[12px] text-zinc-500 tabular-nums">{`${porcentaje(a.tasaAhorro)} en ${Number(anio) - 1}`}</p>}
            </div>
          </div>
          {r.enCurso && a && <p className="-mt-2 px-1 text-[12px] text-zinc-500">El año está en curso: se compara con los mismos días de {Number(anio) - 1}.</p>}

          <section>
            <h3 className="cabecera-grupo">El año en cifras</h3>
            <ul className="lista divide-y divide-zinc-200/70 text-[15px] dark:divide-zinc-800">
              <li className="fila min-h-11">
                <span className="flex-1">Gasto medio al mes</span>
                <span className="tabular-nums">{formatearRedondo(r.gastoMedioMes)}</span>
              </li>
              <li className="fila min-h-11">
                <span className="flex-1">Recibos y suscripciones</span>
                <span className="tabular-nums">{formatearRedondo(r.fijo)}</span>
              </li>
              {r.mejorMes && (
                <li className="fila min-h-11">
                  <span className="flex-1">Mes de más ahorro: {mesLargo(`${r.mejorMes.mes}-01`).split(' de ')[0].toLowerCase()}</span>
                  <span className={`tabular-nums ${VERDE}`}>{formatearRedondo(r.mejorMes.ahorro)}</span>
                </li>
              )}
              {r.peorMes && (
                <li className="fila min-h-11">
                  <span className="flex-1">Mes de menos ahorro: {mesLargo(`${r.peorMes.mes}-01`).split(' de ')[0].toLowerCase()}</span>
                  <span className={`tabular-nums ${r.peorMes.ahorro < 0 ? ROJO : ''}`}>{formatearRedondo(r.peorMes.ahorro)}</span>
                </li>
              )}
              {r.capital && r.capital.inicio !== null && (
                <li className="fila min-h-11">
                  <span className="flex-1">Capital: de {formatearRedondo(r.capital.inicio)} a</span>
                  <span className="tabular-nums">
                    {formatearRedondo(r.capital.fin)} <Dif n={r.capital.fin - r.capital.inicio} subirEsBueno />
                  </span>
                </li>
              )}
              {r.deuda && (
                <li className="fila min-h-11">
                  <span className="flex-1">Pagado de la deuda en {anio}</span>
                  <span className="tabular-nums">
                    {formatearRedondo(r.deuda.pagado)} <span className="text-[12px] text-zinc-500">quedan {formatearRedondo(r.deuda.pendiente)}</span>
                  </span>
                </li>
              )}
            </ul>
          </section>

          {r.categorias.length > 0 && (
            <section>
              <h3 className="cabecera-grupo">Categorías que más pesan</h3>
              <ul className="lista divide-y divide-zinc-200/70 dark:divide-zinc-800">
                {r.categorias.map((c) => (
                  <li key={c.id ?? 'sin'} className="fila min-h-12">
                    <Baldosa icono={c.icono} color={c.color} tamano="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px]">{c.nombre}</span>
                      <span className="block text-[12px] text-zinc-500 tabular-nums">
                        {porcentaje(c.peso)}
                        {a ? `, ${formatearRedondo(c.anterior)} en ${Number(anio) - 1}` : ''}
                      </span>
                    </span>
                    <span className="text-[15px] tabular-nums">{formatearRedondo(c.importe)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {r.comercios.length > 0 && (
            <section>
              <h3 className="cabecera-grupo">Comercios con más gasto</h3>
              <ol className="lista divide-y divide-zinc-200/70 dark:divide-zinc-800">
                {r.comercios.map((c, i) => (
                  <li key={c.clave} className="fila min-h-12">
                    <span className="w-5 text-right text-[13px] text-zinc-500 tabular-nums">{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px]">{c.nombre}</span>
                      <span className="block text-[12px] text-zinc-500">{c.veces === 1 ? '1 compra' : `${c.veces} compras`}</span>
                    </span>
                    <span className="text-[15px] tabular-nums">{formatearRedondo(c.importe)}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <button className="boton-primario w-full" disabled={generando} onClick={compartir}>
            <Share2 className="size-4" strokeWidth={2} /> {generando ? 'Generando…' : `Compartir el resumen de ${anio} en PDF`}
          </button>
        </div>
      )}
    </>
  )
}
