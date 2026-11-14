import { CalendarClock, ChevronRight, Repeat, Sparkles, TrendingUp, TriangleAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BarraNavegacion } from '../componentes/Encabezado'
import { Baldosa } from '../componentes/Icono'
import { HojaClaude } from '../componentes/HojaClaude'
import { useDatos } from '../datos/ProveedorDatos'
import { esPasarela } from '../lib/conceptos'
import { hoyIso } from '../lib/fechas'
import { formatearFecha, formatearImporte, formatearRedondo, plural } from '../lib/formato'
import { mesEfectivo } from '../lib/imputacion'
import { textoOptimizar } from '../lib/optimizar'
import { avisosRecurrentes, detectarRecurrentes, fijoYVariable, NOMBRE_PERIODICIDAD, resumenFijos, type Recurrente, type TipoAviso } from '../lib/recurrentes'
import { calcularTotales } from '../lib/resumen'
import { nombreCategoria } from '../lib/vista'

const ICONO_AVISO: Record<TipoAviso, { glifo: typeof TrendingUp; color: string }> = {
  subida: { glifo: TrendingUp, color: '#FF3B30' },
  no_llega: { glifo: TriangleAlert, color: '#FF9500' },
  nuevo: { glifo: Repeat, color: '#5856D6' },
}

/**
 * Gastos fijos y recurrentes: lo que se cobra solo cada mes, cada trimestre o cada año. Coste
 * mensual y anual, fijo frente a variable este mes, avisos, próximos cargos y optimizar con Claude.
 */
export function Fijos() {
  const db = useDatos()
  const navegar = useNavigate()
  const hoy = hoyIso()
  const recurrentes = useMemo(() => detectarRecurrentes(db), [db])
  const r = useMemo(() => resumenFijos(recurrentes, hoy), [recurrentes, hoy])
  const avisos = useMemo(() => avisosRecurrentes(db, recurrentes), [db, recurrentes])
  const mes = hoy.slice(0, 7)
  const reparto = useMemo(() => {
    const delMes = db.movimientos.filter((m) => mesEfectivo(m) === mes)
    const gastos = calcularTotales(delMes, db.categorias).gastos
    const { fijo } = fijoYVariable(delMes, recurrentes)
    return { fijo, variable: Math.max(0, Math.round((gastos - fijo) * 100) / 100) }
  }, [db, mes, recurrentes])
  const [verBajas, setVerBajas] = useState(false)
  const [optimizar, setOptimizar] = useState(false)
  const bajas = recurrentes.filter((x) => !x.activo)
  // En PayPal, los cargos de ese importe
  const abrir = (x: Recurrente) =>
    navegar(`/movimientos?q=${encodeURIComponent(x.comercio)}${esPasarela(x.comercio) ? `&min=${x.importe}&max=${x.importe}` : ''}`)

  return (
    <>
      <BarraNavegacion titulo="Gastos fijos" atras="Informes" subtitulo={r.activos.length ? plural(r.activos.length, 'cargo recurrente', 'cargos recurrentes') : undefined} />
      {!recurrentes.length ? (
        <p className="tarjeta text-center text-[15px] text-zinc-500">Aún no hay cargos que se repitan. Con tres meses de datos aparecen los recibos y las suscripciones.</p>
      ) : (
        <div className="space-y-4">
          <section className="tarjeta">
            <p className="text-[13px] text-zinc-500">Lo que se cobra solo</p>
            <p className="text-[28px] leading-tight font-bold tabular-nums">{formatearRedondo(r.alMes)} al mes</p>
            <p className="text-[13px] text-zinc-500 tabular-nums">{formatearRedondo(r.alAno)} al año</p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[13px]">
              <div className="rounded-xl bg-zinc-100 px-3 py-2 dark:bg-zinc-800">
                <span className="block text-zinc-500">Fijo este mes</span>
                <span className="text-[17px] font-semibold tabular-nums">{formatearRedondo(reparto.fijo)}</span>
              </div>
              <div className="rounded-xl bg-zinc-100 px-3 py-2 dark:bg-zinc-800">
                <span className="block text-zinc-500">Variable este mes</span>
                <span className="text-[17px] font-semibold tabular-nums">{formatearRedondo(reparto.variable)}</span>
              </div>
            </div>
            <button className="boton-primario mt-3 w-full" onClick={() => setOptimizar(true)}>
              <Sparkles className="size-4" strokeWidth={2} /> Optimizar con Claude
            </button>
          </section>

          {avisos.length > 0 && (
            <section>
              <h3 className="cabecera-grupo">Avisos</h3>
              <ul className="lista divide-y divide-zinc-200/70 dark:divide-zinc-800">
                {avisos.map((a) => {
                  const i = ICONO_AVISO[a.tipo]
                  return (
                    <li key={`${a.tipo}|${a.clave}`} className="fila">
                      <Baldosa glifo={i.glifo} color={i.color} tamano="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px]">{a.nombre}</span>
                        <span className="block text-[12px] text-zinc-500">{a.texto}</span>
                      </span>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}

          {r.proximos.length > 0 && (
            <section>
              <h3 className="cabecera-grupo">Próximos 30 días</h3>
              <ul className="lista divide-y divide-zinc-200/70 dark:divide-zinc-800">
                {r.proximos.map((x) => (
                  <li key={x.clave} className="fila">
                    <Baldosa glifo={CalendarClock} color="#007AFF" tamano="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px]">{x.nombre}</span>
                      <span className="block text-[12px] text-zinc-500">Hacia el {formatearFecha(x.proxima)}</span>
                    </span>
                    <span className="text-[15px] tabular-nums">{x.variable ? 'unos ' : ''}{formatearImporte(x.importe)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-1 px-4 text-[12px] text-zinc-500">
                Total previsto: {formatearRedondo(r.proximos.reduce((s, x) => s + x.importe, 0))}. Fecha estimada con los cargos anteriores.
              </p>
            </section>
          )}

          <section>
            <h3 className="cabecera-grupo">Todos los fijos</h3>
            <ul className="lista divide-y divide-zinc-200/70 dark:divide-zinc-800">
              {r.activos.map((x) => (
                <li key={x.clave}>
                  <button className="fila min-h-14 w-full active:bg-zinc-100 dark:active:bg-zinc-800" onClick={() => abrir(x)}>
                    <span className="min-w-0 flex-1 text-left">
                      <span className="block truncate text-[15px]">{x.nombre}</span>
                      <span className="block truncate text-[12px] text-zinc-500">
                        {NOMBRE_PERIODICIDAD[x.periodicidad]}, {nombreCategoria(db, x.categoria_id)}
                        {x.variable ? ', importe variable' : ''}
                      </span>
                      {x.subida && (
                        <span className="block text-[12px] text-[#D70015] dark:text-[#FF6961]">
                          Subió de {formatearImporte(x.subida.antes)} a {formatearImporte(x.subida.ahora)}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-[15px] tabular-nums">{formatearImporte(x.importe)}</span>
                      <span className="block text-[11px] text-zinc-500 tabular-nums">{formatearRedondo(x.alAno)} al año</span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-zinc-400" />
                  </button>
                </li>
              ))}
            </ul>
          </section>

          {bajas.length > 0 && (
            <section>
              <button className="boton-texto px-4" onClick={() => setVerBajas((v) => !v)}>
                {verBajas ? 'Ocultar' : 'Ver'} {plural(bajas.length, 'cargo que ya no se cobra', 'cargos que ya no se cobran')}
              </button>
              {verBajas && (
                <ul className="lista mt-2 divide-y divide-zinc-200/70 dark:divide-zinc-800">
                  {bajas.map((x) => (
                    <li key={x.clave} className="fila text-zinc-500">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px]">{x.nombre}</span>
                        <span className="block text-[12px]">Último cargo el {formatearFecha(x.ultima)}</span>
                      </span>
                      <span className="text-[15px] tabular-nums">{formatearImporte(x.importe)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
          <p className="px-4 text-[12px] text-zinc-500">
            Se detectan solos: cargos del mismo comercio con una periodicidad regular (mensual, cada dos meses, trimestral, semestral o anual) y un importe parecido.
          </p>
        </div>
      )}
      <HojaOptimizar abierta={optimizar} recurrentes={recurrentes} onCerrar={() => setOptimizar(false)} />
    </>
  )
}

/** Texto para Claude con los fijos y los gastos hormiga */
function HojaOptimizar({ abierta, recurrentes, onCerrar }: { abierta: boolean; recurrentes: Recurrente[]; onCerrar: () => void }) {
  const db = useDatos()
  const texto = useMemo(() => (abierta ? textoOptimizar(db, recurrentes, hoyIso()) : ''), [abierta, db, recurrentes])
  // Detalle: los cargos de los fijos activos
  const detalle = useMemo(() => {
    if (!abierta) return undefined
    const ids = new Set(recurrentes.filter((r) => r.activo).flatMap((r) => r.ids))
    return { movimientos: db.movimientos.filter((m) => ids.has(m.id)), archivo: 'puchifin-gastos-fijos.csv' }
  }, [abierta, db, recurrentes])
  return (
    <HojaClaude
      abierta={abierta}
      titulo="Optimizar con Claude"
      explicacion="Claude revisa tus fijos y gastos hormiga: suscripciones que sobran, tarifas de luz, fibra y seguros mejores y qué recortar."
      texto={texto}
      archivo="puchifin-gastos-fijos.txt"
      registro="Optimizar con Claude"
      detalle={detalle}
      onCerrar={onCerrar}
    />
  )
}
